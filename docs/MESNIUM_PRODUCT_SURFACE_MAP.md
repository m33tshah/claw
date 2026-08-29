# MESNIUM PRODUCT SURFACE MAP (PHASE 6)

**Architecture Model**: Product Layer over Engine Foundation  
**Version Target**: Mesnium 1.0.0  
**Status**: Formal Architectural Blueprint

---

## 1. The Mesnium Separation Principle

Mesnium maintains a strict conceptual and physical separation between the **User-Facing Product Experience** and the underlying **Engine Foundation**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             MESNIUM PRODUCT                              │
│   - Mesnium Studio (Crimson/Obsidian UI & Design System)                 │
│   - Mesnium Identity ("Sign in with Google" / Account & Billing)         │
│   - Mesnium Workspaces, Agents, Automations, Knowledge, & Files          │
│   - Google Workspace Hub (Gmail, Calendar, Drive, Docs, Sheets)          │
│   - Zero-Friction User Experience (Zero Technical Token Friction)        │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           MESNIUM BRIDGE LAYER                           │
│   - Connection State Machine (CONNECTED / RECONNECTING / RECOVERING)     │
│   - Windows Standby, Sleep & Idle Instant Reconnect Watchdog             │
│   - Local Credential Auto-Bootstrap & Storage Synchronization            │
│   - Unified Event, Tool, and Stream Normalization Adapter                │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        OPENCLAW ENGINE FOUNDATION                        │
│   - Embedded ReAct Attempt Loop & Tool Calling Dispatcher                │
│   - Tier 1 Deterministic Document Extractors (DOCX, XLSX, PDF, PPTX)     │
│   - SQLite WAL Storage, sqlite-vec Vectors, & FTS5 Lexical Search        │
│   - Native Google Workspace Go CLI (gog.exe with OAuth 2.0 PKCE)         │
│   - Multi-Model LLM Routing (Gemini, Claude, GPT-4o, Ollama)             │
│   - Edge Neural TTS & Realtime Audio Stream Pipeline                     │
│   - Background Cron Daemon & Autonomous Heartbeat Monitors               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Product Surface Mapping Table

| OpenClaw Engine Primitive | Mesnium Product Surface | Product Description & User Experience |
| :--- | :--- | :--- |
| `src/agents/embedded-agent-runner` | **Mesnium Assistant** | The primary AI pair-programmer and autonomous assistant. Transparent ReAct reasoning, streaming tokens, multi-turn tool loops. |
| `src/agents/subagents/` | **Mesnium Specialized Agents** | Dedicated background personas (e.g. Researcher, Data Analyst, Coder, Copywriter) that execute tasks concurrently without polluting the main conversation. |
| `src/agents/sessions/` | **Mesnium Workspaces & Chats** | Project workspaces containing threaded conversations, task histories, uploaded documents, and custom instructions. |
| `dist/extensions/document-extract` | **Document Intelligence** | Instant local drag-and-drop ingestion of Excel workbooks (`.xlsx`), Word documents (`.docx`), PDF files (`.pdf`), PowerPoint slides (`.pptx`), CSVs, and ZIP archives with clean Markdown table rendering. |
| `src/agents/agent-tools.ts` | **Mesnium Computer / Files** | Full local filesystem management (browse, read, write, edit, search) with visual file preview cards and human-in-the-loop safety approvals. |
| `dist/extensions/memory-core` + `sqlite-vec` | **Mesnium Knowledge / RAG** | Unified semantic memory and document index combining dense vector search and BM25 lexical ranking for instant recall across all past chats and workspace files. |
| `src/cron/` (`croner`) | **Mesnium Automations** | Visual scheduled workflows (e.g. "Morning Executive Briefing at 8:00 AM", "Daily Git Commit Summary at 6:00 PM") with execution history logs. |
| `src/heartbeat/` | **Autonomous Monitoring** | Proactive background watchdog that inspects workspace state every 30 minutes and surfaces actionable alerts only when attention is required. |
| `skills/gog/` (`gog.exe`) | **Google Workspace Hub** | Visual hub connecting Gmail, Google Calendar, Google Drive, Docs, Sheets, and Contacts with one-click drafting and agenda previews. |
| `dist/extensions/duckduckgo` + `web-readability` | **Mesnium Web Intelligence** | Fast, free web search and article reader mode with clean Markdown extraction. |
| `dist/extensions/browser` (`playwright-core`) | **Mesnium Web Agent** | Autonomous browser worker capable of navigating dynamic web apps, clicking buttons, filling forms, and capturing screenshots. |
| `node-edge-tts` + `talk-voice` | **Mesnium Realtime Voice** | Fluid voice input/output featuring zero-cost Edge Neural TTS and interactive audio waveform visualizer. |
| `dist/extensions/canvas` + A2UI | **Dynamic Canvas & Artifacts** | Live interactive component sandbox for generated HTML, charts, calculators, forms, and games right inside the UI. |
| `dist/extensions/` (70 extensions) + MCP | **Mesnium Integration Hub** | One-click plugin and tool directory for connecting enterprise tools, external databases, APIs, and custom MCP servers. |

---

## 3. Product Boundary Matrix (Keep / Convert / Rebuild)

```
┌────────────────────────────────────────────────────────────────────────┐
│                              MESNIUM 1.0                               │
├────────────────────────────────────────────────────────────────────────┤
│ 1. MESNIUM CHAT & VOICE                                                │
│    - Inherits: ReAct loop, streaming tokens, Edge Neural TTS          │
│    - Converts: Control UI chat -> Mesnium Studio Crimson Theme        │
├────────────────────────────────────────────────────────────────────────┤
│ 2. DOCUMENT INTELLIGENCE                                               │
│    - Inherits: Tier 1 DOCX, XLSX, PDF, PPTX, CSV, ZIP local extractors │
│    - Converts: Raw tool text -> Rich interactive preview cards         │
├────────────────────────────────────────────────────────────────────────┤
│ 3. GOOGLE WORKSPACE HUB                                                │
│    - Inherits: gog.exe OAuth 2.0 PKCE Go binary                       │
│    - Converts: CLI commands -> Visual Gmail, Calendar & Drive cards    │
├────────────────────────────────────────────────────────────────────────┤
│ 4. AUTONOMOUS AUTOMATIONS                                              │
│    - Inherits: croner 5-field scheduler & heartbeat daemon             │
│    - Converts: Raw cron config -> Visual Automations Studio & Triggers │
├────────────────────────────────────────────────────────────────────────┤
│ 5. WORKSPACE KNOWLEDGE                                                 │
│    - Inherits: SQLite WAL, sqlite-vec C-extension, FTS5 lexical search │
│    - Extends: Hybrid BM25/Vector RAG over user workspace files         │
├────────────────────────────────────────────────────────────────────────┤
│ 6. LOCAL COMPUTER & TOOLS                                              │
│    - Inherits: Filesystem read/write/edit, Ripgrep search, Node-PTY    │
│    - Converts: Raw tool calls -> Mesnium Safety & Approvals UI         │
└────────────────────────────────────────────────────────────────────────┘
```
