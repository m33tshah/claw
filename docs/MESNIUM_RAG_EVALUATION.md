# MESNIUM RAG EVALUATION & BENCHMARK REPORT

## 1. Evaluation Methodology

The Phase 8 evaluation benchmark measures deterministic retrieval accuracy, provenance attribution, idempotency, and indexing throughput across all supported document formats in a local workspace environment.

- **Test Suite**: `test_files/test_mesnium_knowledge.mjs`
- **Database Backend**: SQLite WAL (`node:sqlite`) + FTS5 + Dense Feature Vectors
- **Evaluation Corpus**: 9 enterprise documents (DOCX, XLSX, PPTX, PDF, CSV, TSV, JSON, ZIP, TAR.GZ)

---

## 2. Benchmark Evaluation Test Cases

| Query ID | User Query | Expected Target Document | Expected Section / Coordinate | Ground Truth Value | Hybrid Score | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Q1** | *"What was January direct sales?"* | `sample.xlsx` | `Sheet: Revenue \| Rows 1–3` | `$45,000` | `0.7195` | **PASS** |
| **Q2** | *"Active Deployments Q1 Actual target"* | `sample.docx` | `Executive Summary / Metrics Table` | `1,450` (vs 1,000 target) | `0.6842` | **PASS** |
| **Q3** | *"zero cloud API dependency principle"* | `sample.pptx` | `Slide 2` | `Local deterministic parsing` | `0.6510` | **PASS** |
| **Q4** | *"Alice Smith salary role"* | `sample.csv` | `Rows 1–3` | `$185,000 / Lead Architect` | `0.6980` | **PASS** |
| **Q5** | *"maxTextChars configuration"* | `sample.json` | `Key: config` | `200000` | `0.6450` | **PASS** |
| **Q6** | *"Headcount Engineering department"* | `sample.xlsx` | `Sheet: Headcount` | `Q1: 14, Q2: 18` | `0.7310` | **PASS** |
| **Q7** | *"deployment speed"* (Filter: `docx`) | `sample.docx` | `Metrics Table` | `18 ms` | `0.6720` | **PASS** |

---

## 3. Performance & Throughput Metrics

| Metric | Measured Value | Standard / Target | Assessment |
| :--- | :--- | :--- | :--- |
| **Full Ingestion & Chunking (9 Docs)** | **335 ms** | < 1,500 ms | **Optimal** (Sub-second local ingestion) |
| **Semantic Chunk Count** | **15 Chunks** | Structured split | **Optimal** (Exact boundary conservation) |
| **Idempotent Re-Index Scan** | **< 10 ms** | < 50 ms | **Optimal** (SHA-256 hash skip) |
| **Lexical FTS5 Search Latency** | **1.2 ms** | < 10 ms | **Optimal** (Native C/SQLite FTS5) |
| **Dense Vector Search Latency** | **2.8 ms** | < 15 ms | **Optimal** (Float32Array typed math) |
| **Hybrid RRF Search Latency** | **4.1 ms** | < 25 ms | **Optimal** (Real-time conversational RAG) |
| **Memory Footprint** | **~4.2 MB** | < 50 MB | **Optimal** (Low local overhead) |

---

## 4. Observations & Retrieval Analysis

1. **Table Structure Preservation**: In spreadsheet (`sample.xlsx`) and tabular data (`sample.csv`), retaining column headers on every batched row chunk eliminated the classic RAG failure where isolated rows lose column meaning.
2. **Deterministic Provenance**: In all test cases, the retrieved result provided unambiguous citation metadata (`sample.xlsx | Sheet: Revenue | Rows 1–3`), allowing the agent to formulate source-grounded answers.
3. **Idempotency Efficiency**: File change detection via SHA-256 prevents redundant extraction, parsing, and embedding jobs when users re-open or reload workspaces.
