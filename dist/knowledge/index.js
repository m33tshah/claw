/**
 * MESNIUM KNOWLEDGE LAYER — MASTER MANAGER & API (PHASE 8)
 * 
 * Unified interface for Mesnium Knowledge:
 * Sources -> Ingestion -> Semantic Chunking -> Local Embeddings -> FTS5/Vector Storage -> Hybrid Retrieval
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MesniumKnowledgeStore, resolveDefaultKnowledgeDbPath } from './store.js';
import { getEmbeddingProvider } from './embeddings.js';
import { chunkDocument } from './chunker.js';
import { MesniumHybridRetriever } from './retriever.js';
import { DocumentStatus, SourceType } from './types.js';
import { extractGeneralFile } from '../extensions/document-extract/document-extractor.js';

export class MesniumKnowledgeManager {
  constructor(options = {}) {
    this.options = options;
    this.store = new MesniumKnowledgeStore(options.dbPath);
    this.embeddingProvider = getEmbeddingProvider(options.embeddingConfig || {});
    this.retriever = new MesniumHybridRetriever(this.store, this.embeddingProvider);
  }

  // --- SOURCE MANAGEMENT ---
  addSource({ workspaceId = 'default', path: srcPath, name = null, type = SourceType.LOCAL_FOLDER }) {
    if (!srcPath) throw new Error('Source path is required');
    const resolvedPath = path.resolve(srcPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Source path does not exist: ${resolvedPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    const actualType = stat.isDirectory() ? SourceType.LOCAL_FOLDER : SourceType.LOCAL_FILE;

    return this.store.createSource({
      workspaceId,
      path: resolvedPath,
      name: name || path.basename(resolvedPath),
      type: actualType
    });
  }

  listSources(workspaceId = 'default') {
    return this.store.listSources(workspaceId);
  }

  getSource(sourceId) {
    return this.store.getSource(sourceId);
  }

  // --- RECURSIVE DISCOVERY ---
  discoverFiles(targetPath) {
    const files = [];
    const supportedExts = new Set([
      '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
      '.pdf', '.csv', '.tsv', '.json', '.txt', '.md', '.markdown'
    ]);

    const scan = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip hidden folders and node_modules
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (supportedExts.has(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      scan(targetPath);
    } else if (stat.isFile()) {
      files.push(targetPath);
    }

    return files;
  }

  // --- INGESTION & INDEXING PIPELINE ---
  async indexSource(sourceId, options = {}) {
    const { onProgress = null, force = false } = options;
    const source = this.store.getSource(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);

    const filePaths = this.discoverFiles(source.path);
    const totalFiles = filePaths.length;
    const summary = {
      sourceId,
      totalDiscovered: totalFiles,
      indexed: 0,
      skippedUnchanged: 0,
      failed: 0,
      totalChunks: 0,
      startTime: Date.now(),
      durationMs: 0
    };

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      const filename = path.basename(filePath);

      onProgress?.({
        stage: 'indexing',
        currentFile: filename,
        currentIndex: i + 1,
        totalFiles,
        percent: Math.round(((i + 1) / totalFiles) * 100)
      });

      try {
        const res = await this.indexFile(filePath, {
          sourceId: source.id,
          workspaceId: source.workspace_id,
          force
        });

        if (res.skipped) {
          summary.skippedUnchanged++;
        } else {
          summary.indexed++;
          summary.totalChunks += res.chunkCount || 0;
        }
      } catch (err) {
        console.error(`[Mesnium Knowledge] Failed to index ${filename}:`, err);
        summary.failed++;
      }
    }

    summary.durationMs = Date.now() - summary.startTime;
    return summary;
  }

  async indexFile(filePath, { sourceId, workspaceId = 'default', collectionId = null, force = false } = {}) {
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
    const buffer = fs.readFileSync(filePath);
    const sizeBytes = buffer.length;
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // 1. Check if unchanged in store
    const upsertRes = this.store.upsertDocument({
      sourceId,
      workspaceId,
      collectionId,
      uri: filePath,
      filename,
      extension: ext,
      sizeBytes,
      checksum,
      metadata: { indexedPath: filePath }
    });

    if (upsertRes.isUnchanged && !force) {
      return { skipped: true, document: upsertRes.document };
    }

    const doc = upsertRes.document;

    // 2. Structured Extraction (Tier 1 extractors)
    let extractedText = '';
    let docMetadata = {};

    if (['txt', 'md', 'markdown'].includes(ext)) {
      extractedText = buffer.toString('utf8');
    } else {
      const extractRes = await extractGeneralFile({
        buffer,
        filename,
        fileName: filename,
        mimeType: undefined
      });
      extractedText = extractRes ? extractRes.text : buffer.toString('utf8');
      docMetadata = extractRes ? (extractRes.metadata || {}) : {};
    }

    // 3. Semantic Chunking
    this.store.setDocumentStatus(doc.id, DocumentStatus.CHUNKING);
    const rawChunks = chunkDocument(doc, extractedText);

    // 4. Generate Embeddings for Chunks
    this.store.setDocumentStatus(doc.id, DocumentStatus.INDEXING);
    const chunkTexts = rawChunks.map(c => c.content);
    const embeddings = await this.embeddingProvider.embedDocuments(chunkTexts);

    const chunksWithEmbeddings = rawChunks.map((chunk, idx) => ({
      ...chunk,
      embedding: embeddings[idx]
    }));

    // 5. Store into SQLite + FTS5
    this.store.saveChunks(doc.id, sourceId, workspaceId, collectionId, chunksWithEmbeddings);

    return {
      skipped: false,
      document: this.store.getDocument(doc.id),
      chunkCount: chunksWithEmbeddings.length
    };
  }

  // --- RETRIEVAL ---
  async search(query, options = {}) {
    return this.retriever.search(query, options);
  }

  async buildAgentContext(query, options = {}) {
    return this.retriever.buildAgentContext(query, options);
  }

  // --- STATS & MANAGEMENT ---
  getStats(workspaceId = 'default') {
    return this.store.getStats(workspaceId);
  }

  listDocuments(workspaceId = 'default', sourceId = null) {
    return this.store.listDocuments(workspaceId, sourceId);
  }

  getDocument(docId) {
    return this.store.getDocument(docId);
  }

  close() {
    this.store.close();
  }
}
