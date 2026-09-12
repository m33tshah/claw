# Claw — Personal AI Assistant

> **Status:** Active Dogfooding & Development  
> **Target:** Meet's Personal AI Assistant built on OpenClaw  
> **Philosophy:** Powerful Backend + Simple User Experience + Safe Defaults  

---

## 1. What Claw Is
**Claw** is a private, local-first personal AI assistant engineered for executive intelligence, calendar and communication management, research synthesis, and local task orchestration. It runs on top of the OpenClaw multi-channel runtime, communicating with Google Cloud Vertex AI via Application Default Credentials (ADC) and interfacing with Google Workspace through a dedicated native CLI (`gog`).

## 2. What Claw Is NOT
- **Not Mesnium:** Claw is a personal dogfooding assistant for Meet, not the commercial multi-tenant product initiative (Mesnium).
- **Not a Public Distributable / SaaS:** Claw is not currently packaged for external users, Docker deployments, or cross-platform installers.
- **Not an Autonomous Unsupervised Agent:** Claw strictly enforces human-in-the-loop confirmation boundaries for external mutations (sending emails, altering calendar invites, deleting files).

---

## 3. System Architecture Overview

```mermaid
flowchart TB
    subgraph UserInterface [Interaction Layer]
        User([Meet]) <--> Webchat[Webchat / Control UI :18789]
    end

    subgraph OpenClawCore [Claw Core Runtime]
        Gateway[OpenClaw Gateway Daemon]
        Agent[Main Agent: Claw]
        Gateway <--> Agent
        Agent <--> Sessions[Session Store: Daily Reset @ 04:00]
        Agent <--> Memory[Memory Engine: SQLite FTS5]
    end

    subgraph IntelligenceLayer [Model & Inference]
        Agent <--> VertexADC[Google Vertex AI: Gemini 2.5 Flash]
    end

    subgraph Connectors [Integrations & Tools]
        Agent --> GogCLI[Google Workspace CLI: gog]
        Agent --> WebTools[DuckDuckGo Search & Web Fetch]
        Agent --> LocalFS[Local Filesystem Tools]
    end

    GogCLI <--> GoogleCloud[Gmail / Calendar / Drive / Docs / Sheets]
    WebTools <--> PublicWeb[Internet / Live Web]
```

---

## 4. Current Capabilities & Baseline

| Subsystem | Configuration / Engine | Status |
| :--- | :--- | :--- |
| **Primary Model** | `google-vertex/gemini-2.5-flash` | Active via GCP ADC (`gen-lang-client-0255502107`) |
| **Agent Profile** | `main` agent under `coding` tool profile | 1 Active Agent, 0 Subagents currently active |
| **Google Workspace** | `gog.exe` authenticated as `m16bshah@gmail.com` | Gmail, Calendar, Drive, Docs, Sheets, Contacts |
| **Web Search** | DuckDuckGo (`duckduckgo`) | Native, zero-token, privacy-preserving |
| **Web Reading** | Native HTTP markdown extractor (`web_fetch`) | Fast, headless-free page extraction |
| **Memory Engine** | Built-in SQLite FTS5 Full-Text Indexing (`fts-only`) | Indexes `MEMORY.md` and `memory/*.md` with zero vector API cost |
| **Session Lifecycle** | `per-sender` scope, `dmScope: main`, daily reset at 04:00 | Safeguard compaction active |
| **MCP** | Subsystem present, 0 servers configured | Native tools preferred during dogfooding |
| **Browser (CDP)** | Extension present, tool disabled in profile | Kept disabled to minimize attack surface |

---

## 5. Security & Safety Model

1. **Local Secrets Isolation**: All private OAuth tokens, GCP credential paths, gateway tokens, and SQLite session logs remain strictly on the local machine and are excluded via `.gitignore`.
2. **Deterministic Confirmation Boundaries**:
   - **Autonomous Execution**: Reading emails, checking calendars, searching Drive, local file reads, web searches, and memory retrieval.
   - **Explicit Confirmation Required**: Sending outbound emails, altering or deleting calendar events, modifying Drive files, and executing arbitrary shell scripts.
3. **Hard Gateway Denials**: Gateway nodes block invasive OS commands (`camera.snap`, `screen.record`, `sms.send`, `contacts.add`).

---

## 6. Repository Layout

