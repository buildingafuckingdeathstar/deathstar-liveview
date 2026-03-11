# deathstar-liveview

A pixel art visualization dashboard for [OpenClaw](https://openclaw.ai) agent activity.

Watch your AI agent come to life — real-time pixel art animations that reflect what the agent is actually doing: thinking, calling tools, receiving messages, idling, erroring.

---

## What It Does

Connects to a locally-running OpenClaw gateway via WebSocket, translates agent lifecycle events into visual states, and renders them as animated pixel art on an HTML5 canvas. Runs as a lightweight web app on the same machine as the gateway (e.g. a Raspberry Pi), accessible from any device on the local network or via Tailscale.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  OpenClaw Gateway                   │
│              (WebSocket, port 18789)                │
└──────────────────────┬──────────────────────────────┘
                       │ WS events (agent activity,
                       │ tool calls, messages, lifecycle)
                       ▼
┌─────────────────────────────────────────────────────┐
│              Bridge Server (Node.js)                │
│  • Authenticates with gateway token                 │
│  • Subscribes to agent session events               │
│  • Normalizes events → activity states              │
│  • Exposes SSE endpoint for browser clients         │
│  • Serves static frontend                           │
└──────────────────────┬──────────────────────────────┘
                       │ Server-Sent Events (SSE)
                       ▼
┌─────────────────────────────────────────────────────┐
│              Browser Frontend                       │
│  • HTML5 canvas (16×16 or 32×32 pixel art)         │
│  • Sprite sheets per agent state                    │
│  • Animation loop (requestAnimationFrame)           │
│  • One sprite per active agent session              │
└─────────────────────────────────────────────────────┘
```

### Agent States → Pixel Art

| State | Trigger | Visual |
|-------|---------|--------|
| `idle` | No activity | Character resting/breathing |
| `thinking` | LLM inference in progress | Animated thought bubble |
| `tool_call` | Tool being executed | Character using wrench/gear |
| `message_in` | Inbound message received | Speech bubble, notification |
| `message_out` | Agent reply sent | Character talking |
| `error` | Error event | Red flash |
| `multi` | Multiple sessions active | Multiple sprites |

### Event Flow

OpenClaw emits WebSocket events on its gateway protocol. The bridge server connects as an `operator` client, subscribes to session events, and maps them:

- `session.started` → spawn new sprite
- `agent.thinking` → `thinking` state
- `agent.tool_call` → `tool_call` state  
- `session.message` → `message_in` / `message_out`
- `session.error` → `error` state
- `session.ended` → despawn sprite

### Data Flow

```
Gateway WS event
  → bridge normalizes to: { sessionId, state, ts, meta }
  → SSE broadcast to all connected browser clients
  → browser updates sprite state + triggers animation
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Bridge server | Node.js + Express |
| Gateway client | `ws` WebSocket library |
| Browser → bridge | Server-Sent Events (SSE) |
| Frontend | Vanilla JS + HTML5 Canvas |
| Pixel art assets | Static PNG sprite sheets |
| Auth | OpenClaw gateway token (env var) |

No heavy frameworks. Runs comfortably on a Raspberry Pi 5.

---

## Project Structure

```
deathstar-liveview/
├── server/
│   ├── index.js          # Express server + SSE endpoint
│   ├── gateway-client.js # OpenClaw WS connection + event normalization
│   └── state-machine.js  # Session state tracking
├── public/
│   ├── index.html        # Single-page frontend
│   ├── canvas.js         # Pixel art renderer + animation loop
│   ├── sprites/          # PNG sprite sheets
│   └── style.css
├── AGENTS.md             # Agent context for AI assistants
├── MEMORY.md             # Project memory
└── README.md
```

---

## Setup

```bash
# Install dependencies
npm install

# Configure (copy and edit)
cp .env.example .env
# Set OPENCLAW_GATEWAY_URL and OPENCLAW_TOKEN

# Run
npm start
```

Access at `http://localhost:3000` (or your Pi's Tailscale address).

---

## Gitflow

- `develop` — active development
- `staging` — integration / QA
- `release/x.y.z` — release candidates
- `main` — stable releases only

---

## Status

🚧 Early development
