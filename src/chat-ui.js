import { ChatService, LocalPlayerProfile, SERVER_ID } from './chat.js';

export const isTextEntry = target => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));

// All game/chat/menu keyboard routing lives here, so text fields cannot leak
// WASD, F5, jump, or mining input into gameplay. No pointer-lock mock is used in
// production; tests inject only the browser capture/unlock boundaries.
export class ChatUI {
  constructor({ document, window, controller, clearInput, requestCapture, requestUnlock,
    onModeChange = () => {}, onCameraCycle = () => {}, storage, createId, broadcast }) {
    this.document = document;
    this.window = window;
    this.controller = controller;
    this.clearInput = clearInput;
    this.requestCapture = requestCapture;
    this.requestUnlock = requestUnlock;
    this.onModeChange = onModeChange;
    this.onCameraCycle = onCameraCycle;
    this.pointerLocked = false;
    this.mode = null;
    this.elements = Object.fromEntries(['chat-panel', 'chat-log', 'chat-form', 'chat-input',
      'name-form', 'player-name', 'name-error', 'resume-note'].map(id => [id, document.getElementById(id)]));
    this.profile = new LocalPlayerProfile(storage, createId);
    this.service = new ChatService({ profile: this.profile, controller, broadcast });
    this.elements['player-name'].value = this.profile.player.displayName;
    this.onKeyDown = event => this.handleKeyDown(event);
    this.onKeyUp = event => controller.keyUp(event.code);
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
    this.unsubscribe = this.service.subscribe(() => this.renderHistory());
    this.setMode('menu');
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
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
    if (this.mode === 'chat') {
      if (event.code === 'F5') { event.preventDefault(); event.stopPropagation(); return; }
      if (!event.isComposing && (event.key === 'Enter' || event.key === 'Escape')) {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) this.closeChat(event.key === 'Enter');
      }
      return;
    }
    if (isTextEntry(event.target)) {
      if (event.code === 'F5') { event.preventDefault(); event.stopPropagation(); }
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
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft'].includes(event.code)) event.preventDefault();
    this.controller.keyDown(event.code, event.repeat);
  }

  renderHistory() {
    const open = this.mode === 'chat';
    const panel = this.elements['chat-panel'];
    panel.hidden = this.mode === 'menu' || (!open && this.service.messages.length === 0);
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
  }

  dispose() {
    this.window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    this.window.removeEventListener('keyup', this.onKeyUp);
    this.unsubscribe();
  }
}
