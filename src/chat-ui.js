import { ChatService, LocalPlayerProfile, SERVER_ID } from './chat.js';

import { DeveloperSequence } from './developer-sequence.js';
export const isTextEntry = target => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));

// All game/chat/menu keyboard routing lives here, so text fields cannot leak
// WASD, F5, jump, or mining input into gameplay. No pointer-lock mock is used in
// production; tests inject only the browser capture/unlock boundaries.
export class ChatUI {
  constructor({ document, window, controller, clearInput, requestCapture, requestUnlock,
    onModeChange = () => {}, onCameraCycle = () => {}, onHitboxToggle = () => {}, storage, createId, broadcast, now }) {
    this.document = document;
    this.window = window;
    this.controller = controller;
    this.clearInput = clearInput;
    this.requestCapture = requestCapture;
    this.requestUnlock = requestUnlock;
    this.onModeChange = onModeChange;
    this.onCameraCycle = onCameraCycle;
    this.onHitboxToggle = onHitboxToggle;
    this.f3Held = false;
    this.bHeld = false;
    this.now = now ?? (() => performance.now());
    this.lastMessageAt = -Infinity;
    this.pointerLocked = false;
    this.mode = null;
    this.developerSequence = new DeveloperSequence({ now });
    this.completion = null;
    this.elements = Object.fromEntries(['chat-panel', 'chat-log', 'chat-form', 'chat-input',
      'name-form', 'player-name', 'name-error', 'resume-note', 'chat-completions', 'show-first-person-body'].map(id => [id, document.getElementById(id)]));
    this.showFirstPersonBody = false;
    try { this.showFirstPersonBody = storage?.getItem('block-by-block.first-person-body') === 'true'; } catch { /* Session preference still works. */ }
    this.elements['show-first-person-body'].checked = this.showFirstPersonBody;
    this.elements['show-first-person-body'].addEventListener('change', () => {
      this.showFirstPersonBody = this.elements['show-first-person-body'].checked;
      try { storage?.setItem('block-by-block.first-person-body', String(this.showFirstPersonBody)); } catch { /* Keep session preference. */ }
    });
    this.profile = new LocalPlayerProfile(storage, createId);
    this.service = new ChatService({ profile: this.profile, controller, broadcast });
    this.elements['player-name'].value = this.profile.player.displayName;
    this.onKeyDown = event => this.handleKeyDown(event);
    this.onKeyUp = event => {
      if (event.code === 'F3') this.f3Held = false;
      if (event.code === 'KeyB') this.bHeld = false;
      controller.keyUp(event.code);
    };
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp);
    this.elements['name-form'].addEventListener('submit', event => {
      event.preventDefault();
      const field = this.elements['player-name'];
      const result = this.profile.rename(field.value);
      this.elements['name-error'].textContent = result.ok
        ? (result.persisted ? '' : 'Name changed for this session; browser storage is unavailable.') : result.error;
      field.setAttribute('aria-invalid', String(!result.ok));
      if (result.ok) field.value = this.profile.player.displayName;
    });
    this.elements['chat-form'].addEventListener('submit', event => {
      event.preventDefault();
      if (this.mode === 'chat') this.closeChat(true);
    });
    this.elements['resume-note'].addEventListener('click', () => this.resume());
    this.elements['chat-input'].addEventListener('input', () => {
      this.completion = null;
      this.renderCompletions(this.service.completions(this.elements['chat-input'].value));
    });
    this.unsubscribe = this.service.subscribe(() => { this.lastMessageAt = this.now(); this.renderHistory(); });
    this.setMode('menu');
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode !== 'playing') this.f3Held = this.bHeld = false;
    if (mode !== 'chat') { this.completion = null; this.renderCompletions([]); }
    this.clearInput();
    this.document.body.classList.toggle('chat-open', mode === 'chat');
    this.elements['resume-note'].hidden = mode !== 'ready';
    this.onModeChange(mode);
    this.renderHistory();
  }

  openChat(prefix = '') {
    if (!['playing', 'ready'].includes(this.mode)) return;
    this.setMode('chat');
    this.pointerLocked = false;
    this.requestUnlock();
    const field = this.elements['chat-input'];
    field.value = prefix === '/' ? '/' : '';
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
    this.completion = null;
    this.renderCompletions(this.service.completions(field.value));
  }

  closeChat(submit = false) {
    const field = this.elements['chat-input'];
    if (submit) this.service.submit(field.value);
    field.value = '';
    field.blur();
    this.setMode('ready');
    this.resume();
  }

  resume() {
    if (this.mode === 'chat') return;
    // Capture may be denied after Escape's browser unlock gesture. In that case
    // stay ready, with a real click-to-resume button instead of opening the menu.
    Promise.resolve(this.requestCapture()).catch(() => {
      this.elements['resume-note'].hidden = false;
    });
  }

  onPointerLockChange(locked) {
    this.pointerLocked = locked;
    if (locked) {
      if (this.mode === 'chat') { this.requestUnlock(); return; }
      this.setMode('playing');
    } else if (this.mode === 'playing') {
      this.setMode('menu');
    }
  }

  pause() {
    this.elements['chat-input'].value = '';
    this.elements['chat-input'].blur();
    this.pointerLocked = false;
    this.setMode('menu');
    this.clearInput();
    this.requestUnlock();
  }

  handleKeyDown(event) {
    if (this.mode === 'playing' && !isTextEntry(event.target)) {
      if (event.code === 'F3') {
        event.preventDefault(); event.stopPropagation();
        this.developerSequence.feed(event);
        if (!event.repeat) this.f3Held = true;
        return;
      }
      if (event.code === 'KeyB') {
        const wasHeld = this.bHeld;
        this.bHeld = true;
        if (this.f3Held) {
          event.preventDefault(); event.stopPropagation();
          this.developerSequence.feed(event);
          if (!event.repeat && !wasHeld) this.onHitboxToggle();
          return;
        }
      }
    }
    if (this.developerSequence.feed(event)) {
      event.preventDefault(); event.stopPropagation();
      if (this.controller.enableDeveloperMode()) this.service.reply('You have entered developer mode.');
      return;
    }
    if (this.mode === 'chat') {
      if (event.key === 'Tab') {
        event.preventDefault(); event.stopPropagation(); this.complete(event.shiftKey); return;
      }
      if (event.code === 'F5' || event.code === 'F3') { event.preventDefault(); event.stopPropagation(); return; }
      if (!event.isComposing && (event.key === 'Enter' || event.key === 'Escape')) {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) this.closeChat(event.key === 'Enter');
      }
      return;
    }
    if (isTextEntry(event.target)) {
      if (event.code === 'F5' || event.code === 'F3') { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (!['playing', 'ready'].includes(this.mode)) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      if (event.code === 'KeyT' || event.key === '/') {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) this.openChat(event.key === '/' ? '/' : '');
        return;
      }
    }
    if (this.mode !== 'playing') return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); this.pause(); return;
    }
    if (event.code === 'F5') {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) this.onCameraCycle();
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyR'].includes(event.code)) event.preventDefault();
    this.controller.keyDown(event.code, event.repeat);
  }

  complete(reverse = false) {
    const field = this.elements['chat-input'];
    if (field.selectionStart !== field.value.length || field.selectionEnd !== field.value.length) return;
    if (!this.completion || this.completion.lastValue !== field.value) {
      const matches = this.service.completions(field.value);
      if (!matches.length) { this.renderCompletions([]); return; }
      this.completion = { matches, index: reverse ? matches.length - 1 : 0 };
    } else {
      const state = this.completion;
      state.index = (state.index + (reverse ? -1 : 1) + state.matches.length) % state.matches.length;
    }
    const state = this.completion;
    field.value = state.matches[state.index];
    state.lastValue = field.value;
    field.setSelectionRange(field.value.length, field.value.length);
    if (state.matches.length === 1 && field.value.endsWith(' ')) {
      this.completion = null;
      this.renderCompletions(this.service.completions(field.value));
    } else this.renderCompletions(state.matches, state.index);
  }

  renderCompletions(matches, selected = -1) {
    const list = this.elements['chat-completions'];
    list.hidden = matches.length === 0;
    const nodes = matches.flatMap((value, index) => {
      const option = this.document.createElement('span');
      option.textContent = value.trimEnd();
      option.className = index === selected ? 'completion-selected' : '';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === selected));
      return [option, this.document.createTextNode('  ')];
    });
    list.replaceChildren(...nodes);
  }

  renderHistory() {
    if (this.mode === 'menu' && this.controller.developerMode) {
      this.document.getElementById('start-note').textContent = '<server>: You have entered developer mode.';
    }
    const open = this.mode === 'chat';
    const panel = this.elements['chat-panel'];
    panel.classList.toggle('is-open', open);
    this.elements['chat-form'].hidden = !open;
    const nodes = this.service.messages.slice(open ? -50 : -8).map(message => {
      const row = this.document.createElement('li');
      const name = this.document.createElement('span');
      name.className = message.senderId === SERVER_ID ? 'chat-server' : 'chat-sender';
      name.textContent = message.senderName;
      row.append(this.document.createTextNode('<'), name, this.document.createTextNode(`>: ${message.text}`));
      return row;
    });
    const log = this.elements['chat-log'];
    log.replaceChildren(...nodes);
    log.scrollTop = log.scrollHeight;
    this.updateVisibility();
  }

  updateVisibility(time = this.now()) {
    const open = this.mode === 'chat';
    const age = time - this.lastMessageAt;
    const opacity = open ? 1 : Math.max(0, Math.min(1, 1 - (age - 10_000) / 1000));
    const panel = this.elements['chat-panel'];
    panel.hidden = this.mode === 'menu' || (!open && (this.service.messages.length === 0 || opacity === 0));
    panel.style.opacity = String(opacity);
  }

  dispose() {
    this.window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    this.window.removeEventListener('keyup', this.onKeyUp);
    this.unsubscribe();
  }
}
