/**
 * MESNIUM FILESYSTEM ORGANIZER & SAFETY ENGINE (PHASE 20A)
 * 
 * Provides:
 * 1. Deterministic file categorization (PDFs, Documents, Spreadsheets, Media, Software, Review)
 * 2. Proposal generation without disk mutation
 * 3. Explicit confirmation enforcement before moving files or creating folders
 * 4. Safe execution and mutation report
 */

import fs from 'node:fs';
import path from 'node:path';
import { getSharedFilesystemManager } from './index.js';

export const FOLDER_CATEGORIES = {
  'Documents/PDFs': ['pdf'],
  'Work/Spreadsheets': ['xlsx', 'xls', 'csv', 'tsv'],
  'Work/Presentations': ['pptx', 'ppt', 'key'],
  'Documents': ['docx', 'doc', 'txt', 'md', 'rtf'],
  'Media/Images': ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'],
  'Media/Audio': ['mp3', 'wav', 'm4a', 'aac', 'flac'],
  'Media/Video': ['mp4', 'mov', 'avi', 'mkv', 'webm'],
  'Software/Installers': ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm'],
  'Archives': ['zip', 'tar', 'gz', '7z', 'rar'],
  'Code': ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'css', 'sql', 'sh', 'bat', 'mjs'],
  'Review': [] // Fallback for misc files
};

export class MesniumFilesystemOrganizer {
  constructor(fsManager = null) {
    this.fsManager = fsManager || getSharedFilesystemManager();
  }

  /**
   * Produce a structured organization proposal without modifying any files.
   */
  async proposeOrganization(folderAliasOrPath) {
    const res = this.fsManager.resolveAuthorizedPath(folderAliasOrPath);
    if (!res || !res.authorized) {
      throw new Error(`I don't have access to that folder yet. You can authorize it from Files.`);
    }

    const dirPath = res.realPath;
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Folder does not exist: ${res.folderAlias}`);
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const rootFiles = [];

    for (const ent of entries) {
      if (ent.isDirectory()) continue; // Skip existing subfolders
      try {
        const full = path.join(dirPath, ent.name);
        const stat = fs.statSync(full);
        const ext = path.extname(ent.name).toLowerCase().replace(/^\./, '');
        rootFiles.push({
          name: ent.name,
          extension: ext,
          size: stat.size,
          mtime: stat.mtime
        });
      } catch (_) {}
    }

    if (rootFiles.length === 0) {
      return {
        folder: res.folderAlias,
        totalFiles: 0,
        proposedMoves: [],
        breakdown: {},
        summaryText: `Found 0 loose files on your ${res.folderAlias} to organize.`
      };
    }

    const proposedMoves = [];
    const breakdown = {};

    for (const file of rootFiles) {
      const targetCategory = this._determineCategory(file);
      proposedMoves.push({
        fileName: file.name,
        fromFolder: res.folderAlias,
        targetSubfolder: targetCategory,
        destination: `${targetCategory}/${file.name}`
      });

      breakdown[targetCategory] = (breakdown[targetCategory] || 0) + 1;
    }

    // Format human-friendly business breakdown
    const breakdownLines = Object.entries(breakdown).map(([cat, count]) => {
      return `- ${count} file${count === 1 ? '' : 's'} → ${cat}`;
    });

    const summaryText = `I found ${rootFiles.length} file${rootFiles.length === 1 ? '' : 's'} on your ${res.folderAlias}.\n\nProposed organization:\n${breakdownLines.join('\n')}\n\nNothing has been moved yet.\n\nProceed?`;

    return {
      folder: res.folderAlias,
      totalFiles: rootFiles.length,
      proposedMoves,
      breakdown,
      summaryText,
      requiresConfirmation: true
    };
  }

  /**
   * Execute confirmed organization moves
   */
  async executeOrganization(folderAliasOrPath, plan = null, confirmed = false) {
    if (!confirmed) {
      throw new Error('Explicit confirmation is required before modifying file structures.');
    }

    const res = this.fsManager.resolveAuthorizedPath(folderAliasOrPath);
    if (!res || !res.authorized) {
      throw new Error(`I don't have access to that folder yet. You can authorize it from Files.`);
    }

    const dirPath = res.realPath;
    const effectivePlan = plan || (await this.proposeOrganization(folderAliasOrPath));
    const moves = effectivePlan.proposedMoves || [];

    let movedCount = 0;
    const executedMoves = [];
    const errors = [];

    for (const move of moves) {
      try {
        const sourcePath = path.join(dirPath, move.fileName);
        if (!fs.existsSync(sourcePath)) continue;

        const targetDir = path.join(dirPath, move.targetSubfolder);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const destPath = path.join(targetDir, move.fileName);
        fs.renameSync(sourcePath, destPath);
        movedCount++;
        executedMoves.push({
          fileName: move.fileName,
          destination: move.destination
        });
      } catch (err) {
        errors.push({ fileName: move.fileName, error: err.message });
      }
    }

    return {
      ok: true,
      folder: res.folderAlias,
      movedCount,
      totalRequested: moves.length,
      executedMoves,
      errors,
      summaryText: `Successfully organized ${movedCount} file${movedCount === 1 ? '' : 's'} into structured folders on your ${res.folderAlias}.`
    };
  }

  _determineCategory(file) {
    const ext = file.extension.toLowerCase();
    for (const [category, extensions] of Object.entries(FOLDER_CATEGORIES)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
    return 'Review';
  }
}

let sharedOrganizer = null;
export function getSharedFilesystemOrganizer() {
  if (!sharedOrganizer) {
    sharedOrganizer = new MesniumFilesystemOrganizer();
  }
  return sharedOrganizer;
}
