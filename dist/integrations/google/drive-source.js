/**
 * MESNIUM GOOGLE DRIVE -> KNOWLEDGE CONNECTOR (PHASE 9)
 * 
 * Synchronizes selected Google Drive files into the Mesnium Knowledge Layer,
 * preserving document structure, chunking, embeddings, and provenance.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { GoogleWorkspaceClient } from './client.js';
import { SourceType } from '../../knowledge/types.js';

export function resolveGoogleDriveCacheDir(accountEmail, folderName = 'root') {
  const homeDir = os.homedir();
  const safeEmail = (accountEmail || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFolder = folderName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cacheDir = path.join(homeDir, '.openclaw', 'knowledge', 'sources', 'google_drive', safeEmail, safeFolder);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

export class GoogleDriveKnowledgeConnector {
  constructor(knowledgeManager, accountEmail = null) {
    this.knowledgeManager = knowledgeManager;
    this.client = new GoogleWorkspaceClient(accountEmail);
    this.accountEmail = accountEmail;
  }

  /**
   * Register Google Drive as a first-class Knowledge Source.
   */
  async registerDriveSource({ workspaceId = 'default', folderId = null, folderName = 'Google Drive Documents' }) {
    const cacheDir = resolveGoogleDriveCacheDir(this.accountEmail, folderName);

    const source = this.knowledgeManager.store.createSource({
      workspaceId,
      type: SourceType.GOOGLE_DRIVE || 'google_drive',
      path: cacheDir,
      name: `Google Drive: ${folderName}`
    });

    return source;
  }

  /**
   * Synchronize Google Drive files into the Knowledge Base.
   */
  async syncDriveSource(sourceId, options = {}) {
    const { maxFiles = 20, folderId = null, onProgress = null } = options;
    const source = this.knowledgeManager.store.getSource(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);

    // 1. List Drive files
    const driveFiles = await this.client.driveList({ max: maxFiles, folderId });
    const eligible = (driveFiles || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

    const summary = {
      sourceId,
      totalDiscovered: eligible.length,
      indexed: 0,
      skippedUnchanged: 0,
      failed: 0,
      startTime: Date.now(),
      durationMs: 0
    };

    const cacheDir = source.path;

    for (let i = 0; i < eligible.length; i++) {
      const file = eligible[i];
      const safeName = file.name.replace(/[\\/:*?"<>|]/g, '_');
      const localFilePath = path.join(cacheDir, safeName);

      onProgress?.({
        stage: 'syncing',
        currentFile: file.name,
        currentIndex: i + 1,
        totalFiles: eligible.length,
        percent: Math.round(((i + 1) / eligible.length) * 100)
      });

      try {
        // Download file from Drive to local cache
        if (!fs.existsSync(localFilePath)) {
          await this.client.driveDownload(file.id, localFilePath);
        }

        // Index through standard Mesnium Knowledge pipeline
        const indexRes = await this.knowledgeManager.indexFile(localFilePath, {
          sourceId: source.id,
          workspaceId: source.workspace_id
        });

        if (indexRes.skipped) {
          summary.skippedUnchanged++;
        } else {
          summary.indexed++;
        }
      } catch (err) {
        console.warn(`[Google Drive Knowledge] Failed to sync ${file.name}:`, err.message);
        summary.failed++;
      }
    }

    summary.durationMs = Date.now() - summary.startTime;
    return summary;
  }
}
