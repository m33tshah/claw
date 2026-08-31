/**
 * MESNIUM REAL LOCAL FILESYSTEM ENGINE (PHASE 20A.1 HARDENING PASS)
 * 
 * Security Architecture:
 * 1. Recognition vs Authorization:
 *    - Desktop, Downloads, Documents are recognized by alias, but default to NOT AUTHORIZED (enabled: false).
 *    - User must explicitly authorize a folder before listing, reading, extracting, or mutating files.
 * 2. Canonical Realpath & Anti-Escape:
 *    - Uses fs.realpathSync to resolve real canonical paths on disk.
 *    - Validates that target path canonical location resides strictly within an enabled authorized root.
 *    - Blocks symlink escapes, junction escapes, and `..` path traversal attempts.
 * 3. PC-Wide Metadata Search vs Content Access:
 *    - Search discovers file metadata across accessible user locations.
 *    - Returns safe metadata (name, extension, size, mtime, folder, authorized: boolean).
 *    - Content reading/extracting/mutating unauthorized search results is strictly blocked until folder is authorized.
 * 4. System / OS Directory Protection:
 *    - System directories (Windows, Program Files, .git, node_modules, temp) are excluded from all scans.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractGeneralFile } from '../extensions/document-extract/document-extractor.js';

const CONFIG_DIR = path.join(os.homedir(), '.mesnium');
const AUTH_FILE = path.join(CONFIG_DIR, 'authorized_folders.json');

// System and high-risk directories to protect from search traversal
const SYSTEM_EXCLUDED_PATTERNS = [
  /^[A-Z]:\\Windows/i,
  /^[A-Z]:\\Program Files/i,
  /^[A-Z]:\\Program Files \(x86\)/i,
  /^[A-Z]:\\ProgramData/i,
  /^[A-Z]:\\\$Recycle\.Bin/i,
  /^[A-Z]:\\System Volume Information/i,
  /[\\\/]\.git([\\\/]|$)/i,
  /[\\\/]node_modules([\\\/]|$)/i,
  /[\\\/]AppData[\\\/]Local[\\\/]Temp([\\\/]|$)/i,
  /[\\\/]\.npm([\\\/]|$)/i,
  /[\\\/]\.vscode([\\\/]|$)/i,
];

export class MesniumFilesystemManager {
  constructor() {
    this._folders = new Map();
    this._ensureLoaded();
  }

  _ensureLoaded() {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }

      const defaultFolders = this._getDefaultFolders();

      if (fs.existsSync(AUTH_FILE)) {
        const raw = fs.readFileSync(AUTH_FILE, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.id && item.path) {
              this._folders.set(item.id, {
                id: item.id,
                alias: item.alias || item.id,
                path: path.normalize(item.path),
                enabled: Boolean(item.enabled),
                isDefault: Boolean(item.isDefault),
                createdAt: item.createdAt || Date.now(),
                updatedAt: item.updatedAt || Date.now()
              });
            }
          }
        }
      }

      // Ensure recognized standard default folders exist (with enabled: false if not previously authorized)
      for (const df of defaultFolders) {
        if (!this._folders.has(df.id)) {
          this._folders.set(df.id, df);
        }
      }

      this._save();
    } catch (err) {
      console.error('[MesniumFS] Failed to load authorized folders:', err);
    }
  }

  _getDefaultFolders() {
    const home = os.homedir();
    return [
      {
        id: 'desktop',
        alias: 'Desktop',
        path: path.join(home, 'Desktop'),
        enabled: false, // Recognition != Authorization (Phase 20A.1)
        isDefault: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'downloads',
        alias: 'Downloads',
        path: path.join(home, 'Downloads'),
        enabled: false, // Recognition != Authorization (Phase 20A.1)
        isDefault: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'documents',
        alias: 'Documents',
        path: path.join(home, 'Documents'),
        enabled: false, // Recognition != Authorization (Phase 20A.1)
        isDefault: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];
  }

  _save() {
    try {
      const list = Array.from(this._folders.values());
      fs.writeFileSync(AUTH_FILE, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.error('[MesniumFS] Failed to save authorized folders:', err);
    }
  }

  listAuthorizedFolders() {
    return Array.from(this._folders.values()).map(f => ({
      id: f.id,
      alias: f.alias,
      enabled: Boolean(f.enabled),
      isDefault: Boolean(f.isDefault),
      exists: fs.existsSync(f.path)
    }));
  }

  authorizeFolder(folderPathOrAlias, customAlias = null) {
    if (!folderPathOrAlias) throw new Error('Folder path or alias is required.');
    
    // Check if it matches a default folder by alias or id
    const normalizedInput = folderPathOrAlias.trim().toLowerCase();
    const defaults = this._getDefaultFolders();
    const matchDefault = defaults.find(d => d.id === normalizedInput || d.alias.toLowerCase() === normalizedInput);

    let targetPath = matchDefault ? matchDefault.path : path.resolve(folderPathOrAlias);
    let alias = customAlias || (matchDefault ? matchDefault.alias : path.basename(targetPath) || targetPath);
    let id = matchDefault ? matchDefault.id : (alias.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '_' + Math.random().toString(36).slice(2, 6));

    if (!fs.existsSync(targetPath)) {
      try {
        fs.mkdirSync(targetPath, { recursive: true });
      } catch (e) {
        throw new Error(`Directory does not exist and could not be created: ${alias}`);
      }
    }

    const canonicalPath = this._getCanonicalPath(targetPath);

    // Remove any existing entry with the same alias or matching path to prevent collisions
    for (const [existingId, existing] of this._folders.entries()) {
      if (existing.alias.toLowerCase() === alias.toLowerCase() || existing.path.toLowerCase() === canonicalPath.toLowerCase()) {
        id = existingId;
        break;
      }
    }

    const entry = {
      id,
      alias,
      path: canonicalPath,
      enabled: true,
      isDefault: Boolean(matchDefault),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this._folders.set(id, entry);
    this._save();
    return { ok: true, id: entry.id, alias: entry.alias, enabled: true };
  }

  revokeFolder(folderIdOrAlias) {
    const key = this._resolveFolderKey(folderIdOrAlias);
    if (!key) throw new Error(`Authorized folder not found: ${folderIdOrAlias}`);
    
    const folder = this._folders.get(key);
    folder.enabled = false;
    this._save();
    return { ok: true, id: folder.id, alias: folder.alias, enabled: false };
  }

  reauthorizeFolder(folderIdOrAlias) {
    const key = this._resolveFolderKey(folderIdOrAlias);
    if (!key) throw new Error(`Authorized folder not found: ${folderIdOrAlias}`);
    
    const folder = this._folders.get(key);
    folder.enabled = true;
    this._save();
    return { ok: true, id: folder.id, alias: folder.alias, enabled: true };
  }

  _resolveFolderKey(folderIdOrAlias) {
    if (!folderIdOrAlias) return null;
    const lower = folderIdOrAlias.trim().toLowerCase().replace(/^my\s+/, '');
    for (const [id, f] of this._folders.entries()) {
      if (id === lower || f.alias.toLowerCase() === lower) {
        return id;
      }
    }
    return null;
  }

  _getCanonicalPath(targetPath) {
    if (!targetPath) return '';
    try {
      if (fs.existsSync(targetPath)) {
        return path.normalize(fs.realpathSync(targetPath));
      }
    } catch (_) {}
    return path.normalize(path.resolve(targetPath));
  }

  /**
   * Canonical Realpath Resolver & Authorization Gatekeeper
   * 
   * Resolves aliases (Desktop, Downloads, Documents) and paths to canonical locations on disk,
   * then verifies whether the resolved canonical location is inside an enabled authorized folder.
   */
  resolveAuthorizedPath(inputPathOrAlias) {
    if (!inputPathOrAlias) return null;
    const clean = inputPathOrAlias.trim();

    // 1. Check natural alias resolution for standalone folder names ("Desktop", "Downloads", "Documents")
    const folderKey = this._resolveFolderKey(clean);
    if (folderKey) {
      const f = this._folders.get(folderKey);
      const canonicalFolder = this._getCanonicalPath(f.path);
      return {
        realPath: canonicalFolder,
        canonicalPath: canonicalFolder,
        folderAlias: f.alias,
        authorized: Boolean(f.enabled),
        isFolderRoot: true
      };
    }

    // 2. Check alias prefix resolution ("Desktop/report.pdf", "Downloads/setup.exe")
    for (const f of this._folders.values()) {
      const aliasPrefixSlash = f.alias.toLowerCase() + '/';
      const aliasPrefixBackslash = f.alias.toLowerCase() + '\\';
      const lowerClean = clean.toLowerCase();

      if (lowerClean.startsWith(aliasPrefixSlash) || lowerClean.startsWith(aliasPrefixBackslash)) {
        const sub = clean.slice(f.alias.length + 1);
        // Anti-traversal: reject paths with '..'
        if (sub.split(/[\\\/]/).includes('..')) {
          return { realPath: '', canonicalPath: '', folderAlias: f.alias, authorized: false };
        }

        const candidate = path.join(f.path, sub);
        const canonicalTarget = this._getCanonicalPath(candidate);
        const canonicalRoot = this._getCanonicalPath(f.path);

        const isInside = canonicalTarget.toLowerCase() === canonicalRoot.toLowerCase() ||
          canonicalTarget.toLowerCase().startsWith(canonicalRoot.toLowerCase() + path.sep);

        return {
          realPath: canonicalTarget,
          canonicalPath: canonicalTarget,
          folderAlias: f.alias,
          authorized: Boolean(f.enabled) && isInside,
          isFolderRoot: false
        };
      }
    }

    // 3. Check absolute / relative filesystem paths
    const canonicalTarget = this._getCanonicalPath(clean);
    for (const f of this._folders.values()) {
      const canonicalRoot = this._getCanonicalPath(f.path);
      const isInside = canonicalTarget.toLowerCase() === canonicalRoot.toLowerCase() ||
        canonicalTarget.toLowerCase().startsWith(canonicalRoot.toLowerCase() + path.sep);

      if (isInside) {
        return {
          realPath: canonicalTarget,
          canonicalPath: canonicalTarget,
          folderAlias: f.alias,
          authorized: Boolean(f.enabled),
          isFolderRoot: canonicalTarget.toLowerCase() === canonicalRoot.toLowerCase()
        };
      }
    }

    // Path outside any authorized folder
    return {
      realPath: canonicalTarget,
      canonicalPath: canonicalTarget,
      folderAlias: null,
      authorized: false,
      isFolderRoot: false
    };
  }

  isPathAuthorized(targetPath) {
    const res = this.resolveAuthorizedPath(targetPath);
    return res && res.authorized === true;
  }

  /**
   * Deterministic directory listing inside authorized folder
   */
  async listDirectory(folderOrAlias, options = {}) {
    const res = this.resolveAuthorizedPath(folderOrAlias);
    const folderName = res?.folderAlias || folderOrAlias;

    if (!res || !res.authorized) {
      throw new Error(`I don't have access to your ${folderName} yet. You can authorize it from Files.`);
    }

    const dirPath = res.canonicalPath;
    if (!fs.existsSync(dirPath)) {
      return { folder: res.folderAlias, files: [], totalCount: 0 };
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory.`);
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const ent of entries) {
      try {
        const fullPath = path.join(dirPath, ent.name);
        const itemStat = fs.statSync(fullPath);
        const ext = path.extname(ent.name).toLowerCase().replace(/^\./, '');
        const isDir = ent.isDirectory();
        const type = isDir ? 'folder' : this._classifyFileType(ext);

        files.push({
          name: ent.name,
          relativePath: ent.name,
          folder: res.folderAlias,
          isDir,
          type,
          extension: ext,
          size: itemStat.size,
          formattedSize: this._formatBytes(itemStat.size),
          mtime: itemStat.mtime.toISOString(),
          mtimeMs: itemStat.mtimeMs,
          ctime: itemStat.ctime.toISOString()
        });
      } catch (_) {}
    }

    // Sort: directories first, then latest modified
    files.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return b.mtimeMs - a.mtimeMs;
    });

    const limit = options.limit || 100;
    const paginated = files.slice(0, limit);

    return {
      folder: res.folderAlias,
      files: paginated,
      totalCount: files.length
    };
  }

  /**
   * Read file content with rich document extraction (Strict Authorization Enforced)
   */
  async readFile(filePathOrAlias, options = {}) {
    const res = this.resolveAuthorizedPath(filePathOrAlias);
    const folderName = res?.folderAlias || 'that folder';

    if (!res || !res.authorized) {
      throw new Error(`I don't have access to ${folderName} yet. You can authorize it from Files.`);
    }

    const fullPath = res.canonicalPath;
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found in ${res.folderAlias}: ${path.basename(fullPath)}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      throw new Error(`Cannot read directory as file.`);
    }

    const fileName = path.basename(fullPath);
    const ext = path.extname(fileName).toLowerCase().replace(/^\./, '');
    const buffer = fs.readFileSync(fullPath);

    // Rich document extraction
    const extracted = await extractGeneralFile({
      buffer,
      fileName,
      mimeType: options.mimeType || ''
    });

    if (extracted && extracted.text) {
      return {
        fileName,
        folder: res.folderAlias,
        extension: ext,
        size: stat.size,
        formattedSize: this._formatBytes(stat.size),
        mtime: stat.mtime.toISOString(),
        content: extracted.text,
        extracted: true
      };
    }

    // Default text reading
    const text = buffer.toString('utf8');
    const maxChars = options.maxChars || 50000;
    const truncated = text.length > maxChars;
    const content = truncated ? text.slice(0, maxChars) + `\n\n*(Truncated at ${maxChars} characters)*` : text;

    return {
      fileName,
      folder: res.folderAlias,
      extension: ext,
      size: stat.size,
      formattedSize: this._formatBytes(stat.size),
      mtime: stat.mtime.toISOString(),
      content,
      extracted: false
    };
  }

  /**
   * Inspect file metadata (Strict Authorization Enforced)
   */
  async inspectFile(filePathOrAlias) {
    const res = this.resolveAuthorizedPath(filePathOrAlias);
    const folderName = res?.folderAlias || 'that folder';

    if (!res || !res.authorized) {
      throw new Error(`I don't have access to ${folderName} yet. You can authorize it from Files.`);
    }

    const fullPath = res.canonicalPath;
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${path.basename(fullPath)}`);
    }

    const stat = fs.statSync(fullPath);
    const fileName = path.basename(fullPath);
    const ext = path.extname(fileName).toLowerCase().replace(/^\./, '');

    return {
      fileName,
      folder: res.folderAlias,
      isDir: stat.isDirectory(),
      type: stat.isDirectory() ? 'folder' : this._classifyFileType(ext),
      extension: ext,
      size: stat.size,
      formattedSize: this._formatBytes(stat.size),
      mtime: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
      ctime: stat.ctime.toISOString()
    };
  }

  /**
   * Search files across authorized folders + PC-wide metadata search
   * 
   * Searches for metadata (filename, extension, size, mtime) across accessible local drives.
   * Attaches `authorized: boolean` flag to every match.
   * Zero content reading is performed during search.
   */
  async searchFiles(query, options = {}) {
    const cleanQuery = (query || '').trim().toLowerCase();
    const targetExtension = options.extension ? options.extension.toLowerCase().replace(/^\./, '') : null;
    const targetType = options.type ? options.type.toLowerCase() : null;
    const targetFolder = options.folder ? this.resolveAuthorizedPath(options.folder) : null;
    const results = [];
    const seenPaths = new Set();

    // 1. Search inside authorized folders first
    const authorizedFolders = Array.from(this._folders.values()).filter(f => f.enabled && fs.existsSync(f.path));
    const foldersToSearch = targetFolder && targetFolder.authorized
      ? [{ alias: targetFolder.folderAlias, path: targetFolder.canonicalPath }]
      : authorizedFolders.map(f => ({ alias: f.alias, path: this._getCanonicalPath(f.path) }));

    for (const f of foldersToSearch) {
      this._walkDirectory(f.path, f.alias, (file) => {
        const norm = file._fullPath.toLowerCase();
        if (seenPaths.has(norm)) return;
        seenPaths.add(norm);

        if (this._matchesQuery(file, cleanQuery, targetExtension, targetType)) {
          results.push({
            name: file.name,
            folder: f.alias,
            isDir: file.isDir,
            type: file.type,
            extension: file.extension,
            size: file.size,
            formattedSize: file.formattedSize,
            mtime: file.mtime,
            authorized: true
          });
        }
      }, 0, 3);
    }

    // 2. PC-wide metadata search across user home and common roots (Excluding OS directories)
    if (!targetFolder || options.scope === 'pc' || results.length === 0) {
      const userHome = os.homedir();
      this._walkDirectory(userHome, 'Local PC', (file) => {
        const norm = file._fullPath.toLowerCase();
        if (seenPaths.has(norm)) return;
        seenPaths.add(norm);

        if (this._matchesQuery(file, cleanQuery, targetExtension, targetType)) {
          const authCheck = this.isPathAuthorized(file._fullPath);
          const folderName = authCheck ? (this.resolveAuthorizedPath(file._fullPath)?.folderAlias || 'Authorized Folder') : path.basename(path.dirname(file._fullPath));

          results.push({
            name: file.name,
            folder: folderName,
            isDir: file.isDir,
            type: file.type,
            extension: file.extension,
            size: file.size,
            formattedSize: file.formattedSize,
            mtime: file.mtime,
            authorized: authCheck
          });
        }
      }, 0, 2, SYSTEM_EXCLUDED_PATTERNS);
    }

    const limit = options.limit || 50;
    return {
      query: cleanQuery,
      totalCount: results.length,
      files: results.slice(0, limit)
    };
  }

  _matchesQuery(file, query, ext, type) {
    if (ext && file.extension !== ext) return false;
    if (type && file.type !== type) return false;
    if (!query) return true;

    const lowerName = file.name.toLowerCase();
    if (lowerName.includes(query)) return true;

    const tokens = query.split(/\s+/).filter(Boolean);
    return tokens.every(t => lowerName.includes(t));
  }

  _walkDirectory(dirPath, folderAlias, callback, currentDepth = 0, maxDepth = 3, excludePatterns = SYSTEM_EXCLUDED_PATTERNS) {
    if (currentDepth > maxDepth) return;
    if (!fs.existsSync(dirPath)) return;

    for (const pat of excludePatterns) {
      if (pat.test(dirPath)) return;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dirPath, ent.name);
        if (excludePatterns.some(p => p.test(full))) continue;

        if (ent.isDirectory()) {
          this._walkDirectory(full, folderAlias, callback, currentDepth + 1, maxDepth, excludePatterns);
        } else {
          try {
            const stat = fs.statSync(full);
            const ext = path.extname(ent.name).toLowerCase().replace(/^\./, '');
            callback({
              name: ent.name,
              folder: folderAlias,
              isDir: false,
              type: this._classifyFileType(ext),
              extension: ext,
              size: stat.size,
              formattedSize: this._formatBytes(stat.size),
              mtime: stat.mtime.toISOString(),
              mtimeMs: stat.mtimeMs,
              _fullPath: full
            });
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  _classifyFileType(ext) {
    switch (ext) {
      case 'pdf': return 'pdf';
      case 'docx':
      case 'doc':
      case 'txt':
      case 'md':
      case 'rtf': return 'document';
      case 'xlsx':
      case 'xls':
      case 'csv':
      case 'tsv': return 'spreadsheet';
      case 'pptx':
      case 'ppt': return 'presentation';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'gif':
      case 'svg': return 'image';
      case 'js':
      case 'ts':
      case 'mjs':
      case 'py':
      case 'json':
      case 'html':
      case 'css':
      case 'sh': return 'code';
      case 'zip':
      case 'tar':
      case 'gz':
      case '7z':
      case 'rar': return 'archive';
      default: return 'file';
    }
  }

  _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

let sharedManager = null;
export function getSharedFilesystemManager() {
  if (!sharedManager) {
    sharedManager = new MesniumFilesystemManager();
  }
  return sharedManager;
}

export function resetSharedFilesystemManager() {
  sharedManager = new MesniumFilesystemManager();
  return sharedManager;
}
