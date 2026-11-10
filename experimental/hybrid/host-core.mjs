import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function key() { return randomBytes(24).toString('base64url'); }
function assertString(value, label, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + label);
  return value;
}
function publicEvent(event, isGM) {
  if (event.visibility === 'gm' && !isGM) return null;
  const { visibility, ...safe } = event;
  return safe;
}

/** Isolated proof of concept. Tokens here are temporary capabilities, NOT production authentication. */
export class HybridHost {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.campaigns = new Map();
    this.tokens = new Map();
    this.listeners = new Map();
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    for (const file of readdirSync(dataDir).filter(name => /^[\w-]+\.json$/.test(name))) {
      const state = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
      if (!state.id || !state.ownerId || !Array.isArray(state.events)) throw new Error('Invalid campaign file');
      this.campaigns.set(state.id, state);
    }
  }
  save(state) {
    const file = join(this.dataDir, state.id + '.json');
    const temporary = file + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file);
  }
  issue(campaignId, userId) {
    const token = key();
    this.tokens.set(token, { campaignId, userId });
    return token;
  }
  create({ ownerId, title }) {
    assertString(ownerId, 'ownerId');
    assertString(title, 'title', 140);
    const state = {
      id: randomUUID(), ownerId, title, inviteCode: key(), sequence: 0,
      members: [], tokens: {}, notes: [], events: [],
    };
    this.save(state);
    this.campaigns.set(state.id, state);
    return { campaignId: state.id, inviteCode: state.inviteCode, token: this.issue(state.id, ownerId) };
  }
  /** Only callable on the local GM host. No remote endpoint exposes this recovery method. */
  reopen({ campaignId, ownerId }) {
    const state = this.campaigns.get(campaignId);
    if (!state || state.ownerId !== ownerId) throw new Error('Not the campaign host');
    return { campaignId, token: this.issue(campaignId, ownerId), inviteCode: state.inviteCode };
  }
  join({ campaignId, userId, inviteCode }) {
    assertString(userId, 'userId');
    const state = this.campaigns.get(campaignId);
    if (!state || state.inviteCode !== inviteCode || userId === state.ownerId) throw new Error('Invalid invitation');
    if (!state.members.includes(userId)) { state.members.push(userId); this.save(state); }
    return { campaignId, role: 'player', token: this.issue(campaignId, userId) };
  }
  require(token, campaignId) {
    const access = this.tokens.get(token);
    if (!access || access.campaignId !== campaignId) throw new Error('Unauthorized session');
    const state = this.campaigns.get(campaignId);
    if (!state) throw new Error('Unknown campaign');
    if (access.userId !== state.ownerId && !state.members.includes(access.userId)) throw new Error('Not a participant');
    return { state, userId: access.userId, isGM: state.ownerId === access.userId };
  }
  snapshot(token, campaignId) {
    const { state, userId, isGM } = this.require(token, campaignId);
    return {
      campaignId, title: state.title, sequence: state.sequence,
      role: isGM ? 'gm' : 'player', userId,
      tokens: state.tokens,
      notes: state.notes.filter(n => n.visibility !== 'gm' || isGM),
      events: state.events.map(e => publicEvent(e, isGM)).filter(Boolean),
    };
  }
  command(token, campaignId, action) {
    const { state, userId, isGM } = this.require(token, campaignId);
    const nextState = structuredClone(state);
    if (!action || typeof action !== 'object') throw new Error('Invalid command');
    const { type } = action;
    let event;
    if (type === 'assign_token') {
      if (!isGM) throw new Error('GM only');
      const id = assertString(action.id, 'token id', 80);
      if (['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Invalid token id');
      const ownerId = assertString(action.ownerId, 'token owner');
      if (ownerId !== state.ownerId && !state.members.includes(ownerId)) throw new Error('Invalid token owner');
      nextState.tokens[id] = { x: 0, y: 0, ownerId };
      event = { type, id, ownerId };
    } else if (type === 'move_token') {
      const id = assertString(action.id, 'token id', 80);
      const target = nextState.tokens[id];
      if (!Object.hasOwn(nextState.tokens, id) || !target || (!isGM && target.ownerId !== userId)) throw new Error('Forbidden token movement');
      const { x, y } = action;
      if (![x, y].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100000)) throw new Error('Invalid coordinates');
      target.x = x; target.y = y;
      event = { type, id, x, y };
    } else if (type === 'note') {
      const text = assertString(action.text, 'note', 3000);
      const visibility = action.visibility === 'gm' ? 'gm' : 'public';
      if (visibility === 'gm' && !isGM) throw new Error('GM only');
      nextState.notes.push({ text, ownerId: userId, visibility });
      event = { type, text, ownerId: userId, visibility };
    } else if (type === 'roll') {
      const sides = action.sides;
      if (!Number.isInteger(sides) || sides < 2 || sides > 100) throw new Error('Invalid dice');
      event = { type, sides, result: randomInt(1, sides + 1), ownerId: userId };
    } else {
      throw new Error('Unknown command');
    }
    event.sequence = state.sequence + 1;
    // Stage complete next state before notifying listeners. If disk write fails,
    // the in-memory state remains unchanged and no event is published.
    nextState.sequence = event.sequence;
    nextState.events.push(event);
    this.save(nextState);
    this.campaigns.set(campaignId, nextState);
    for (const entry of this.listeners.get(campaignId) ?? []) {
      const receiver = this.tokens.get(entry.token);
      if (!receiver) continue;
      const projected = publicEvent(event, receiver.userId === state.ownerId);
      if (projected) { try { entry.callback(projected); } catch { /* isolate consumer */ } }
    }
    return { sequence: nextState.sequence };
  }
  subscribe(token, campaignId, callback) {
    this.require(token, campaignId);
    if (typeof callback !== 'function') throw new Error('Invalid callback');
    const listeners = this.listeners.get(campaignId) ?? new Set();
    const entry = { token, callback };
    listeners.add(entry);
    this.listeners.set(campaignId, listeners);
    return () => listeners.delete(entry);
  }
}
