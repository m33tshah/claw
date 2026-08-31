/**
 * MESNIUM LOCAL FILESYSTEM AGENT TOOL (PHASE 20A.1 HARDENING PASS)
 * 
 * Exposes the `local_filesystem` tool to the Universal Assistant.
 * Handles deterministic operations:
 * - list: List files in authorized folder (Desktop, Downloads, Documents)
 * - search: Search files across authorized folders & PC-wide metadata
 * - read: Read and extract content of authorized files (PDF, DOCX, XLSX, TXT, CSV)
 * - inspect: Retrieve file metadata
 * - propose_organization: Propose cleanup without moving files
 * - execute_organization: Execute confirmed cleanup
 */

import { getSharedFilesystemManager } from './index.js';
import { getSharedFilesystemOrganizer } from './organizer.js';

export const LocalFilesystemToolSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['list', 'search', 'read', 'inspect', 'propose_organization', 'execute_organization'],
      description: 'The filesystem action to perform: "list" to view files in an authorized folder, "search" to find files across authorized folders and PC metadata, "read" to read and parse file contents, "inspect" for metadata, "propose_organization" to create an organization plan, or "execute_organization" to execute a confirmed move.'
    },
    folder: {
      type: 'string',
      description: 'The authorized folder alias or name (e.g. "Desktop", "Downloads", "Documents", or user-authorized folder name).'
    },
    path: {
      type: 'string',
      description: 'Relative path or filename within the authorized folder to read or inspect (e.g. "resume.pdf", "Marketing_Plan.docx", "Desktop/Q3_Sales.xlsx").'
    },
    query: {
      type: 'string',
      description: 'Search query for finding files by name, extension, or topic.'
    },
    extension: {
      type: 'string',
      description: 'Optional file extension filter (e.g. "pdf", "xlsx", "docx", "csv", "txt").'
    },
    confirmed: {
      type: 'boolean',
      description: 'Must be true when executing confirmed organization or file movements.'
    }
  },
  required: ['action'],
  additionalProperties: false
};

