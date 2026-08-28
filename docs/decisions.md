# Claw Architecture Decision Records (ADRs)

## ADR 001: Adopt OpenClaw as Core Agent Gateway

- **Status**: Accepted
- **Context**: We needed a stable, multi-channel agent gateway supporting tool registration, session compaction, subagent spawning, and gateway protocols without building a low-level agent engine from scratch.
- **Decision**: Build Claw as an applied personal assistant on top of the OpenClaw Node.js runtime.
- **Consequence**: Instant access to proven session management, compaction algorithms, and subagent concurrency while retaining full control over configuration and tools.

---

## ADR 002: Google Cloud Vertex AI ADC as Primary Inference Provider

- **Status**: Accepted
- **Context**: Managing third-party API keys (OpenAI, Anthropic, OpenRouter) adds token rotation overhead and potential key leakage risks.
- **Decision**: Use `google-vertex/gemini-2.5-flash` authenticated via local Application Default Credentials (ADC) tied to Meet's Google Cloud project (`gen-lang-client-0255502107`).
- **Consequence**: Enterprise-grade availability (99.99%), 1M token context window, zero API key maintenance, and fast inference.

---

## ADR 003: SQLite FTS5 for Lexical Full-Text Memory

- **Status**: Accepted
- **Context**: Vector embedding models introduce latency, embedding API costs, vector dimension mismatches, and search drift on small personal document sets.
- **Decision**: Use OpenClaw's built-in SQLite FTS5 full-text indexing (`provider: "none"`, model: `fts-only`) over `memory/MEMORY.md` and `memory/*.md`.
- **Consequence**: Instant, deterministic keyword search with zero vector cost and zero external embedding dependencies.

---

## ADR 004: Native Go CLI (`gog`) for Google Workspace Integration

- **Status**: Accepted
- **Context**: Direct Python/Node Google API SDK integrations require complex local server setups, heavy token storage, and frequent token refresh handling.
- **Decision**: Leverage `gog.exe`, a single compiled Go binary with unified OAuth 2.0 covering Gmail, Calendar, Drive, Docs, Sheets, and Contacts.
- **Consequence**: Robust CLI execution, unified account management (`m16bshah@gmail.com`), and easy command invocation via the agent's tool harness.

---

## ADR 005: DuckDuckGo & Native HTTP Fetch over Headless Browser

- **Status**: Accepted
- **Context**: Headless Chrome / Playwright browser automation is heavy, prone to process crashes on Windows, and increases the attack surface for arbitrary script execution.
- **Decision**: Use DuckDuckGo for public web searches and native HTTP readability parsing (`web_fetch`) for link reading. Keep the CDP `browser` tool disabled in the default profile.
- **Consequence**: Lightweight, rapid search and article extraction with zero browser memory overhead and tight security isolation.

---

## ADR 006: Local-Only Credential Isolation & Git Version Control

- **Status**: Accepted
- **Context**: Claw handles personal emails, calendar events, and private files. Putting engineering work under Git must never risk exposing private credentials or conversation transcripts.
- **Decision**: Establish a private GitHub repository (`m33tshah/claw`) with an aggressive `.gitignore` excluding all `.env`, SQLite state files, credentials, and raw memory files. Track code, configurations templates, and documentation only.
- **Consequence**: Clean, auditable development history without any risk of secret exfiltration.