```
claw/
├── config/                  # Sanitized configuration & approval templates
│   ├── openclaw.json.template
│   ├── env.template
│   └── exec-approvals.json.template
├── docs/                    # Architectural & operational documentation
│   ├── architecture.md      # Detailed runtime & subsystem architecture
│   ├── connectors.md        # Google Workspace & web connector specifications
│   ├── security.md          # Security posture, secret handling, & permissions
│   ├── dogfooding.md         # Daily usage workflow & operational checklist
│   ├── decisions.md         # Architecture Decision Records (ADRs)
│   └── fos-audit.md         # Comparative analysis against FOS backend blueprint
├── workspace-templates/     # Clean identity, soul, user, and agent templates
│   ├── IDENTITY.md
│   ├── USER.md
│   ├── SOUL.md
│   ├── AGENTS.md
│   ├── TOOLS.md
│   ├── HEARTBEAT.md
│   └── MEMORY.md.template
├── skills/                  # Bundled OpenClaw skill extensions
├── dist/                    # Compiled OpenClaw runtime distribution
├── src/                     # Core runtime sources
├── openclaw.mjs             # Node.js entry point launcher
└── package.json             # Package manifests and dependency tree
```

---

## 7. Current Dogfooding Phase

We are actively dogfooding Claw to validate:
- Reliable Google Workspace read/write triage workflows.
- Accurate SQLite FTS5 long-term memory retrieval.
- Daily briefing compilation (Calendar + Gmail triage).
- Safe human-in-the-loop confirmation UX.

---

## 8. Mesnium — Future Vision & Possibilities

> **Document Audience:** Co-founder, Technical Leadership, and Core Engineering Team  
> **Purpose:** Authoritative architectural and strategic roadmap establishing what Mesnium is today, the locked product direction, long-term deployment models, future product possibilities, engineering philosophy, and commercial trajectory.

---

### 8.1 What Mesnium Is Today

Mesnium is an **AI-powered business operating system** designed to manage and execute daily company operations, coordinate knowledge and communications, automate recurring processes, and assist leadership in decision-making. 

To understand Mesnium's technical foundation, the following distinctions are established:

* **OpenClaw is Infrastructure, Not the Customer Product:** OpenClaw serves strictly as the underlying headless engine and multi-channel runtime. It provides the embedded ReAct execution loop, tool dispatching, session stores, SQLite WAL storage, vector extensions (`sqlite-vec`), WebSocket JSON-RPC protocols, native CLI connectors (`gog`), and background cron daemons. OpenClaw is the engine room; Mesnium is the customer-facing operating system.
* **Chief of Staff is the Primary Interface:** The primary customer experience is anchored around the **Chief of Staff** (`chat`). The Chief of Staff acts as the business owner's centralized AI counterpart and executive coordinator. It handles high-level directives, coordinates daily operations, conducts research, delegates subtasks to specialist agents, and surfaces pending approvals.
* **The Core AI Workforce of Five Agents:** Rather than an unbounded collection of ad-hoc bots, Mesnium operates with a disciplined, locked workforce of five foundational agents (`dist/mesnium-agents/registry.js`):
  1. **AI Receptionist (`agent_receptionist`)**: Handles inbound business inquiries, operates the public website chat widget (`dist/control-ui/widget/mesnium-widget.js`), answers questions using verified knowledge, captures qualified leads, and proposes calendar appointments.
  2. **Sales Agent (`agent_sales`)**: Qualifies inbound and outbound leads, conducts prospect research, drafts personalized email outreach and follow-ups, and prepares prospect call agendas.
  3. **Marketing Agent (`agent_marketing`)**: Gathers market and competitor intelligence, extracts customer persona insights, analyzes marketing collateral, drafts multi-channel campaign copy, and creates synthesis reports.
  4. **Operations Agent (`agent_operations`)**: Coordinates recurring operational workflows, manages workspace documentation and local files, proposes safe file reorganizations, and monitors background automations.
  5. **Executive Assistant (`agent_executive`)**: Synthesizes cross-system business intelligence, compiles daily executive morning briefings (aggregating unread emails, calendar events, and operational tasks), tracks high-priority deadlines, and maintains executive rhythm.
