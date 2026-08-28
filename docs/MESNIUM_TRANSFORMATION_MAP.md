# MESNIUM PRODUCT TRANSFORMATION MAP

> **Baseline Checkpoint**: `6e986ca2e2af9d9282082b57e0d97db36d7698bb` (*Checkpoint 0 — Stable OpenClaw Foundation*)  
> **Target Architecture**: Mesnium Product Layer -> Mesnium Bridge Layer -> OpenClaw Engine Foundation

---

## 1. Executive Summary & Objective

The objective of the Mesnium Transformation Phase is to systematically transition user-facing presentation, visual identity, product surfaces, and application terminology from **OpenClaw** to **Mesnium**, while preserving the battle-tested, high-performance OpenClaw engine (Gateway JSON-RPC, multi-channel connectors, ReAct agent harness, Tier 1 document extractors, and SQLite persistence).

```mermaid
flowchart TD
    subgraph MesniumProduct [Mesnium Product Layer]
        M_UI[Mesnium Studio / Desktop Interface]
        M_Voice[Mesnium Realtime Voice Surface]
        M_Docs[Mesnium Document & Data Hub]
        M_Tasks[Mesnium Autonomous Workboard & Kanban]
        M_Brand[Mesnium Branding & Identity Subsystem]
    end

    subgraph MesniumBridge [Mesnium Bridge & Abstraction Layer]
        M_Config[Centralized Product Branding Config]
        M_RPC[Unified WebSocket JSON-RPC Client Adapter]
        M_Policy[Human-in-the-Loop Action Approval Guard]
        M_State[Reactive State Store & Event Bus]
    end

    subgraph OpenClawEngine [OpenClaw Foundation (Preserved Engine)]
        OC_Gateway[Gateway Supervisor Daemon :18789]
        OC_Harness[Embedded ReAct Agent Execution Loop]
        OC_Channels[20+ Omnichannel Connectors]
        OC_Extractors[Tier 1 Local Document Extractors]
        OC_Persistence[SQLite WAL & FTS5 Lexical Memory]
        OC_MCP[Model Context Protocol Client Bridge]
    end

    MesniumProduct --> MesniumBridge
    MesniumBridge --> OpenClawEngine
```

---

## 2. User-Facing Brand Inventory & Classification

All repository references to OpenClaw / Claw have been audited and categorized to avoid blind global replacements:

| Target String / Component | Location(s) | Classification | Transformation Strategy |
| :--- | :--- | :--- | :--- |
| `<title>OpenClaw Control</title>` | `dist/control-ui/index.html` | `USER_FACING` | Change to `<title>Mesnium Studio</title>`. |
| `OpenClaw Control` / `OpenClaw` | `manifest.webmanifest`, `sw.js` | `USER_FACING` | Replace with `Mesnium` and `Mesnium Desktop`. |
| Favicons (`favicon.ico`, `favicon.svg`) | `dist/control-ui/` | `USER_FACING` | Replace with official Mesnium icon assets once provided. |
| Fallback splash screens (`openclaw-mount-fallback`) | `dist/control-ui/index.html` | `USER_FACING` | Redesign with Mesnium branding and recovery UX. |
| UI Header / Navigation logo | `dist/control-ui/assets/index-*.js` | `USER_FACING` | Update brand badge and logo to Mesnium. |
| i18n Strings (`OpenClaw mobile`, docs links) | `dist/control-ui/assets/i18n-*.js` | `USER_FACING` | Update user-facing strings and help links. |
| Agent Default Identity (`IDENTITY.md`) | `workspace-templates/IDENTITY.md` | `USER_FACING` | Update default assistant name to Mesnium identity. |
| Windows Task Scheduler (`\OpenClaw Gateway`) | `dist/schtasks-*.js` | `DEVELOPER_FACING` | Retain daemon name internally or alias to `Mesnium Gateway Service`. |
| Config Schema (`openclaw.json`) | `~/.openclaw/openclaw.json` | `INTERNAL_ENGINE` | Retain format; provide Mesnium configuration facade. |
| Protocol Handshake (`openclaw-control-ui`) | Gateway connection parameters | `INTERNAL_ENGINE` | Keep protocol client id compatible during transition. |
| Plugin SDK (`@openclaw/plugin-sdk`) | Extension packages | `DEVELOPER_FACING` | Retain upstream SDK compatibility. |
| MIT License Attribution | `LICENSE`, `THIRD_PARTY_NOTICES.md`| `LICENSE/LEGAL` | Strictly retain full OpenClaw MIT copyright notices. |

