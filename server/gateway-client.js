/** @module gateway-client — OpenClaw gateway WebSocket connection */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://localhost:18789/ws';
const TOKEN = process.env.OPENCLAW_TOKEN;

export const gatewayEmitter = new EventEmitter();

let ws = null;
let demoInterval = null;
let reconnectTimer = null;

// ──────────────────────────────────────────────────────────────────────────────
// Demo mode — fake agents cycle through states when no gateway is available
// ──────────────────────────────────────────────────────────────────────────────

const DEMO_AGENTS = [
  { sessionId: 'demo-1', agentId: 'agent-main', name: 'ARIA-7' },
  { sessionId: 'demo-2', agentId: 'agent-02',   name: 'NEXUS-3' },
  { sessionId: 'demo-3', agentId: 'agent-03',   name: 'PULSE-X' },
];

const ALL_STATES = ['idle', 'thinking', 'tool_call', 'message_in', 'message_out', 'error'];

function startDemoMode() {
  if (demoInterval) return;
  console.log('[gateway] Demo mode active — cycling 3 fake agents');

  // Emit initial idle state for all demo agents
  for (const agent of DEMO_AGENTS) {
    gatewayEmitter.emit('state', { ...agent, state: 'idle', ts: Date.now() });
  }

  let tick = 0;
  demoInterval = setInterval(() => {
    tick++;
    // Rotate a random agent to a new state every 3s
    const agent = DEMO_AGENTS[tick % DEMO_AGENTS.length];
    const state = ALL_STATES[Math.floor(Math.random() * ALL_STATES.length)];
    gatewayEmitter.emit('state', { ...agent, state, ts: Date.now() });
  }, 3000);
}

function stopDemoMode() {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Event mapping
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Maps a gateway event name + payload to an agent state string.
 * @param {string} event
 * @param {object} payload
 * @returns {string|null}
 */
function mapEventToState(event, payload = {}) {
  switch (event) {
    case 'session.started':  return 'idle';
    case 'agent.thinking':   return 'thinking';
    case 'agent.tool_call':  return 'tool_call';
    case 'session.message':  return payload.role === 'user' ? 'message_in' : 'message_out';
    case 'session.error':    return 'error';
    default:                 return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// WebSocket connection
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Connects to the OpenClaw gateway. Falls back to demo mode on failure.
 */
export function connect() {
  if (!TOKEN || TOKEN === 'your_token_here') {
    console.log('[gateway] OPENCLAW_TOKEN not set — using demo mode');
    startDemoMode();
    return;
  }

  console.log(`[gateway] Connecting to ${GATEWAY_URL}`);
  ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    console.log('[gateway] WebSocket open — awaiting challenge');
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Challenge/response handshake
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      ws.send(JSON.stringify({
        type: 'req',
        id:   'init',
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: { id: 'liveview', version: '1.0.0', platform: 'linux', mode: 'operator' },
          role: 'operator',
          scopes: ['operator.read'],
          caps: [],
          commands: [],
          permissions: {},
          auth: { token: TOKEN },
        },
      }));
      return;
    }

    if (msg.type === 'event') {
      const p = msg.payload || {};
      const state = mapEventToState(msg.event, p);

      if (state) {
        gatewayEmitter.emit('state', {
          sessionId: p.sessionId || msg.sessionId || 'unknown',
          agentId:   p.agentId   || msg.agentId,
          name:      p.name      || msg.name || 'Agent',
          state,
          ts: Date.now(),
        });
      }

      if (msg.event === 'session.ended') {
        gatewayEmitter.emit('remove', {
          sessionId: (msg.payload || {}).sessionId || msg.sessionId,
        });
      }
    }
  });

  ws.on('error', (err) => {
    console.warn(`[gateway] Connection error: ${err.message} — falling back to demo mode`);
    startDemoMode();
  });

  ws.on('close', () => {
    console.log('[gateway] Disconnected. Reconnecting in 5s…');
    ws = null;
    reconnectTimer = setTimeout(connect, 5000);
  });
}

/**
 * Sends a message to an active session via the gateway.
 * @param {string} sessionId
 * @param {string} text
 */
export function sendToSession(sessionId, text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log(`[gateway] Not connected — dropping message to ${sessionId}: ${text}`);
    return;
  }
  ws.send(JSON.stringify({
    type: 'req',
    id:   `chat-${Date.now()}`,
    method: 'session.message',
    params: { sessionId, text },
  }));
}