* **The Shared Brain Concept:** In Mesnium, the **Shared Brain** (`overview`) is a core product and UX primitive representing the connected intelligence across agents, business knowledge, long-term memory, integrations, workflow execution states, and live business activity. Rather than trapping context in isolated chat threads, the Shared Brain unifies what the business knows and what its agents are doing into a synchronized intelligence layer.
* **Implemented Capabilities in this Codebase:**
  * **Deterministic Document Extraction:** Fast, local, zero-token extraction for DOCX, XLSX, PDF (via WebAssembly PDFium), PPTX, CSV, and ZIP archives without third-party API reliance.
  * **Google Workspace Hub (`gog.exe`):** Native Go binary with OAuth 2.0 PKCE supporting Gmail (search, draft, send proposals), Google Calendar (agenda, meeting proposals), Google Drive (search, upload proposals), Docs, Sheets, and Contacts.
  * **Mesnium Knowledge & Hybrid RAG:** Unified vector embedding search (`sqlite-vec`) combined with lexical BM25 ranking (`FTS5`) across workspace documents and company guidelines.
  * **Action Gatekeeper & Approvals Hub (`dist/mesnium-actions`):** Enforces strict human-in-the-loop verification on all consequential external mutations (outbound emails, calendar mutations, Drive uploads, filesystem movements).
  * **Business Context & Projection Engine (`dist/mesnium-business`):** Structured configuration store managing business identity, offerings, target customers, brand voice, operating policies, and role-specific agent tuning.
  * **Business Packs Registry (`dist/mesnium-business/packs-registry.js`):** Declarative pack registry with the reference Real Estate Pack (`pack_real_estate`).
  * **Mesnium Workflow Engine (`dist/mesnium-workflows`):** Durable workflow orchestrator supporting manual, scheduled, and event-based triggers, conditional branching, agent delegation steps, tool action steps, and approval gates.
  * **Public Website Receptionist (`dist/mesnium-public`):** Lightweight, embeddable website widget with tenant isolation, rate limiting, and secure inbound inquiry routing.
  * **Voice & Web Intelligence:** Zero-cost Edge Neural TTS streaming and fast DuckDuckGo/readability research tools.

---

### 8.2 The Locked Product Direction: Mesnium Core + Business/Capability Packs

The locked architectural principle of Mesnium is:

$$\mathbf{Mesnium\ Core} + \mathbf{Optional\ Business/Capability\ Packs}$$

#### The Role of Mesnium Core
Mesnium Core provides the general operating system: the foundational 5-agent workforce, connected intelligence (Shared Brain, memory, knowledge), tool abstractions, Action Gatekeeper approvals, and system state management.

#### How Business Packs Work (and What They Are NOT)
* **NOT Separate Vertical Agents:** Business Packs do **not** create separate vertical agents (e.g. they do not spawn a separate "Realtor Agent" or "Legal Agent").
* **NOT Separate Runtimes:** Business Packs do **not** deploy parallel engines or microservices.
* **NOT Executable Code Injection:** Business Packs contain zero executable JavaScript; they are declarative, validated JSON structures.
* **INSTEAD:** Business Packs configure the **existing canonical workforce** by injecting domain-specific configuration across six structured dimensions:
  1. **Context:** Industry identity, company descriptions, service offerings, pricing models, and target customer profiles.
  2. **Rules & Policies:** Business rules, compliance boundaries, "things agents may say" vs. "things agents must not say" (e.g., prohibiting binding legal or financial guarantees), and human escalation triggers.
  3. **Workflows:** Domain-specific workflow templates (e.g., lead intake $\rightarrow$ criteria qualification $\rightarrow$ showing scheduling).
  4. **Knowledge Defaults & References:** Standard operating procedures (SOPs), document templates, and common FAQ libraries.
  5. **Agent-Specific Configuration:** Targeted behavioral and responsibility tuning for each of the five core agents (Receptionist, Sales, Marketing, Operations, Executive).
  6. **Capability Requirements & Entitlements:** Explicit declarations of required system capabilities (e.g., `calendar`, `crm`), validated against server-side permissions without granting unauthorized tool access.

#### Unified Workforce, Contextualized Behavior
Under this architecture, the **same agents behave differently depending on the business context and activated packs**:
* In a **Real Estate Brokerage**, the Sales Agent qualifies buyer pre-approvals and drafts comparable market analysis (CMA) notes; the Receptionist books private property showings.
* In a **Medical Clinic**, the Sales/Intake Agent verifies insurance eligibility; the Receptionist schedules clinical consultations.
* In a **Legal Practice**, the Sales/Intake Agent collects case merits and checks for conflict of interest; the Receptionist coordinates confidential client intakes.

#### The Real Estate Reference Example
The codebase already implements `pack_real_estate` as the canonical reference pack (`dist/mesnium-business/packs-registry.js`):
* **AI Receptionist:** Configured with property viewing FAQs, buyer intake questions (budget, location, timeline), and 2-hour showing notice rules.
* **Sales Agent:** Configured with pre-approval financing verification, 5-stage real estate sales process, 2-1 buydown objection handling, and CMA coordination.
* **Marketing Agent:** Configured with Fair Housing compliance constraints, neighborhood lifestyle messaging, and open house campaign templates.
* **Operations Agent:** Configured with MLS status checks, escrow checklist tracking, and transaction document organization.
* **Executive Assistant:** Configured with closed sales volume metrics, Average Days on Market (DOM), active listing pipeline tracking, and commission forecasting.

