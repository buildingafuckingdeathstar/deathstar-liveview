/** @module state-machine — in-memory session state tracker */

const sessions = new Map();

/**
 * Returns all active sessions as a plain object.
 * @returns {Record<string, object>}
 */
export function getAll() {
  return Object.fromEntries(sessions);
}

/**
 * Creates or updates a session's state.
 * @param {string} sessionId
 * @param {object} data - partial update: {state, agentId, name, ts, ...}
 * @returns {object} updated session record
 */
export function update(sessionId, data) {
  const existing = sessions.get(sessionId) || {};
  const updated = { ...existing, ...data, lastSeen: Date.now() };
  sessions.set(sessionId, updated);
  return updated;
}

/**
 * Removes a session.
 * @param {string} sessionId
 */
export function remove(sessionId) {
  sessions.delete(sessionId);
}
