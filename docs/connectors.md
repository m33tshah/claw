# Claw Connector & Integration Blueprint

## 1. Connector Matrix

| Connector | Technology / Binary | Capabilities | Auth Mechanism | Dogfooding Status |
| :--- | :--- | :--- | :--- | :--- |
| **Google Workspace** | `gog.exe` (Go CLI) | Gmail, Calendar, Drive, Docs, Sheets, Contacts | OAuth 2.0 (`m16bshah@gmail.com`) | `[ACTIVE / PRIMARY]` |
| **Web Search** | DuckDuckGo Provider | Public search query & link extraction | Zero-auth / Public | `[ACTIVE / PRIMARY]` |
| **Web Fetch** | Native HTTP Readability | HTML to clean Markdown parsing | Zero-auth / Public | `[ACTIVE / PRIMARY]` |
| **Filesystem** | Core FS Tools (`read`/`write`/`edit`) | Local workspace & project file management | Windows OS ACLs | `[ACTIVE / PRIMARY]` |
| **Git / Shell** | `exec` / `process` | Git status, branch creation, local CLI tools | Local CLI environment | `[ACTIVE / PRIMARY]` |

---

## 2. Google Workspace Integration (`gog`)

Google Workspace is integrated via the compiled Go binary `C:\Users\Meet\go\bin\gog.exe`.

### Scopes & Coverage
- **Gmail**: Read messages, search threads, list labels, draft emails, send messages.
- **Calendar**: List upcoming events, check conflicts, fetch agenda details, create events.
- **Drive**: Search files, inspect metadata, list folder contents, export document links.
- **Docs**: Read document contents, append text notes, create meeting records.
- **Sheets**: Read tabular data, append rows, inspect spreadsheets.
- **Contacts**: Search contacts, resolve email addresses and phone numbers.

### Operating Guidelines
1. **Read Operations**: Run autonomously (e.g. `gog gmail list --unread`, `gog cal list --today`).
2. **Write / Mutation Operations**: Draft first by default. When an email or meeting invite is drafted, the agent presents the draft to Meet and waits for explicit approval before sending.

---

## 3. Web Intelligence Connectors

### DuckDuckGo Search (`duckduckgo`)
- Zero API key required; privacy-preserving.
- Provides immediate keyword search results with URL titles, snippets, and links.
- Configured in `openclaw.json` under `tools.web.search.provider = "duckduckgo"`.

### Web Fetch (`web_fetch`)
- Directly fetches web content over HTTP without spawning heavy headless browser instances.
- Automatically strips boilerplate, scripts, and navigation to produce concise Markdown.
- Fast, secure, and immune to client-side browser fingerprinting or credential leakage.

---

## 4. Inactive & Disabled Connectors

| Connector | Reason for Inactive Status |
| :--- | :--- |
| **Notion** | Redundant during phase 1; Google Workspace is the primary knowledge hub. |
| **GitHub API** | Local Git CLI (`exec`) handles repository version control without extra PAT overhead. |
| **Slack / Discord** | Not required for single-user executive assistant dogfooding; Webchat is the focus. |
| **Smart Home (`openhue`, `sonoscli`)** | Non-essential hardware control; disabled to maintain tight security boundaries. |
