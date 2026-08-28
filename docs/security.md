# Claw Security & Permission Architecture

## 1. Security Principles

1. **Local-First Secret Isolation**: No access tokens, refresh tokens, private keys, session transcripts, or credential files are ever committed to version control.
2. **Deterministic Confirmation Boundaries**: Autonomous read-only actions; human-gated destructive or external mutations.
3. **Defense in Depth**: Gateway command denials, local IPC approval sockets, and model-level prompt guardrails.

---

## 2. Secret & Credential Boundaries

```
+-------------------------------------------------------------+
|                   LOCAL RUNTIME MACHINE                     |
|                                                             |
|  [Private Credentials]                                      |
|  - %APPDATA%\gcloud\application_default_credentials.json    |
|  - ~/.openclaw/.env (GCP project IDs)                      |
|  - ~/.openclaw/openclaw.json (Gateway token)               |
|  - ~/.openclaw/exec-approvals.json (IPC socket token)       |
|  - ~/.openclaw/agents/main/sessions/*.jsonl (Private chat)  |
|  - ~/.openclaw/workspace/memory/MEMORY.md (Personal facts)  |
+-------------------------------------------------------------+
                              |
                     [.gitignore Barrier]
                              |
+-------------------------------------------------------------+
|               GITHUB (PRIVATE DEV REPOSITORY)               |
|                                                             |
|  - Source code & tool implementations                       |
|  - Architectural documentation & ADRs                       |
|  - Sanitized configuration templates (.template)            |
|  - Workspace bootstrap templates                            |
+-------------------------------------------------------------+
```

---

## 3. Human-in-the-Loop Confirmation Policy

| Action Category | Examples | Execution Mode |
| :--- | :--- | :--- |
| **Local Reads** | File reading, directory listing, system status | **Autonomous** |
| **Web Research** | DuckDuckGo search, web fetch, article parsing | **Autonomous** |
| **Google Read** | Listing unread emails, fetching calendar events, searching Drive | **Autonomous** |
| **Google Write** | Creating email drafts, preparing meeting notes | **Autonomous** |
| **Google Send/Delete** | Sending emails, deleting emails, deleting calendar events | **Confirmation Required** |
| **Destructive FS** | Deleting workspace files, overwriting critical files | **Confirmation Required** |
| **Shell Scripts** | Executing custom scripts, system modifications | **Confirmation Required** |

---

## 4. Gateway Command Policies

The OpenClaw Gateway enforces command blocking in `openclaw.json` under `gateway.nodes.denyCommands`:
```json
"denyCommands": [
  "camera.snap",
  "camera.clip",
  "screen.record",
  "contacts.add",
  "calendar.add",
  "reminders.add",
  "sms.send",
  "sms.search"
]
```
These restrictions block peripheral hardware hijacking and direct OS contact mutations from unapproved subagents.

---

## 5. SSRF & Network Protections

- Web fetch and search connectors enforce strict SSRF validation (`dist/plugin-sdk/ssrf-policy.js`).
- Outbound requests to `127.0.0.1`, `localhost`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, and Cloud metadata endpoints (`169.254.169.254`) are intercepted and rejected.
