/**
 * canvas.js — pixel art renderer for DeathStar LiveView
 * Draws an isometric-style open office with animated agent sprites.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const CELL_W = 88;
const CELL_H = 88;
const PAD    = 12;

const C = {
  bg:           '#0a0a1a',
  gridLine:     '#0d0d25',
  floorEmpty:   '#0f0f28',
  floorOccupied:'#13133a',
  deskSurface:  '#1a1a45',
  deskBorder:   '#22224a',
  ceoFloor:     '#18100a',
  ceoBorder:    '#5a3a00',
  serverFloor:  '#061006',
  serverBorder: '#004400',
  main:         '#ffd700',   // CEO / primary agent — gold
  agentA:       '#00ddff',   // even slots — cyan
  agentB:       '#00ff88',   // odd slots  — green
  bubbleBg:     'rgba(8,8,28,0.92)',
};

const STATE_COLOR = {
  idle:        '#4488ff',
  thinking:    '#bb44ff',
  tool_call:   '#ff8800',
  message_in:  '#00ff88',
  message_out: '#ffff44',
  error:       '#ff3333',
};

const STATE_LABEL = {
  idle:        'ZZZ',
  thinking:    null,  // animated dots
  tool_call:   'TOOL',
  message_in:  '<MSG',
  message_out: 'MSG>',
  error:       '!!!',
};

// ── State ─────────────────────────────────────────────────────────────────────

let canvas, ctx;
let frame = 0;
let maxAgents = 12;

/** @type {Map<string, {state:string, name:string, slot:number, agentId?:string}>} */
const agents  = new Map();
/** @type {(string|null)[]} slot index → sessionId */
const slots   = [];

let selectedSession = null;
let hwStats = { cpuPercent: 0, ramUsedGB: 0, ramTotalGB: 0, coreCount: 4 };

// ── Slot management ───────────────────────────────────────────────────────────

function assignSlot(sessionId) {
  // Already has a slot?
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === sessionId) return i;
  }
  // Find free slot
  for (let i = 0; i < maxAgents; i++) {
    if (!slots[i]) { slots[i] = sessionId; return i; }
  }
  // Extend
  const i = slots.length;
  slots.push(sessionId);
  return i;
}

function freeSlot(sessionId) {
  const i = slots.indexOf(sessionId);
  if (i >= 0) slots[i] = null;
}

/**
 * Returns top-left {x,y} of a desk cell and whether it's the CEO slot.
 * Slot 0 → CEO office (2×2), slots 1+ → regular grid starting right of CEO.
 */
function slotPos(slot) {
  const serverRoomW = 110;
  const usableW = canvas.width - serverRoomW - PAD * 2;

  if (slot === 0) {
    return { x: PAD, y: PAD, isCEO: true };
  }

  const s = slot - 1;
  // Regular grid starts after CEO block (2 cells wide)
  const startX = PAD + CELL_W * 2 + PAD;
  const cols = Math.max(1, Math.floor((usableW - CELL_W * 2 - PAD) / CELL_W));
  const col  = s % cols;
  const row  = Math.floor(s / cols);

  return { x: startX + col * CELL_W, y: PAD + row * CELL_H, isCEO: false };
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Office components ─────────────────────────────────────────────────────────

function drawBackground() {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle grid
  ctx.strokeStyle = C.gridLine;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < canvas.width; x += 20) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
}