export const LocalFilesystemTool = {
  name: 'local_filesystem',
  label: 'Local Filesystem',
  description: 'Discover, inspect, search, read, and organize files in user-authorized local computer folders (Desktop, Downloads, Documents). Always invoke this tool when asked about files on the computer, Desktop, Downloads, reading documents, finding spreadsheets/PDFs, or organizing folders.',
  parameters: LocalFilesystemToolSchema,
  execute: async (toolCallId, params = {}) => {
    try {
      const fsManager = getSharedFilesystemManager();
      const organizer = getSharedFilesystemOrganizer();
      const action = params.action || 'list';

      // 1. LIST ACTION
      if (action === 'list') {
        const folderTarget = params.folder || params.path || 'Desktop';
        const result = await fsManager.listDirectory(folderTarget, { limit: 50 });

        if (!result.files || result.files.length === 0) {
          return {
            toolCallId,
            content: [{ type: 'text', text: `Your ${result.folder} folder is currently empty (0 files found).` }]
          };
        }

        const lines = result.files.map((f, idx) => {
          const icon = f.isDir ? '📁' : _getFileEmoji(f.extension);
          return `${idx + 1}. ${icon} **${f.name}** (${f.formattedSize || '0 B'}) · Modified: ${f.mtime ? new Date(f.mtime).toLocaleDateString() : 'N/A'}`;
        });

        return {
          toolCallId,
          content: [{
            type: 'text',
            text: `Found ${result.totalCount} file${result.totalCount === 1 ? '' : 's'} in your ${result.folder}:\n\n${lines.join('\n')}`
          }]
        };
      }

      // 2. SEARCH ACTION (PC-Wide Metadata Discovery)
      if (action === 'search') {
        const query = params.query || params.path || '';
        const searchRes = await fsManager.searchFiles(query, {
          extension: params.extension,
          folder: params.folder
        });

        if (!searchRes.files || searchRes.files.length === 0) {
          return {
            toolCallId,
            content: [{ type: 'text', text: `No files found matching "${query}".` }]
          };
        }

        let hasUnauthorized = false;
        const lines = searchRes.files.map((f, idx) => {
          const icon = f.isDir ? '📁' : _getFileEmoji(f.extension);
          if (!f.authorized) hasUnauthorized = true;
          const authBadge = f.authorized ? '' : ' · *(Not connected — folder authorization required to read)*';
          return `${idx + 1}. ${icon} **${f.name}** in *${f.folder}* (${f.formattedSize || '0 B'})${authBadge}`;
        });

        let outputText = `Found ${searchRes.totalCount} matching file${searchRes.totalCount === 1 ? '' : 's'}:\n\n${lines.join('\n')}`;
        if (hasUnauthorized) {
          outputText += `\n\nSome matches are in folders that are not connected to Mesnium yet. Connect their containing folder from Files if you'd like me to open or work with them.`;
        }

        return {
          toolCallId,
          content: [{
            type: 'text',
            text: outputText
          }]
        };
      }

      // 3. READ ACTION (Strict Authorization Gatekeeper)
      if (action === 'read') {
        const fileTarget = params.path || params.query || params.folder;
        if (!fileTarget) {
          return {
            toolCallId,
            isError: true,
            content: [{ type: 'text', text: 'Please specify the file name or relative path to read.' }]
          };
        }

        // Check if fileTarget is an unauthorized search hit
        let resolvedPath = fileTarget;
        if (!fileTarget.includes('/') && !fileTarget.includes('\\')) {
          const search = await fsManager.searchFiles(fileTarget, { folder: params.folder });
          if (search.files.length > 0) {
            const firstMatch = search.files[0];
            if (!firstMatch.authorized) {
              return {
                toolCallId,
                content: [{
                  type: 'text',
                  text: `That file is in **${firstMatch.folder}**, which is outside your connected folders. Connect its folder from Files if you'd like me to open or work with it.`
                }]
              };
            }
            resolvedPath = `${firstMatch.folder}/${firstMatch.name}`;
          }
        }

        const readRes = await fsManager.readFile(resolvedPath);
        return {
          toolCallId,
          content: [{
            type: 'text',
            text: `[File: ${readRes.fileName} | Location: ${readRes.folder} | Size: ${readRes.formattedSize}]\n\n${readRes.content}`
          }]
        };
      }

      // 4. INSPECT ACTION
      if (action === 'inspect') {
        const fileTarget = params.path || params.folder;
        const inspectRes = await fsManager.inspectFile(fileTarget);
        return {
          toolCallId,
          content: [{
            type: 'text',
            text: `File Metadata for **${inspectRes.fileName}**:\n- Location: ${inspectRes.folder}\n- Type: ${inspectRes.type} (.${inspectRes.extension})\n- Size: ${inspectRes.formattedSize}\n- Last Modified: ${new Date(inspectRes.mtime).toLocaleString()}`
          }]
        };
      }

      // 5. PROPOSE ORGANIZATION
      if (action === 'propose_organization') {
        const folderTarget = params.folder || 'Desktop';
        const proposal = await organizer.proposeOrganization(folderTarget);
        return {
          toolCallId,
          content: [{
            type: 'text',
            text: proposal.summaryText
          }]
        };
      }

      // 6. EXECUTE ORGANIZATION
      if (action === 'execute_organization') {
        const folderTarget = params.folder || 'Desktop';
        if (!params.confirmed) {
          return {
            toolCallId,
            content: [{
              type: 'text',
              text: 'Explicit confirmation is required before moving files. Please confirm to proceed.'
            }]
          };
        }

        const execRes = await organizer.executeOrganization(folderTarget, null, true);
        return {
          toolCallId,
          content: [{
            type: 'text',
            text: execRes.summaryText
          }]
        };
      }

      return {
        toolCallId,
        isError: true,
        content: [{ type: 'text', text: `Unknown filesystem action: ${action}` }]
      };
    } catch (err) {
      return {
        toolCallId,
        isError: false,
        content: [{ type: 'text', text: err.message || 'Filesystem error' }]
      };
    }
  }
};

function _getFileEmoji(ext) {
  switch (ext) {
    case 'pdf': return '📕';
    case 'docx':
    case 'doc':
    case 'txt':
    case 'md': return '📄';
    case 'xlsx':
    case 'xls':
    case 'csv':
    case 'tsv': return '📊';
    case 'pptx':
    case 'ppt': return '📑';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'gif':
    case 'svg': return '🖼️';
    case 'zip':
    case 'tar':
    case 'gz': return '📦';
    case 'exe':
    case 'msi': return '💿';
    default: return '📄';
  }
}
