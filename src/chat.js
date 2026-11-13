import { applyCommand, commandCompletions } from './chat-commands.js';
export const PROFILE_STORAGE_KEY = 'block-by-block.profile.v1';
export const SERVER_ID = 'system:server';
export const canonicalName = value => value.trim().toLowerCase();

export function validateName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return { ok: false, error: 'Enter a name; it cannot be blank.' };
  if (/\s/.test(value)) return { ok: false, error: 'Spaces are not allowed in player names.' };
  if (name.length > 16) return { ok: false, error: 'Names must be 16 characters or fewer.' };
  if (!/^[A-Za-z0-9]+$/.test(name)) return { ok: false, error: 'Use only letters and numbers.' };
  if (canonicalName(name) === 'server') return { ok: false, error: 'The name server is reserved for system messages.' };
  return { ok: true, name };
}

// This registry can be owned by a future authoritative server. Display names
// never serve as player IDs; join and rename use the same case-insensitive rules.
export class PlayerDirectory {
  constructor() { this.players = new Map(); }
  available(name, exceptId = null) {
    const key = canonicalName(name);
    return key !== 'server' && ![...this.players.values()].some(p => p.id !== exceptId && canonicalName(p.displayName) === key);
  }
  nextDefaultName() {
    let number = 1;
    while (!this.available(`player${number}`)) number++;
    return `player${number}`;
  }
  join(id, preferredName = null) {
    if (!id || id === SERVER_ID) return { ok: false, error: 'Invalid player identity.' };
    if (this.players.has(id)) return { ok: true, player: this.players.get(id) };
    const validated = validateName(preferredName ?? this.nextDefaultName());
    if (!validated.ok) return validated;
    if (!this.available(validated.name)) return { ok: false, error: 'That name is already in use.' };
    const player = { id, displayName: validated.name };
    this.players.set(id, player);
    return { ok: true, player };
  }
  rename(id, value) {
    const validated = validateName(value);
    if (!validated.ok) return validated;
    const player = this.players.get(id);
    if (!player) return { ok: false, error: 'Unknown player identity.' };
    if (!this.available(validated.name, id)) return { ok: false, error: 'That name is already in use.' };
    player.displayName = validated.name;
    return { ok: true, player };
  }
}

export class LocalPlayerProfile {
  constructor(storage = null, createId = () => globalThis.crypto.randomUUID()) {
    this.storage = storage;
    this.directory = new PlayerDirectory();
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(PROFILE_STORAGE_KEY) || 'null'); } catch { /* Invalid/unavailable saved data uses defaults. */ }
    const id = typeof saved?.id === 'string' && saved.id && saved.id !== SERVER_ID ? saved.id : createId();
    // Migrate old space-containing names without replacing the stable identity.
    const savedName = typeof saved?.displayName === 'string' ? saved.displayName.replace(/\s/g, '') : undefined;
    const joined = this.directory.join(id, savedName);
    this.player = joined.ok ? joined.player : this.directory.join(id).player;
    this.persist();
  }
  persist() {
    try { this.storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.player)); return Boolean(this.storage); }
    catch { return false; }
  }
  rename(value) {
    const result = this.directory.rename(this.player.id, value);
    if (!result.ok) return result;
    return { ...result, persisted: this.persist() };
  }
}


export class ChatService {
  constructor({ profile, controller, broadcast = null }) {
    this.profile = profile;
    this.controller = controller;
    this.broadcast = broadcast;
    this.messages = [];
    this.listeners = new Set();
    this.sequence = 0;
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  // The single display/delivery path. Future incoming network messages enter
  // here without rebroadcast; only public outgoing chat uses the transport hook.
  deliver(message, { broadcast = false } = {}) {
    if (message.recipientId && message.recipientId !== this.profile.player.id) return false;
    const delivered = Object.freeze({ id: ++this.sequence, ...message });
    this.messages.push(delivered);
    if (this.messages.length > 100) this.messages.shift();
    for (const listener of this.listeners) listener(delivered);
    if (broadcast && !delivered.recipientId) this.broadcast?.(delivered);
    return true;
  }
  reply(text) {
    return this.deliver({ senderId: SERVER_ID, senderName: 'server', text,
      recipientId: this.profile.player.id, kind: 'system' });
  }
  submit(value) {
    const text = value.trim();
    if (!text) return false;
    if (text.startsWith('/')) { this.command(text); return true; }
    this.deliver({ senderId: this.profile.player.id, senderName: this.profile.player.displayName,
      text, kind: 'chat', recipientId: null }, { broadcast: true });
    return true;
  }
  completions(text) { return commandCompletions(text); }
  command(text) { applyCommand(this, text); }
}