function drawDesk(x, y, occupied, isCEO, isSelected) {
  const w = isCEO ? CELL_W * 2 - 6 : CELL_W - 6;
  const h = isCEO ? CELL_H * 2 - 6 : CELL_H - 6;

  // Floor tile
  ctx.fillStyle = isCEO ? C.ceoFloor : (occupied ? C.floorOccupied : C.floorEmpty);
  roundRect(x, y, w, h, 4);
  ctx.fill();

  // Border — highlight selected
  ctx.strokeStyle = isSelected ? '#00ff88' : (isCEO ? C.ceoBorder : C.deskBorder);
  ctx.lineWidth = isSelected ? 2 : 1;
  roundRect(x, y, w, h, 4);
  ctx.stroke();

  // Desk surface (bottom portion)
  const deskY = y + h - 24;
  ctx.fillStyle = C.deskSurface;
  ctx.fillRect(x + 6, deskY, w - 12, 16);

  if (occupied) {
    // Monitor
    const mx = x + w / 2 - 9;
    ctx.fillStyle = '#0a2040';
    ctx.fillRect(mx, deskY - 16, 18, 13);
    ctx.fillStyle = '#003366';
    ctx.fillRect(mx + 1, deskY - 15, 16, 11);
    // Screen glow (animated)
    const glowAlpha = 0.4 + 0.2 * Math.sin(frame * 0.05);
    ctx.fillStyle = `rgba(0, 80, 160, ${glowAlpha})`;
    ctx.fillRect(mx + 2, deskY - 14, 14, 9);
  }

  if (isCEO) {
    ctx.fillStyle = '#ffd70066';
    ctx.fillRect(x + 4, y + 4, 30, 10);
    ctx.fillStyle = '#ffd700';
    ctx.font = '7px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('★ CEO', x + 7, y + 12);
  }
}

/**
 * Draws an 8×16 pixel-art space-suit humanoid.
 * scale=1 for regular agents, scale=2 for CEO.
 */
function drawCharacter(cx, cy, color, scale) {
  const s = scale;
  const px = Math.round(cx - 8 * s);
  const py = Math.round(cy - 16 * s);

  // Helmet
  ctx.fillStyle = color;
  ctx.fillRect(px + 3*s, py,        10*s, 8*s);
  // Visor
  ctx.fillStyle = '#aaddff';
  ctx.fillRect(px + 4*s, py + 1*s,  8*s,  5*s);
  // Visor sheen
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(px + 4*s, py + 1*s,  2*s,  2*s);
  // Neck
  ctx.fillStyle = color;
  ctx.fillRect(px + 6*s, py + 8*s,  4*s,  2*s);
  // Body
  ctx.fillRect(px + 3*s, py + 10*s, 10*s, 8*s);
  // Left arm
  ctx.fillRect(px,        py + 10*s, 3*s,  6*s);
  // Right arm
  ctx.fillRect(px + 13*s, py + 10*s, 3*s,  6*s);
  // Left leg
  ctx.fillRect(px + 3*s,  py + 18*s, 4*s,  6*s);
  // Right leg
  ctx.fillRect(px + 9*s,  py + 18*s, 4*s,  6*s);
  // Chest stripe
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(px + 5*s, py + 11*s, 6*s, 5*s);
}