---

## 3. Control UI Surface & Route Mapping

The existing Control UI contains 26 distinct routes and panels. Every surface has been mapped for its role in Mesnium:

| Route / Path | OpenClaw Name | Primary Purpose | Mesnium Action | Future Role in Mesnium |
| :--- | :--- | :--- | :--- | :--- |
| `/chat` | Chat | Primary conversational interface & voice | **REDESIGN** | Flagship Mesnium Chat & Realtime Voice Studio |
| `/overview` | Overview | Gateway status, stats, connection auth | **RENAME/REDESIGN** | Mesnium Dashboard / Command Center |
| `/sessions` | Sessions | Session list, checkpoints, forks | **REDESIGN** | Conversation & Project History Hub |
| `/agents` | Agents | Agent context, workspace files, tools | **REDESIGN** | Agent Persona & Skill Studio |
| `/workboard` | Workboard | Kanban task queue and agent dispatch | **EXTEND/REDESIGN** | Autonomous Project & Task Kanban |
| `/tasks` | Tasks | Background subagent runs, cron execution | **REDESIGN** | Background Operations Monitor |
| `/skills` | Skills | Installed skills & API keys | **REDESIGN** | Mesnium Skill & Capability Store |
| `/skills/workshop` | Skill Workshop | Skill authoring, testing, and refinement | **RENAME/REDESIGN** | Mesnium Skill Creator & Prompt Lab |
| `/cron` | Cron Jobs | Scheduled jobs & periodic wakeups | **RENAME/REDESIGN** | Automations & Scheduled Workflows |
| `/dreaming` | Dreaming | Memory consolidation & reflection | **RENAME/REDESIGN** | Semantic Memory & Knowledge Insights |
| `/activity` | Activity | Real-time tool execution stream | **REDESIGN** | Live Agent Inspector & Tool Telemetry |
| `/usage` | Usage | Token consumption & cost analytics | **REDESIGN** | Resource & Cost Analytics Dashboard |
| `/settings/channels` | Channels | 20+ messaging platform connectors | **REDESIGN** | Omnichannel Integrations Hub |
| `/nodes` | Nodes | Device pairing & companion hardware | **RENAME/REDESIGN** | Companion Devices & Remote Nodes |
| `/settings/general` | General Config | Core settings & security profiles | **REDESIGN** | Mesnium Workspace Settings |
| `/settings/mcp` | MCP | Model Context Protocol server manager | **REDESIGN** | MCP Integration Manager |
| `/settings/ai-agents` | AI & Agents | Model provider setup & thinking modes | **REDESIGN** | Model Intelligence & LLM Hub |
| `/logs` | Logs | Live JSONL gateway log stream | **RENAME/REDESIGN** | Developer Logs & Diagnostics |
| `/debug` | Debug | Gateway RPC manual test bench | **RETAIN (DEV)** | Developer Debug Console |
| `/worktrees` | Worktrees | Git worktree isolation checkouts | **EXTEND** | Isolated Task Environments |
| `/instances` | Instances | Presence beacons from connected nodes | **MERGE** | Integrated into Nodes / Devices View |

---

## 4. Brand Abstraction Architecture

To avoid scattered hardcoded brand strings, Mesnium introduces a centralized product branding contract:

```typescript
export interface MesniumProductBranding {
  readonly productName: string;        // "Mesnium"
  readonly productShortName: string;   // "Mesnium"
  readonly productTagline: string;     // "Autonomous Local-First Operating System"
  readonly productDescription: string; // "Intelligent multimodal desktop agent and automation platform."
  readonly version: string;            // "1.0.0-alpha"
  readonly logoPath: string;           // "/brand/mesnium-logo.svg"
  readonly iconPath: string;           // "/brand/mesnium-icon.svg"
  readonly faviconPath: string;        // "/brand/favicon.ico"
  readonly websiteUrl: string;         // "https://mesnium.ai"
  readonly docsUrl: string;            // "https://docs.mesnium.ai"
  readonly supportUrl: string;         // "https://support.mesnium.ai"
  readonly internalEngine: {
    readonly name: string;             // "OpenClaw Engine"
    readonly version: string;          // "2026.7.1"
  };
}
```

---

