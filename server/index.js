import 'dotenv/config';
import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import si from 'systeminformation';
import { connect, gatewayEmitter, sendToSession } from './gateway-client.js';
import { getAll, update, remove } from './state-machine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

// ── SSE ────────────────────────────────────────────────────────────────────────

const sseClients = new Set();

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Snapshot current state to new client
  for (const [sessionId, data] of Object.entries(getAll())) {
    res.write(`data: ${JSON.stringify({ type: 'state', sessionId, ...data })}\n\n`);
  }

  sseClients.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
});

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) client.write(msg);
}

// ── REST API ───────────────────────────────────────────────────────────────────

app.get('/api/hw', async (_req, res) => {
  const [load, mem, cpu] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.cpu(),
  ]);
  res.json({
    cpuPercent:  Math.round(load.currentLoad),
    ramPercent:  Math.round((mem.used / mem.total) * 100),
    ramUsedGB:   +(mem.used  / 1e9).toFixed(1),
    ramTotalGB:  +(mem.total / 1e9).toFixed(1),
    coreCount:   cpu.cores,
  });
});

app.post('/api/chat/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  sendToSession(sessionId, text);
  res.json({ ok: true });
});

// ── Gateway events → SSE ───────────────────────────────────────────────────────

gatewayEmitter.on('state', (data) => {
  update(data.sessionId, data);
  broadcast({ type: 'state', ...data });
});

gatewayEmitter.on('remove', ({ sessionId }) => {
  remove(sessionId);
  broadcast({ type: 'remove', sessionId });
});

// ── Boot ───────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
  connect();
});