function drawStateBubble(bx, by, state, animFrame) {
  const color = STATE_COLOR[state] || '#ffffff';
  const bw = 36;
  const bh = 14;
  const bLeft = bx - bw / 2;
  const bTop  = by - bh;

  // Bubble body
  ctx.fillStyle = C.bubbleBg;
  roundRect(bLeft, bTop, bw, bh, 3);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  roundRect(bLeft, bTop, bw, bh, 3);
  ctx.stroke();

  // Tail
  ctx.fillStyle = C.bubbleBg;
  ctx.beginPath();
  ctx.moveTo(bx - 3, by);
  ctx.lineTo(bx + 3, by);
  ctx.lineTo(bx,     by + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Label
  ctx.fillStyle = color;
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';

  let label;
  if (state === 'thinking') {
    label = '.'.repeat((Math.floor(animFrame / 8) % 3) + 1);
  } else {
    label = STATE_LABEL[state] || '?';
  }
  ctx.fillText(label, bx, bTop + 10);
  ctx.textAlign = 'left';
}

function drawServerRoom() {
  const w = 100;
  const h = Math.min(canvas.height - PAD * 2, 300);
  const x = canvas.width - w - PAD;
  const y = PAD;

  ctx.fillStyle = C.serverFloor;
  roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = C.serverBorder;
  ctx.lineWidth = 1;
  roundRect(x, y, w, h, 4);
  ctx.stroke();

  ctx.fillStyle = '#00440088';
  ctx.fillRect(x + 2, y + 2, w - 4, 14);
  ctx.fillStyle = '#00aa44';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SERVER ROOM', x + w / 2, y + 12);
  ctx.textAlign = 'left';

  const rackH = 44;
  const rackCount = Math.floor((h - 24) / (rackH + 4));

  for (let r = 0; r < rackCount; r++) {
    const ry = y + 20 + r * (rackH + 4);
    const rx = x + 6;
    const rw = w - 12;

    // Rack chassis
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(rx, ry, rw, rackH);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, ry, rw, rackH);

    // Status LEDs (row of 6)
    for (let l = 0; l < 6; l++) {
      const phase = (frame + r * 11 + l * 7) % 40;
      const on = phase < 20;
      const ledColor = l % 3 === 0 ? '#00ff00' : l % 3 === 1 ? '#ffaa00' : '#ff4400';
      ctx.fillStyle = on ? ledColor : '#111';
      ctx.fillRect(rx + 4 + l * 13, ry + 4, 7, 7);
    }

    // Drive bays
    for (let d = 0; d < 3; d++) {
      ctx.fillStyle = '#111';
      ctx.fillRect(rx + 4 + d * 28, ry + 16, 24, 20);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 4 + d * 28, ry + 16, 24, 20);
      // Activity blink
      const actOn = (frame + r * 3 + d * 13) % 60 < 5;
      if (actOn) {
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(rx + 4 + d * 28 + 20, ry + 16 + 9, 3, 3);
      }
    }
  }
}

// ── Full render pass ──────────────────────────────────────────────────────────

function render() {
  frame = (frame + 1) % 3600;

  drawBackground();
  drawServerRoom();

  // Draw all desk slots (empty and occupied)
  const visibleSlots = Math.max(
    slots.length,
    Math.min(maxAgents, 20),
  );

  for (let i = 0; i < visibleSlots; i++) {
    const sessionId = slots[i] || null;
    const pos = slotPos(i);
    const occupied = sessionId !== null;
    const isSelected = sessionId === selectedSession;
    drawDesk(pos.x, pos.y, occupied, pos.isCEO, isSelected);
  }

  // Draw agent sprites + bubbles
  for (const [sessionId, agent] of agents) {
    const pos = slotPos(agent.slot);
    const isCEO  = pos.isCEO;
    const scale  = isCEO ? 2 : 1;
    const cellW  = isCEO ? CELL_W * 2 - 6 : CELL_W - 6;
    const cellH  = isCEO ? CELL_H * 2 - 6 : CELL_H - 6;

    // Character color
    const color = isCEO ? C.main : (agent.slot % 2 === 0 ? C.agentA : C.agentB);

    // Bob animation for idle
    const bobY = agent.state === 'idle' ? Math.round(Math.sin(frame * 0.06) * 1.2) : 0;

    // Character center (horizontal mid of cell, 28px from bottom for feet)
    const charX = pos.x + cellW / 2;
    const charY = pos.y + cellH - 28 + bobY;

    drawCharacter(charX, charY, color, scale);

    // Bubble above head (14*scale px above character top = charY - 24*scale)
    const bubX = charX;
    const bubY = charY - 24 * scale;
    drawStateBubble(bubX, bubY, agent.state || 'idle', frame);

    // Agent name label
    ctx.fillStyle = 'rgba(200,200,255,0.6)';
    ctx.font = `${isCEO ? 9 : 7}px monospace`;
    ctx.textAlign = 'center';
    const label = (agent.name || sessionId).slice(0, 10);
    ctx.fillText(label, charX, pos.y + cellH - 4);
    ctx.textAlign = 'left';
  }

  requestAnimationFrame(render);
}

// ── HW polling ────────────────────────────────────────────────────────────────