The underlying architecture is completely industry-agnostic and will expand to support many business types (legal, financial services, healthcare, construction, e-commerce, consulting) through this identical projection mechanism.

---

### 8.3 Future Deployment Possibilities

> [!IMPORTANT]
> **"Local-first" is an architectural property (offline resilience, data sovereignty, local file indexing, low latency), NOT the commercial definition of Mesnium.**

The commercial product serves businesses wherever their operational requirements, security policies, and team scale demand. The long-term deployment roadmap encompasses four distinct models:

1. **Cloud Mesnium — Default SMB Offering:**
   * Fully managed multi-tenant cloud SaaS.
   * Frictionless onboarding: browser-accessible UI, Google OIDC authentication, hosted Gateway, managed vector storage, and automated background jobs.
   * Targeted at typical small and medium businesses that require immediate capability without desktop infrastructure management.
2. **Mesnium Desktop / Local Runtime:**
   * Packaged native application (Electron or Tauri runtime) bundling the local Node engine, SQLite storage, and direct OS filesystem access.
   * 100% private data boundary: API credentials and documents never leave the local workstation.
   * Targeted at solo founders, executives with sensitive personal files, and privacy-conscious professionals.
3. **Self-Hosted / Business Server:**
   * Containerized on-premise or private-cloud installation (Docker / Kubernetes) hosted on a dedicated office server, NAS, or private VPS.
   * Multi-user local area network access with shared on-site storage, internal database connectivity, and central backup policies.
   * Targeted at regulated firms (law firms, medical clinics, accounting practices) requiring full data sovereignty.
4. **Hybrid Deployment:**
   * Distributed local/edge desktop runtimes paired with a secure centralized cloud coordination plane.
   * Edge nodes process local files and desktop tools, while syncing team state, aggregated Shared Brain intelligence, and multi-agent coordination through the cloud.
   * Targeted at distributed teams operating across multiple physical locations.

---

### 8.4 Future Product Possibilities (Roadmap Directions)

The following areas represent strategic roadmap directions and future product possibilities. They are **not** currently implemented features:

* **Deeper Business-Specific Business Packs:** Pre-built, verified packs for high-value verticals including Legal Practice, Healthcare & Dental Clinics, Accounting & Tax Advisory, Construction & Contracting, Professional Consulting, and Hospitality.
* **Larger Integration Ecosystem:** Two-way integrations with industry standard CRMs (Salesforce, HubSpot, Pipedrive), ERPs, accounting software (QuickBooks, Xero), messaging channels (Slack, Microsoft Teams, WhatsApp Business), and project management platforms (Asana, ClickUp, Linear).
* **More Sophisticated Workflow Orchestration:** Visual node-based DAG workflow builder, dynamic multi-agent subtask pipelining, event-driven webhook triggers, parallel branch execution, and automatic rollback/compensation logic.
* **Advanced Approvals & Human-in-the-Loop Execution:** Multi-stakeholder approval chains, mobile push notifications with one-tap authorizations, threshold-based auto-approvals, and rich visual diffs for proposed changes.
* **Richer Business Memory & Organizational Knowledge:** Associative knowledge graphs, cross-session relationship tracking, temporal memory decay (pruning obsolete facts), and automated knowledge extraction from business communications.
* **Real-Time Shared Brain / System Visualization:** Live interactive topology visualization rendering real-time agent execution states, active subtask delegations, knowledge graph links, pending approvals, and operational health indicators.
* **Stronger Analytics & Business Intelligence:** Comprehensive KPI dashboards, revenue pipeline conversion metrics, agent productivity analytics, process bottleneck detection, and predictive operational forecasts.
* **Proactive Business Monitoring:** Autonomous background monitors continuously evaluating emails, schedules, and metrics to detect anomalies, SLA breaches, customer churn signals, and pending deadlines before human escalation occurs.
* **More Sophisticated Sales & Revenue Operations:** Autonomous lead scoring, multi-touch email cadence management, CRM deal hygiene, objection synthesis, and intelligent proposal assembly.
* **Advanced Marketing Automation:** Cross-channel campaign scheduling, dynamic marketing asset generation, and automated audience engagement tracking.
* **Voice AI:** Conversational inbound and outbound telephony, automated phone qualification for reception, voice-driven meeting transcription with automatic action extraction, and hands-free voice control for Chief of Staff.
* **Expanded Google Workspace & Enterprise Integrations:** Deep two-way collaborative Google Docs and Sheets authoring, and full Microsoft 365 / SharePoint enterprise feature parity.
* **Capability Marketplace & Paid Business Packs:** Verified third-party developer marketplace where industry practitioners and software vendors can author, publish, and monetize specialized Business Packs, workflow templates, and connectors.
* **Custom Capabilities & Implementation Services:** Dedicated enterprise customization layer for proprietary database connectors, internal ERP integrations, and tailored operational workflows.
* **Multi-Location & Multi-Team Businesses:** Multi-tenant hierarchy (headquarters $\rightarrow$ regional branches), role-based access control (RBAC), team-isolated workspaces, and aggregated executive roll-up reporting.
* **Enterprise & Private Cloud Deployments:** Enterprise Single Sign-On (SAML/Okta), SOC2 Type II compliance readiness, SIEM audit log streaming, and dedicated VPC hosting.
* **The General Business Execution Layer:** Ultimately evolving Mesnium from a chat assistant or collection of automations into an autonomous operating layer that powers the end-to-end execution of modern businesses.

