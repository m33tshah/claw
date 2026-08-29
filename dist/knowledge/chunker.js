/**
 * MESNIUM KNOWLEDGE LAYER — SEMANTIC CHUNKING ENGINE (PHASE 8)
 * 
 * Provides deterministic, structure-aware semantic chunking with rich provenance
 * for DOCX, XLSX, PPTX, PDF, CSV, TSV, JSON, MD, and Plaintext.
 */

import { ChunkLocationType } from './types.js';

export const DEFAULT_MAX_CHUNK_CHARS = 1200;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 150;

/**
 * Chunk a structured document based on format and metadata.
 */
export function chunkDocument(document, extractedContent) {
  const ext = (document.extension || '').toLowerCase().replace(/^\./, '');
  const filename = document.filename || 'Untitled';
  const text = typeof extractedContent === 'string' ? extractedContent : (extractedContent?.text || '');

  switch (ext) {
    case 'xlsx':
    case 'xls':
      return chunkSpreadsheet(document, text);
    
    case 'pptx':
    case 'ppt':
      return chunkPresentation(document, text);

    case 'pdf':
      return chunkPdf(document, text);

    case 'docx':
    case 'doc':
      return chunkWordDocument(document, text);

    case 'csv':
    case 'tsv':
      return chunkTabularData(document, text);

    case 'json':
      return chunkJsonDocument(document, text);

    case 'md':
    case 'markdown':
      return chunkMarkdown(document, text);

    default:
      return chunkGenericText(document, text);
  }
}

/**
 * XLSX Spreadsheet Chunking: Preserves Sheet Names & Table Headers
 */
function chunkSpreadsheet(document, text) {
  const chunks = [];
  const sheetSections = text.split(/(?=###\s+Sheet:\s+)/i).filter(s => s.trim().length > 0);

  if (sheetSections.length === 0) {
    return chunkGenericText(document, text);
  }

  let chunkIndex = 0;
  for (const section of sheetSections) {
    const sheetMatch = section.match(/###\s+Sheet:\s+([^\n(]+)(?:\(([^)]+)\))?/i);
    const sheetName = sheetMatch ? sheetMatch[1].trim() : 'Sheet';
    
    // Extract table rows
    const lines = section.split(/\r?\n/).filter(l => l.trim().length > 0);
    const headerLines = lines.slice(0, 3); // Sheet title + table header + separator
    const headerPrefix = headerLines.join('\n');
    const dataLines = lines.slice(3);

    if (dataLines.length === 0) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: section.trim(),
        provenance: {
          filename: document.filename,
          locationType: ChunkLocationType.SHEET,
          location: `Sheet: ${sheetName}`,
          context: `Spreadsheet Workbook: ${document.filename}`
        }
      });
      continue;
    }

    // Batch data rows in groups of 25
    const batchSize = 25;
    for (let r = 0; r < dataLines.length; r += batchSize) {
      const rowBatch = dataLines.slice(r, r + batchSize);
      const rowRange = `Rows ${r + 1}–${Math.min(r + rowBatch.length, dataLines.length)}`;
      const chunkContent = `${headerPrefix}\n${rowBatch.join('\n')}`;

      chunks.push({
        chunkIndex: chunkIndex++,
        content: chunkContent.trim(),
        provenance: {
          filename: document.filename,
          locationType: ChunkLocationType.SHEET,
          location: `Sheet: ${sheetName} | ${rowRange}`,
          context: `Spreadsheet ${document.filename} [${sheetName}]`
        }
      });
    }
  }

  return chunks;
}

/**
 * PPTX Presentation Chunking: Chunks by Slide + Notes
 */
function chunkPresentation(document, text) {
  const chunks = [];
  const slideSections = text.split(/(?=###\s+Slide\s+\d+)/i).filter(s => s.trim().length > 0);

  if (slideSections.length === 0) {
    return chunkGenericText(document, text);
  }

  let chunkIndex = 0;
  for (const section of slideSections) {
    const slideMatch = section.match(/###\s+Slide\s+(\d+)/i);
    const slideNum = slideMatch ? slideMatch[1] : `${chunkIndex + 1}`;

    chunks.push({
      chunkIndex: chunkIndex++,
      content: section.trim(),
      provenance: {
        filename: document.filename,
        locationType: ChunkLocationType.SLIDE,
        location: `Slide ${slideNum}`,
        context: `Presentation: ${document.filename}`
      }
    });
  }

  return chunks;
}

/**
 * PDF Document Chunking: Chunks by Page & Paragraph Boundaries
 */
function chunkPdf(document, text) {
  const chunks = [];
  const pageSections = text.split(/(?=--- Page Break ---|--- Page \d+ ---)/i).filter(s => s.trim().length > 0);

  if (pageSections.length <= 1 && text.length > DEFAULT_MAX_CHUNK_CHARS) {
    return chunkGenericText(document, text, ChunkLocationType.PAGE);
  }

  let chunkIndex = 0;
  for (let p = 0; p < pageSections.length; p++) {
    const pageText = pageSections[p].replace(/--- Page(?: Break|\s+\d+) ---/g, '').trim();
    if (!pageText) continue;

    const pageNum = p + 1;
    if (pageText.length <= DEFAULT_MAX_CHUNK_CHARS) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: pageText,
        provenance: {
          filename: document.filename,
          locationType: ChunkLocationType.PAGE,
          location: `Page ${pageNum}`,
          context: `PDF Document: ${document.filename}`
        }
      });
    } else {
      // Split sub-page paragraphs
      const paragraphs = pageText.split(/\n\s*\n/).filter(pr => pr.trim().length > 0);
      let currentChunk = '';
      for (const pr of paragraphs) {
        if (currentChunk.length + pr.length > DEFAULT_MAX_CHUNK_CHARS && currentChunk.length > 0) {
          chunks.push({
            chunkIndex: chunkIndex++,
            content: currentChunk.trim(),
            provenance: {
              filename: document.filename,
              locationType: ChunkLocationType.PAGE,
              location: `Page ${pageNum}`,
              context: `PDF Document: ${document.filename}`
            }
          });
          currentChunk = '';
        }
        currentChunk += (currentChunk ? '\n\n' : '') + pr;
      }
      if (currentChunk.trim()) {
        chunks.push({
          chunkIndex: chunkIndex++,
          content: currentChunk.trim(),
          provenance: {
            filename: document.filename,
            locationType: ChunkLocationType.PAGE,
            location: `Page ${pageNum}`,
            context: `PDF Document: ${document.filename}`
          }
        });
      }
    }
  }

  return chunks.length > 0 ? chunks : chunkGenericText(document, text);
}

