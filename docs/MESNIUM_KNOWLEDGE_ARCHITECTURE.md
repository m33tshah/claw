# MESNIUM KNOWLEDGE & RAG ARCHITECTURE

## 1. Overview & Core Product Principle

Mesnium Knowledge is the persistent business intelligence and retrieval engine of the Mesnium luxury AI workspace. Rather than functioning merely as an internal key-value journal or scratch memory for conversation transcripts, **Mesnium Knowledge** is an independent, product-level abstraction that ingests, semantically chunks, vectorizes, indexes, and retrieves enterprise multi-format documents (DOCX, XLSX, PPTX, PDF, CSV, TSV, JSON, MD) with full provenance tracking.

```
                    MESNIUM STUDIO
                          │
                   KNOWLEDGE LAYER
                          │
       ┌──────────────────┼───────────────────┐
       │                  │                   │
    Sources           Ingestion           Retrieval
 (Local / Files)   (Tier 1 Extract)   (Hybrid RRF BM25)
       │                  │                   │
       └──────────────────┼───────────────────┘
                          │
                 SQLite WAL + FTS5
                 + Vectors (dim 384)
                          │
                  Agent Context &
                 Grounded Citations
                          │
                   OpenClaw Engine
```

---

## 2. Conceptual Data Model

The data model isolates tenant workspaces and sources while enabling multi-tier collections and fine-grained chunk retrieval:

```
Workspace (e.g., 'default' / 'workspace_mesnium_dev')
  └── Sources (Local Folder, Selected File, Upload)
       └── Documents (sample.xlsx, report.docx, deck.pptx)
            └── Versions (v1, v2 with SHA256 checksums)
                 └── Chunks (Structured semantic segments)
                      └── Embeddings (Normalized 384d / 768d unit vectors)
```

### Entity Schema

| Entity | Primary Key | Key Attributes | Purpose |
| :--- | :--- | :--- | :--- |
| **Workspace** | `id` | `name`, `created_at` | Top-level tenant isolation boundary |
| **Source** | `id` | `workspace_id`, `type`, `path`, `name`, `status`, `last_indexed_at` | Origin boundary (Local Folder, File, SaaS) |
| **Collection** | `id` | `workspace_id`, `name`, `description` | Logical grouping (e.g. "Financials", "Legal") |
| **Document** | `id` | `source_id`, `uri`, `filename`, `mime_type`, `checksum`, `version`, `status` | Individual document with lifecycle state |
| **Chunk** | `id` | `document_id`, `chunk_index`, `content`, `provenance_json`, `embedding_blob` | Atomic text unit with provenance & dense vector |
| **Chunks_FTS** | `id` | `content`, `provenance_text` | FTS5 full-text search virtual index |

---

## 3. Storage Design: SQLite WAL + FTS5 + Dense Vectors

Mesnium Knowledge utilizes native `node:sqlite` with zero unmanaged external dependencies, operating 100% locally with high throughput:

1. **Storage Engine**: SQLite in Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and synchronous normal mode.
2. **Lexical Index**: SQLite FTS5 virtual table (`tokenize='unicode61'`) providing BM25 term weighting and sub-word prefix matching.
3. **Vector Store**: BLOB-serialized `Float32Array` vectors stored directly alongside chunks, enabling sub-millisecond in-process cosine distance calculations with hardware acceleration.
4. **Idempotency & Checksums**: Every document is fingerprinted via SHA-256. Re-indexing scans identify identical checksums and skip redundant extraction/embedding steps instantly.

---

## 4. Structured Semantic Chunking & Provenance

Mesnium preserves the native semantics of each file type rather than flattening everything into unformatted plaintext:

```
DOCX / MD     ──► Headings ──► Sub-sections ──► Paragraphs + Tables
XLSX / CSV    ──► Worksheets ──► Column Header Prepending ──► Row Batches (1-25)
PPTX          ──► Slides ──► Slide Titles + Bullet Body + Speaker Notes
PDF           ──► Page Boundaries ──► Paragraph Block Windows
JSON          ──► Top-Level Key-Value Blocks
```

### Provenance Tracking
Every chunk retains rich provenance stored in `provenance_json`:
```json
{
  "filename": "sample.xlsx",
  "locationType": "sheet",
  "location": "Sheet: Revenue | Rows 1–3",
  "context": "Spreadsheet sample.xlsx [Revenue]"
}
```

---

## 5. Embedding Abstraction & Providers

The embedding layer provides a unified interface (`MesniumEmbeddingAdapter`) decoupling the product from specific AI vendors:

- **Local Feature Hashing Provider (Default)**:
  - 100% Offline, zero-cost, instant calculation.
  - Dimension: 384 (`DEFAULT_EMBEDDING_DIM`).
  - Uses Murmur3/FNV feature hashing over unigrams, character trigrams, and word bigrams with L2-normalization.
- **External Providers (Configurable)**:
  - Google Gemini: `text-embedding-004` (dim = 768)
  - OpenAI: `text-embedding-3-small` (dim = 1536)
  - Ollama: Local GGUF embeddings

---

## 6. Hybrid Retrieval Pipeline (BM25 + Cosine Fusion)

The hybrid retriever merges candidates using Reciprocal Rank Fusion (RRF) and weighted linear interpolation:

$$\text{Score} = (0.45 \times \text{Norm\_BM25}) + (0.55 \times \text{Cosine\_Similarity})$$

```
User Query
    │
    ├──► Lexical Search (FTS5 BM25) ─────► Rank K_lex
    │
    └──► Vector Embedding (Cosine Sim) ──► Rank K_vec
                │
         Candidate Merge
                │
        Reciprocal Rank Fusion
       RRF = Σ (w_i / (60 + rank_i))
                │
        Metadata Filtering
        (Workspace, Source, Ext)
                │
        Top K Grounded Chunks
```

---

## 7. Agent Context Integration & Grounding

Retrieved knowledge is formatted into an explicit citation prompt before execution:

```markdown
## Retrieved Workspace Knowledge
The following excerpts were retrieved from the user's workspace documents. When answering, ground your response in these facts and cite the source filename and section/sheet/page.

### [Knowledge Source 1: sample.xlsx | Sheet: Revenue | Rows 1–3]
| Month | Direct Sales | Partner Sales | Total Revenue |
| --- | --- | --- | --- |
| January | 45000 | 15000 | 60000 |
| February | 52000 | 18000 | 70000 |
| March | 61000 | 22000 | 83000 |
```

The agent uses the `knowledge_search` tool to fetch ground-truth evidence and cite exact filenames and sheet/page locations without hallucination.
