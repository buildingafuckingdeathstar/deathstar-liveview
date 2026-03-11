# AGENTS.md — deathstar-liveview

This is the agent context file for AI coding assistants working on this project.

## What This Project Is

A real-time pixel art visualization dashboard for OpenClaw agent activity.
- Connects to a local OpenClaw gateway via WebSocket
- Translates agent events into pixel art animation states
- Renders in a browser using HTML5 canvas
- Bridge server runs on the same machine as the gateway (Raspberry Pi 5)

## Repository & Workflow

- **Org:** buildingafuckingdeathstar
- **Repo:** deathstar-liveview
- **Branch strategy:** Gitflow — develop → staging → release/x.y.z → main
- **Default branch:** develop (all PRs target develop)

## Tech Stack

- **Bridge server:** Node.js + Express
- **Gateway comms:** `ws` package (WebSocket client)
- **Browser transport:** SSE (Server-Sent Events)
- **Frontend:** Vanilla JS + HTML5 Canvas (no framework)
- **Auth:** OpenClaw gateway token via env var

## Architecture Summary

```
OpenClaw Gateway (WS :18789)
  → Bridge Server (Node.js Express)
    → SSE stream
      → Browser (canvas + sprites)
```

## Key Constraints

- Must run on Raspberry Pi 5 (arm64, Node.js v24+)
- No React/Vue/Angular — vanilla JS only for frontend
- Auth via `OPENCLAW_TOKEN` env var (never hardcoded)
- Pixel art sprites: 16×16 or 32×32 px, PNG sprite sheets
- Keep bridge server minimal — no DB, state in memory only

## OpenClaw Gateway Protocol

- WebSocket on `ws://localhost:18789/ws`
- Auth handshake: respond to `connect.challenge` with signed `connect` request
- Client role: `operator`, scopes: `["operator.read"]`
- Events relevant to us:
  - Session lifecycle: `session.started`, `session.ended`
  - Agent activity: look for thinking/tool/message events in the stream
- See OpenClaw docs: `/home/pi/.nvm/.../openclaw/docs/gateway/protocol.md`

## Agent States

| State | Visual |
|-------|--------|
| `idle` | Breathing/resting animation |
| `thinking` | Thought bubble animation |
| `tool_call` | Tool/wrench animation |
| `message_in` | Incoming speech bubble |
| `message_out` | Outgoing speech bubble |
| `error` | Red flash |

## Memory Files

- `MEMORY.md` — project decisions, context, lessons learned
- `memory/YYYY-MM-DD.md` — daily work logs

## Coding Standards

- ES modules (`import`/`export`)
- Async/await throughout
- No `var`, use `const`/`let`
- JSDoc comments on public functions
- Keep files small — split by responsibility

## Response Footer

Always append to every reply:

---
🤖 Model: <model-id>