/**
 * DOCX & Markdown: Chunks by Section Headings
 */
function chunkWordDocument(document, text) {
  return chunkMarkdown(document, text, 'Word Document');
}

function chunkMarkdown(document, text, docType = 'Markdown Document') {
  const chunks = [];
  const sections = text.split(/(?=^#{1,3}\s+)/m).filter(s => s.trim().length > 0);

  if (sections.length === 0) {
    return chunkGenericText(document, text);
  }

  let chunkIndex = 0;
  for (const section of sections) {
    const headingMatch = section.match(/^#{1,3}\s+([^\n]+)/m);
    const heading = headingMatch ? headingMatch[1].trim() : 'General Section';

    if (section.length <= DEFAULT_MAX_CHUNK_CHARS) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: section.trim(),
        provenance: {
          filename: document.filename,
          locationType: ChunkLocationType.HEADING,
          location: heading,
          context: `${docType}: ${document.filename}`
        }
      });
    } else {
      // Split large sections by paragraphs
      const paragraphs = section.split(/\n\s*\n/).filter(pr => pr.trim().length > 0);
      let currentChunk = '';
      for (const pr of paragraphs) {
        if (currentChunk.length + pr.length > DEFAULT_MAX_CHUNK_CHARS && currentChunk.length > 0) {
          chunks.push({
            chunkIndex: chunkIndex++,
            content: `### ${heading}\n${currentChunk.trim()}`,
            provenance: {
              filename: document.filename,
              locationType: ChunkLocationType.HEADING,
              location: heading,
              context: `${docType}: ${document.filename}`
            }
          });
          currentChunk = '';
        }
        currentChunk += (currentChunk ? '\n\n' : '') + pr;
      }
      if (currentChunk.trim()) {
        chunks.push({
          chunkIndex: chunkIndex++,
          content: `### ${heading}\n${currentChunk.trim()}`,
          provenance: {
            filename: document.filename,
            locationType: ChunkLocationType.HEADING,
            location: heading,
            context: `${docType}: ${document.filename}`
          }
        });
      }
    }
  }

  return chunks;
}

/**
 * CSV / TSV Tabular Chunking
 */
function chunkTabularData(document, text) {
  const chunks = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length <= 2) {
    return chunkGenericText(document, text);
  }

  const header = lines[0];
  const dataLines = lines.slice(1);
  const batchSize = 30;
  let chunkIndex = 0;

  for (let i = 0; i < dataLines.length; i += batchSize) {
    const batch = dataLines.slice(i, i + batchSize);
    const rowRange = `Rows ${i + 1}–${Math.min(i + batch.length, dataLines.length)}`;
    const content = `${header}\n${batch.join('\n')}`;

    chunks.push({
      chunkIndex: chunkIndex++,
      content: content.trim(),
      provenance: {
        filename: document.filename,
        locationType: ChunkLocationType.ROW_RANGE,
        location: rowRange,
        context: `Data Table: ${document.filename}`
      }
    });
  }

  return chunks;
}

/**
 * JSON Document Chunking
 */
function chunkJsonDocument(document, text) {
  try {
    const cleanText = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    const data = JSON.parse(cleanText);
    const chunks = [];
    let chunkIndex = 0;

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data)) {
        const valStr = JSON.stringify(value, null, 2);
        chunks.push({
          chunkIndex: chunkIndex++,
          content: `Key: "${key}":\n${valStr}`,
          provenance: {
            filename: document.filename,
            locationType: ChunkLocationType.KEY,
            location: `Key: ${key}`,
            context: `JSON Document: ${document.filename}`
          }
        });
      }
    }

    if (chunks.length > 0) return chunks;
  } catch {}

  return chunkGenericText(document, text);
}

/**
 * Generic Text Window Chunking (Sliding Paragraph Window)
 */
function chunkGenericText(document, text, locationType = ChunkLocationType.SECTION) {
  const chunks = [];
  if (!text || !text.trim()) return chunks;

  const paragraphs = text.split(/\n\s*\n/).filter(pr => pr.trim().length > 0);
  let currentChunk = '';
  let chunkIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const pr = paragraphs[i];
    if (currentChunk.length + pr.length > DEFAULT_MAX_CHUNK_CHARS && currentChunk.length > 0) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: currentChunk.trim(),
        provenance: {
          filename: document.filename,
          locationType,
          location: `Section ${chunkIndex}`,
          context: `Document: ${document.filename}`
        }
      });
      currentChunk = '';
    }
    currentChunk += (currentChunk ? '\n\n' : '') + pr;
  }

  if (currentChunk.trim()) {
    chunks.push({
      chunkIndex: chunkIndex++,
      content: currentChunk.trim(),
      provenance: {
        filename: document.filename,
        locationType,
        location: `Section ${chunkIndex}`,
        context: `Document: ${document.filename}`
      }
    });
  }

  return chunks;
}
