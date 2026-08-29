/**
 * MESNIUM KNOWLEDGE LAYER — AGENT TOOL & RETRIEVAL HOOK (PHASE 8)
 * 
 * Exposes the `knowledge_search` tool to the ReAct agent runner.
 */

import { MesniumKnowledgeManager } from './index.js';

let sharedManager = null;

export function getSharedKnowledgeManager() {
  if (!sharedManager) {
    sharedManager = new MesniumKnowledgeManager();
  }
  return sharedManager;
}

export function setSharedKnowledgeManager(manager) {
  sharedManager = manager;
}

export const KnowledgeSearchToolSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'The search query to look up in the workspace knowledge base (documents, spreadsheets, presentations, and files).'
    },
    maxResults: {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      description: 'Maximum number of knowledge chunks to return (default: 5).'
    },
    workspaceId: {
      type: 'string',
      description: 'Optional workspace ID boundary (defaults to active workspace).'
    },
    extension: {
      type: 'string',
      description: 'Optional file extension filter (e.g. xlsx, docx, pdf, pptx, csv).'
    }
  },
  required: ['query'],
  additionalProperties: false
};

export const KnowledgeSearchTool = {
  name: 'knowledge_search',
  label: 'Knowledge Search',
  description: 'Search workspace documents, spreadsheets, slides, and reports for grounded answers. Returns exact text excerpts with document filename, sheet, slide, or page citations.',
  parameters: KnowledgeSearchToolSchema,
  execute: async (toolCallId, params) => {
    try {
      const manager = getSharedKnowledgeManager();
      const results = await manager.search(params.query, {
        workspaceId: params.workspaceId || 'default',
        limit: params.maxResults || 5,
        extension: params.extension || null
      });

      if (!results || results.length === 0) {
        return {
          toolCallId,
          content: [
            {
              type: 'text',
              text: `No relevant knowledge found in workspace documents for query: "${params.query}".`
            }
          ]
        };
      }

      const formatted = results.map((r, idx) => {
        const prov = r.provenance || {};
        return `[Source ${idx + 1}: ${r.filename} | ${prov.location || 'Excerpt'}]\n${r.content}`;
      }).join('\n\n---\n\n');

      return {
        toolCallId,
        content: [
          {
            type: 'text',
            text: `Found ${results.length} relevant excerpt(s) in workspace knowledge:\n\n${formatted}`
          }
        ],
        details: {
          hitCount: results.length,
          sources: results.map(r => ({
            filename: r.filename,
            location: r.provenance?.location,
            hybridScore: r.scores?.hybrid
          }))
        }
      };
    } catch (err) {
      return {
        toolCallId,
        isError: true,
        content: [
          {
            type: 'text',
            text: `Knowledge search failed: ${err.message}`
          }
        ]
      };
    }
  }
};
