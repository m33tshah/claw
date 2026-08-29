/**
 * MESNIUM KNOWLEDGE LAYER — SQLITE + FTS5 + VECTOR STORAGE ENGINE (PHASE 8)
 * 
 * Provides:
 * 1. Native SQLite WAL database management via node:sqlite DatabaseSync
 * 2. Full-text search index (FTS5 with BM25 ranking)
 * 3. Dense vector index & cosine similarity search
 * 4. Workspace & source boundary isolation
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { vectorToBlob, blobToVector, cosineSimilarity } from './embeddings.js';
import { DocumentStatus, SourceType } from './types.js';

export function resolveDefaultKnowledgeDbPath() {
  const homeDir = os.homedir();
  const knowledgeDir = path.join(homeDir, '.openclaw', 'knowledge');
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
  }
  return path.join(knowledgeDir, 'mesnium-knowledge.sqlite');
}

export class MesniumKnowledgeStore {
  constructor(dbPath = null) {
    this.dbPath = dbPath || resolveDefaultKnowledgeDbPath();
    this.db = null;
    this.init();
  }

  init() {
    const isMemory = this.dbPath === ':memory:';
    if (!isMemory) {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);

    // Performance optimizations
    if (!isMemory) {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');

    // 1. Workspaces
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // 2. Sources (Local folder, file, etc.)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        config_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_indexed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_sources_workspace ON sources(workspace_id);
    `);

    // 3. Collections (Logical groupings)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_collections_workspace ON collections(workspace_id);
    `);

    // 4. Documents
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        collection_id TEXT,
        uri TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        indexed_at INTEGER,
        FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_docs_source ON documents(source_id);
      CREATE INDEX IF NOT EXISTS idx_docs_workspace ON documents(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_docs_checksum ON documents(checksum);
    `);

    // 5. Chunks
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        collection_id TEXT,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        embedding_blob BLOB,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON chunks(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);
    `);

    // 6. FTS5 Virtual Table for BM25 Lexical Search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        id UNINDEXED,
        content,
        provenance_text,
        tokenize='unicode61'
      );
    `);

    // Ensure default workspace exists
    const defaultWs = this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get('default');
    if (!defaultWs) {
      this.db.prepare('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)').run('default', 'Default Workspace', Date.now());
    }
  }

  // --- SOURCE MANAGEMENT ---
  createSource({ id = null, workspaceId = 'default', type = SourceType.LOCAL_FOLDER, path: srcPath, name = null }) {
    const srcId = id || `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const srcName = name || path.basename(srcPath) || 'Local Source';
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO sources (id, workspace_id, type, path, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(srcId, workspaceId, type, srcPath, srcName, 'ready', now, now);

    return this.getSource(srcId);
  }

  getSource(sourceId) {
    return this.db.prepare('SELECT * FROM sources WHERE id = ?').get(sourceId) || null;
  }

  listSources(workspaceId = 'default') {
    return this.db.prepare('SELECT * FROM sources WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId);
  }

  // --- DOCUMENT MANAGEMENT ---
  upsertDocument({
    id = null,
    sourceId,
    workspaceId = 'default',
    collectionId = null,
    uri,
    filename,
    mimeType = 'application/octet-stream',
    extension = '',
    sizeBytes = 0,
    checksum = '',
    metadata = {}
  }) {
    const now = Date.now();
    const existing = this.db.prepare('SELECT * FROM documents WHERE source_id = ? AND uri = ?').get(sourceId, uri);

    if (existing) {
      // Check if file modified via checksum
      if (existing.checksum === checksum && existing.status === DocumentStatus.READY) {
        return { document: existing, isUnchanged: true };
      }

      const nextVersion = existing.version + 1;
      this.db.prepare(`
        UPDATE documents 
        SET checksum = ?, size_bytes = ?, version = ?, status = ?, metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).run(checksum, sizeBytes, nextVersion, DocumentStatus.EXTRACTING, JSON.stringify(metadata), now, existing.id);

      // Clean old chunks
      this.deleteDocumentChunks(existing.id);

      return {
        document: this.getDocument(existing.id),
        isUnchanged: false
      };
    }

    const docId = id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.db.prepare(`
      INSERT INTO documents (
        id, source_id, workspace_id, collection_id, uri, filename,
        mime_type, extension, size_bytes, checksum, version, status,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId, sourceId, workspaceId, collectionId, uri, filename,
      mimeType, extension, sizeBytes, checksum, 1, DocumentStatus.EXTRACTING,
      JSON.stringify(metadata), now, now
    );

    return {
      document: this.getDocument(docId),
      isUnchanged: false
    };
  }

  getDocument(documentId) {
    const doc = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
    if (!doc) return null;
    return {
      ...doc,
      metadata: doc.metadata_json ? JSON.parse(doc.metadata_json) : {}
    };
  }

  listDocuments(workspaceId = 'default', sourceId = null) {
    if (sourceId) {
      return this.db.prepare('SELECT * FROM documents WHERE workspace_id = ? AND source_id = ? ORDER BY filename ASC').all(workspaceId, sourceId);
    }
    return this.db.prepare('SELECT * FROM documents WHERE workspace_id = ? ORDER BY filename ASC').all(workspaceId);
  }

  setDocumentStatus(documentId, status, indexedAt = null) {
    const now = Date.now();
    this.db.prepare('UPDATE documents SET status = ?, indexed_at = COALESCE(?, indexed_at), updated_at = ? WHERE id = ?')
      .run(status, indexedAt, now, documentId);
  }

  // --- CHUNKS & INDEXING ---
  deleteDocumentChunks(documentId) {
    const chunks = this.db.prepare('SELECT id FROM chunks WHERE document_id = ?').all(documentId);
    for (const chunk of chunks) {
      this.db.prepare('DELETE FROM chunks_fts WHERE id = ?').run(chunk.id);
    }
    this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
  }

  saveChunks(documentId, sourceId, workspaceId, collectionId, chunksWithEmbeddings) {
    const now = Date.now();

    for (const chunk of chunksWithEmbeddings) {
      const chunkId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const provJson = JSON.stringify(chunk.provenance || {});
      const provText = `${chunk.provenance?.filename || ''} ${chunk.provenance?.location || ''} ${chunk.provenance?.context || ''}`;
      const embBlob = chunk.embedding ? vectorToBlob(chunk.embedding) : null;

      // Insert into core relational table
      this.db.prepare(`
        INSERT INTO chunks (
          id, document_id, source_id, workspace_id, collection_id,
          chunk_index, content, provenance_json, embedding_blob, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        chunkId, documentId, sourceId, workspaceId, collectionId,
        chunk.chunkIndex || 0, chunk.content, provJson, embBlob, now
      );

      // Insert into FTS5 index
      this.db.prepare(`
        INSERT INTO chunks_fts (id, content, provenance_text)
        VALUES (?, ?, ?)
      `).run(chunkId, chunk.content, provText);
    }

    this.setDocumentStatus(documentId, DocumentStatus.READY, now);
  }

  getChunks(documentId) {
    const rows = this.db.prepare('SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC').all(documentId);
    return rows.map(r => ({
      ...r,
      provenance: JSON.parse(r.provenance_json || '{}'),
      embedding: blobToVector(r.embedding_blob)
    }));
  }

  // --- LEXICAL & VECTOR SEARCH PRIMITIVES ---
  searchLexical(query, { workspaceId = 'default', sourceId = null, limit = 10 } = {}) {
    if (!query || !query.trim()) return [];

    // Clean query and strip stopwords for FTS5 syntax
    const STOPWORDS = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'what', 'which', 'who', 'how', 'when', 'where', 'why', 'can', 'could', 'should', 'would', 'do', 'does', 'did', 'this', 'that']);
    const rawTokens = query.replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const meaningfulTokens = rawTokens.filter(t => !STOPWORDS.has(t.toLowerCase()));
    const tokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;
    if (tokens.length === 0) return [];
    const cleanQuery = tokens.map(t => `${t}*`).join(' OR ');

    try {
      let sql = `
        SELECT c.*, d.filename, d.extension, bm25(chunks_fts) as rank_score
        FROM chunks_fts f
        JOIN chunks c ON f.id = c.id
        JOIN documents d ON c.document_id = d.id
        WHERE chunks_fts MATCH ? AND c.workspace_id = ?
      `;
      const params = [cleanQuery, workspaceId];

      if (sourceId) {
        sql += ' AND c.source_id = ?';
        params.push(sourceId);
      }

      sql += ' ORDER BY rank_score ASC LIMIT ?';
      params.push(limit * 2);

      const rows = this.db.prepare(sql).all(...params);
      return rows.map(r => {
        const lowerContent = `${r.content} ${r.filename}`.toLowerCase();
        let matchCount = 0;
        for (const tok of tokens) {
          if (lowerContent.includes(tok.toLowerCase())) {
            matchCount++;
          }
        }
        const tokenCoverage = tokens.length > 0 ? (matchCount / tokens.length) : 1.0;

        return {
          id: r.id,
          documentId: r.document_id,
          sourceId: r.source_id,
          workspaceId: r.workspace_id,
          filename: r.filename,
          extension: r.extension,
          chunkIndex: r.chunk_index,
          content: r.content,
          provenance: JSON.parse(r.provenance_json || '{}'),
          lexicalScore: Math.abs(r.rank_score), // FTS5 bm25 is negative
          tokenCoverage,
          embedding: blobToVector(r.embedding_blob)
        };
      });
    } catch (e) {
      console.warn('[Mesnium Store] FTS5 search syntax warning:', e.message);
      return [];
    }
  }

  searchVector(queryEmbedding, { workspaceId = 'default', sourceId = null, limit = 10, minScore = 0.1 } = {}) {
    if (!queryEmbedding) return [];

    let sql = `
      SELECT c.*, d.filename, d.extension 
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.workspace_id = ? AND c.embedding_blob IS NOT NULL
    `;
    const params = [workspaceId];

    if (sourceId) {
      sql += ' AND c.source_id = ?';
      params.push(sourceId);
    }

    const rows = this.db.prepare(sql).all(...params);
    const scored = [];

    for (const r of rows) {
      const vec = blobToVector(r.embedding_blob);
      const sim = cosineSimilarity(queryEmbedding, vec);
      if (sim >= minScore) {
        scored.push({
          id: r.id,
          documentId: r.document_id,
          sourceId: r.source_id,
          workspaceId: r.workspace_id,
          filename: r.filename,
          extension: r.extension,
          chunkIndex: r.chunk_index,
          content: r.content,
          provenance: JSON.parse(r.provenance_json || '{}'),
          vectorScore: sim,
          embedding: vec
        });
      }
    }

    scored.sort((a, b) => b.vectorScore - a.vectorScore);
    return scored.slice(0, limit * 2);
  }

  // --- STATS ---
  getStats(workspaceId = 'default') {
    const docCount = this.db.prepare('SELECT COUNT(*) as count FROM documents WHERE workspace_id = ?').get(workspaceId)?.count || 0;
    const chunkCount = this.db.prepare('SELECT COUNT(*) as count FROM chunks WHERE workspace_id = ?').get(workspaceId)?.count || 0;
    const sourceCount = this.db.prepare('SELECT COUNT(*) as count FROM sources WHERE workspace_id = ?').get(workspaceId)?.count || 0;
    const lastIndexed = this.db.prepare('SELECT MAX(indexed_at) as last_indexed FROM documents WHERE workspace_id = ?').get(workspaceId)?.last_indexed || null;

    return {
      workspaceId,
      sourceCount,
      documentCount: docCount,
      chunkCount,
      lastIndexedAt: lastIndexed
    };
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
