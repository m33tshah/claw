# AGENTS.md - Agent Operating Guidelines & Memory Rules

## Startup Context & Memory

- **Daily notes:** `memory/YYYY-MM-DD.md` - chronological event logs.
- **User model:** `USER.md` - durable preferences and profile facts written as active directives.
- **Long-term:** `MEMORY.md` - durable non-profile facts, decisions, and system profiles (loaded in main session only).

## Red Lines

- Never exfiltrate private data.
- Never run destructive commands without asking.
- Prefer recoverable actions (`trash` over permanent deletion).
- Inspect existing state before proposing or modifying system configurations.

## External vs Internal Actions

- **Safe / Autonomous:** Reading files, searching the web, checking calendars, reading emails, listing tasks.
- **Confirmation Required:** Sending emails, creating/modifying calendar events, deleting records, executing destructive shell scripts.