## 5. Architectural Boundary: Keep vs. Convert

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MESNIUM PRODUCT SURFACE                         │
│  - Product Name & Branding ("Mesnium")                                 │
│  - Studio / Desktop User Interface (Modern Glassmorphic Design)        │
│  - Realtime Multimodal Voice Experience                                │
│  - Document Intelligence Workspace (Excel/PDF/Word Visualizer)         │
│  - Autonomous Kanban & Workflow DAG Studio                             │
│  - User-Facing Configuration & Settings Pages                          │
│  - Onboarding & Setup Wizard                                           │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        MESNIUM BRIDGE LAYER                            │
│  - Centralized Product Branding Definition                             │
│  - JSON-RPC v4 WebSocket Client Adapter                                │
│  - Action Confirmation & Security Interceptor                          │
│  - Reactive Event & State Synchronization                              │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       OPENCLAW ENGINE FOUNDATION                       │
│  - Gateway Daemon & Process Supervisor (:18789)                        │
│  - ReAct Agent Execution Harness & Subagent Swarms                     │
│  - 20+ Omnichannel Messaging Adapters (WhatsApp, Slack, Discord, etc.) │
│  - Tier 1 Deterministic Document Extractors (DOCX, XLSX, PPTX, PDF)   │
│  - SQLite WAL Databases & FTS5 Lexical Memory                          │
│  - OS Service Managers (schtasks, systemd, launchd)                   │
│  - MCP (Model Context Protocol) Client Engine                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Frontend Architecture Assessment

- **Framework**: Web Components (Lit reactive elements) with Preact reactive stores.
- **Build System**: Vite bundler producing optimized production chunks in `dist/control-ui/`.
- **Communication**: Resilient WebSocket connection (`ws://127.0.0.1:18789`) with challenge-response token authentication, auto-reconnect on wake (`visibilitychange`), and JSON-RPC method dispatch.
- **Styling**: CSS custom properties (`--bg`, `--text`, `--accent`, `--border`, `--radius`) with light/dark theme modes.
- **Decision**: Retain the robust WebSocket RPC communication harness and state synchronization layer; redesign the component visual presentation, layout, typography, and styling tokens to match Mesnium's premium design standards.

---

## 7. UI Transformation Phase Plan

1. **Phase 3A: Brand & Metadata Foundation**
   - Centralize branding strings and paths.
   - Update HTML titles, PWA manifests, metadata, and loading fallbacks to Mesnium.
   - Prepare asset injection points for user-provided logos, favicons, and typography.
2. **Phase 3B: Global Shell & Navigation Redesign**
   - Implement premium Mesnium sidebar and header navigation.
   - Refine navigation hierarchy (Workspace, Studio, Automations, Integrations, Settings).
3. **Phase 3C: Flagship Chat & Realtime Voice Studio**
   - Modernize message bubble rendering, streaming animations, and markdown typography.
   - Polish Realtime Talk mode visualizer and audio state indicators.
   - Integrate inline document previews (spreadsheets, slide decks, PDFs) directly in chat.
4. **Phase 3D: Document & Data Workspace**
   - Expose Tier 1 extracted tables and document summaries with interactive filtering.
5. **Phase 3E: Workboard & Automation Center**
   - Enhance Kanban board with drag-and-drop workflow stages, agent assignment, and execution proofs.
6. **Phase 3F: Settings & Integration Hub**
   - Streamline multi-channel connector configuration and model provider management.

---

## 8. Architectural Risks & Mitigations

| Risk | Severity | Mitigation |
| :--- | :--- | :--- |
| **Direct Bundle Editing** | Medium | Keep source-level configurations clean; maintain timestamped backups of all touched bundles; verify with automated RPC test scripts. |
| **Upstream Protocol Drift** | Low | Preserve standard OpenClaw JSON-RPC method signatures (`chat.send`, `health`, `config.get`, `sessions.list`). |
| **Terminology Leakage** | Low | Centralize all user-visible strings in dedicated i18n and branding configuration modules. |
| **Service Name Collisions** | Low | Keep internal daemon identifiers (`\OpenClaw Gateway`) operational while displaying "Mesnium Gateway" in user interfaces. |
| **License Compliance** | Critical | Preserve the complete MIT license copyright notice in `LICENSE` and `THIRD_PARTY_NOTICES.md`. |

---

## 9. Next Implementation Block

**Recommended Immediate Step**: Implement **Phase 3A (Brand Foundation & Centralized Branding Abstraction)**, integrating the centralized branding config and updating application entry metadata without altering underlying Gateway engine behavior.
