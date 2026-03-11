# MEMORY.md — deathstar-liveview

Project memory for AI assistants. Curated decisions and context.

## Project Origin

- Created: 2026-03-11
- Owner: Tim Cruse (@teuteuguy / buildingafuckingdeathstar org)
- Idea: pixel art visualization of OpenClaw agent activity, running as a side app on the Pi

## Key Decisions

### Architecture
- Bridge server pattern (not direct WS from browser) — avoids CORS/auth complexity, enables server-side event normalization
- SSE over WebSocket for browser transport — simpler, one-directional, perfect for this use case
- Vanilla JS — no framework overhead, runs well on Pi
- HTML5 canvas for rendering — no DOM manipulation overhead for animations

### Tech
- Node.js bridge server (not Python) — matches OpenClaw's ecosystem, better WS library support
- Express for HTTP — minimal, well-known
- No database — state is ephemeral, in-memory only

### Workflow
- Gitflow: develop → staging → release → main
- All development on `develop` branch
- SSH key alias: `github-deathstar-liveview`

## OpenClaw Integration Notes

- Gateway runs on Pi at port 18789
- Auth: operator role with `operator.read` scope
- Need to implement proper challenge/response handshake (see protocol.md)
- Gateway token stored in `~/.openclaw/config.json` — need to expose as env var for this app

## Status

- [ ] README.md written ✅
- [ ] AGENTS.md written ✅  
- [ ] Project structure scaffolded
- [ ] Bridge server: gateway WS client
- [ ] Bridge server: SSE endpoint
- [ ] Frontend: canvas renderer
- [ ] Frontend: sprite assets
- [ ] .env.example
- [ ] npm init + package.json