async function fetchHW() {
  try {
    const res  = await fetch('/api/hw');
    hwStats    = await res.json();
    const { cpuPercent, ramUsedGB, ramTotalGB, coreCount } = hwStats;

    maxAgents = Math.min(100, Math.max(3, Math.floor((ramTotalGB / 2) * coreCount / 4)));

    const cpuClass = cpuPercent < 50 ? 'green' : cpuPercent < 80 ? 'yellow' : 'red';
    const ramClass = (ramUsedGB / ramTotalGB) < 0.7 ? 'green' : 'yellow';

    document.getElementById('hud-cpu').className   = `hud-val ${cpuClass}`;
    document.getElementById('hud-cpu').textContent = `${cpuPercent}%`;
    document.getElementById('hud-ram').className   = `hud-val ${ramClass}`;
    document.getElementById('hud-ram').textContent = `${ramUsedGB}/${ramTotalGB} GB`;

    updateAgentCount();
  } catch (e) {
    console.warn('[hw] fetch failed', e);
  }
}

function updateAgentCount() {
  const el = document.getElementById('hud-agents');
  el.textContent = `${agents.size}/${maxAgents}`;
  el.className   = 'hud-val green';
}

// ── SSE ───────────────────────────────────────────────────────────────────────

function connectSSE() {
  const es = new EventSource('/events');

  es.onmessage = (e) => {
    let data;
    try { data = JSON.parse(e.data); } catch { return; }

    if (data.type === 'state') {
      let agent = agents.get(data.sessionId);
      if (!agent) {
        const slot = assignSlot(data.sessionId);
        agent = { slot };
        agents.set(data.sessionId, agent);
      }
      Object.assign(agent, {
        state:   data.state,
        name:    data.name    || agent.name    || data.sessionId.slice(0, 8),
        agentId: data.agentId || agent.agentId,
        ts:      data.ts,
      });
      updateAgentCount();

      // Keep chat badge in sync
      if (selectedSession === data.sessionId) {
        const badge = document.getElementById('chat-state-badge');
        badge.textContent = data.state;
        badge.style.color = STATE_COLOR[data.state] || '#fff';
      }
    }

    if (data.type === 'remove') {
      freeSlot(data.sessionId);
      agents.delete(data.sessionId);
      if (selectedSession === data.sessionId) closeChat();
      updateAgentCount();
    }
  };

  es.onerror = () => console.warn('[SSE] disconnected — will retry');
}

// ── Chat panel ────────────────────────────────────────────────────────────────

function openChat(sessionId) {
  const agent = agents.get(sessionId);
  if (!agent) return;
  selectedSession = sessionId;

  document.getElementById('chat-agent-name').textContent  = agent.name || sessionId;
  const badge = document.getElementById('chat-state-badge');
  badge.textContent = agent.state || 'idle';
  badge.style.color = STATE_COLOR[agent.state] || '#fff';

  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('chat-panel').classList.add('open');
}

function closeChat() {
  selectedSession = null;
  document.getElementById('chat-panel').classList.remove('open');
}

async function sendChatMessage() {
  if (!selectedSession) return;
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML += `<div class="msg sent"><div class="who">you</div>${escHtml(text)}</div>`;
  msgs.scrollTop = msgs.scrollHeight;
  input.value = '';

  try {
    await fetch(`/api/chat/${selectedSession}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text }),
    });
  } catch (e) {
    console.warn('[chat] send failed', e);
  }
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Click detection ───────────────────────────────────────────────────────────

function onCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  for (const [sessionId, agent] of agents) {
    const pos   = slotPos(agent.slot);
    const isCEO = pos.isCEO;
    const w = isCEO ? CELL_W * 2 - 6 : CELL_W - 6;
    const h = isCEO ? CELL_H * 2 - 6 : CELL_H - 6;

    if (mx >= pos.x && mx <= pos.x + w && my >= pos.y && my <= pos.y + h) {
      openChat(sessionId);
      return;
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

async function init() {
  canvas = document.getElementById('canvas');
  ctx    = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  canvas.addEventListener('click', onCanvasClick);

  document.getElementById('chat-close').addEventListener('click', closeChat);
  document.getElementById('chat-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  await fetchHW();
  setInterval(fetchHW, 3000);

  connectSSE();
  render();
}

document.addEventListener('DOMContentLoaded', init);
