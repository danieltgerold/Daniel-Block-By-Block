export class DeveloperSequence {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
    this.keys = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter'];
    this.index = 0;
    this.startedAt = 0;
  }
  feed(event) {
    if (event.repeat) return false;
    const time = this.now();
    if (this.index && time - this.startedAt > 60_000) this.index = 0;
    const key = event.key?.length === 1 ? event.key.toLowerCase() : event.key;
    if (event.ctrlKey || event.metaKey || event.altKey || key !== this.keys[this.index]) {
      this.index = key === this.keys[0] && !event.ctrlKey && !event.metaKey && !event.altKey ? 1 : 0;
      this.startedAt = time;
      return false;
    }
    if (this.index === 0) this.startedAt = time;
    if (++this.index === this.keys.length) { this.index = 0; return true; }
    return false;
  }
}
