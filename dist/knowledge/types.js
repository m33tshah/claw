/**
 * MESNIUM KNOWLEDGE LAYER — DATA MODEL & TYPES (PHASE 8)
 * 
 * Defines the core Mesnium Knowledge abstractions:
 * Workspace -> Sources -> Collections -> Documents -> Versions -> Chunks -> Embeddings
 */

export const DocumentStatus = {
  DISCOVERED: 'discovered',
  EXTRACTING: 'extracting',
  CHUNKING: 'chunking',
  INDEXING: 'indexing',
  READY: 'ready',
  FAILED: 'failed',
  NEEDS_REINDEX: 'needs_reindex'
};

export const SourceType = {
  LOCAL_FOLDER: 'local_folder',
  LOCAL_FILE: 'local_file',
  UPLOAD: 'upload',
  GOOGLE_DRIVE: 'google_drive',
  GMAIL: 'gmail',
  WEB: 'web'
};

export const ChunkLocationType = {
  PAGE: 'page',
  SHEET: 'sheet',
  SLIDE: 'slide',
  HEADING: 'heading',
  SECTION: 'section',
  ROW_RANGE: 'row_range',
  KEY: 'key'
};