---

### 8.5 Strategic Product Philosophy

Mesnium is built upon strict architectural and operational tenets that differentiate it from generic AI wrappers:

1. **Anti-Fragmentation — NOT Hundreds of "AI Employees":**
   * Mesnium fundamentally rejects the industry trend of spawning hundreds of disconnected, gimmick "AI bot employees." Having 50 specialized chat personas creates cognitive overload, fractured context, conflicting actions, and coordination failure.
   * Instead, Mesnium implements a **small, disciplined core workforce of five foundational agents** whose roles correspond to standard executive functions. Their domain expertise is configured dynamically through Business Packs, context, workflows, permissions, and knowledge.
2. **Deterministic Automation vs. LLM Reasoning:**
   * LLMs are probabilistic, expensive, and latency-heavy. 
   * **Rule:** Deterministic code (parsers, state machines, regular expressions, database queries, mathematical calculations, cron triggers) must be used wherever an LLM is unnecessary.
   * LLMs are reserved strictly for tasks where natural language understanding, open-ended reasoning, contextual synthesis, and linguistic judgment genuinely add value.
3. **UI Truth & Functional Grounding:**
   * Every capability, button, toggle, and status metric exposed in the Mesnium UI must map directly to real, functional backend implementation.
   * Placebo controls, mock data cards, and synthetic demo facades are strictly prohibited.
4. **Foundational Security, Permissions, Approvals & Auditability:**
   * Business operations involve confidential customer records, financial transactions, and brand reputation.
   * Consequential external mutations must be intercepted by the Action Gatekeeper and require explicit human confirmation.
   * Every agent action, delegation, and state change is recorded in an immutable Activity Ledger with absolute sanitization of secrets, tokens, and internal paths.
5. **OpenClaw Infrastructure Discipline:**
   * OpenClaw remains headless engine infrastructure beneath Mesnium.
   * Internal engine mechanics (JSON-RPC protocols, low-level process sockets, raw tool dispatchers) are concealed beneath Mesnium's intuitive, business-first product experience.

---

### 8.6 Long-Term Commercial Model

The strategic commercial architecture for Mesnium is structured around three complementary revenue streams (documented for product alignment; billing is deliberately not implemented in code):

1. **Mesnium Core Subscription:**
   * Recurring SaaS subscription (e.g. Starter, Professional, Business tiers).
   * Grants access to the base operating system: Chief of Staff interface, the canonical 5-agent workforce, Shared Brain, local document intelligence, Google Workspace hub, and baseline workflow execution.
2. **Optional Business & Capability Packs:**
   * Modular recurring add-ons or one-time license fees for specialized vertical packs (e.g. Real Estate Pack, Legal Practice Pack, Medical Clinic Pack) or advanced capabilities (e.g. Inbound Voice AI, Enterprise CRM Synchronization).
3. **Custom Capabilities & Implementation Services:**
   * High-margin enterprise services including bespoke Business Pack authoring, custom database and legacy software integrations, on-premise deployment assistance, and enterprise workflow onboarding.

---

### 8.7 Vision

> **The ultimate ambition is for Mesnium to become the operating layer through which a business can understand its information, coordinate its workforce, automate recurring processes, make decisions, and execute work — with AI acting as the intelligence layer rather than merely a chat interface.**
