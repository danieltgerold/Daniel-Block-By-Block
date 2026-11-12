import { DEFAULT_SETTINGS } from './player-settings.js';

// One registry drives parsing, help, and Tab completions.
export const COMMANDS = Object.freeze([
  { name: '/help', description: 'List commands, units, ranges, and reset syntax.' },
  { name: '/speed', setting: 'speed', label: 'Walking speed', unit: 'blocks/s', min: 0, max: 255, description: 'walking speed at size 1' },
  { name: '/reach', setting: 'reach', label: 'Reach', unit: 'blocks', min: 0, max: 255, description: 'eye-to-hit interaction distance at size 1' },
  { name: '/jump', setting: 'jump', label: 'Jump apex', unit: 'blocks', min: 0, max: 255, description: 'jump apex above takeoff at size 1' },
  { name: '/size', setting: 'size', label: 'Size', unit: 'multiplier', min: 0.1, max: 4, description: 'player size multiplier' },
].map(Object.freeze));
export const numberText = value => String(Number(value.toPrecision(8)));
export function commandHelp(developerMode = false) {
  const help = COMMANDS.map(command => command.setting
    ? `${command.name} <number|default> — ${command.description}, ${command.unit}; ${command.min}–${command.max}. ${command.name} default resets only this setting (default ${numberText(DEFAULT_SETTINGS[command.setting])}).`
    : `${command.name} — ${command.description}`).join('\n');
  return help + (developerMode ? '\nDeveloper mode: ranges bypassed; values must be finite (size > 0; others >= 0), with no effective overflow.' : '');
}
export function commandCompletions(text) {
  const match = /^\/(\S*)(\s+)?(.*)$/.exec(text);
  if (!match) return [];
  const [, prefix, separator, argument] = match;
  if (!separator) return COMMANDS.filter(command => command.name.startsWith(`/${prefix.toLowerCase()}`)).map(command => `${command.name} `);
  const command = COMMANDS.find(item => item.name === `/${prefix.toLowerCase()}`);
  if (!command?.setting || /\s/.test(argument)) return [];
  return 'default'.startsWith(argument.toLowerCase()) ? [`${command.name} default`] : [];
}
export function applyCommand(service, text) {
  const [name, ...args] = text.split(/\s+/);
  const command = COMMANDS.find(item => item.name === name.toLowerCase());
  if (!command) { service.reply('Unknown command. Type /help for available commands.'); return; }
  if (!command.setting) {
    service.reply(args.length ? 'Usage: /help. See /help for commands.' : commandHelp(service.controller.developerMode));
    return;
  }
  const reset = args.length === 1 && args[0].toLowerCase() === 'default';
  const value = reset ? DEFAULT_SETTINGS[command.setting] : Number(args[0]);
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  const developer = service.controller.developerMode;
  const inRange = developer ? (command.setting === 'size' ? value > 0 : value >= 0) : value >= command.min && value <= command.max;
  if (args.length !== 1 || (!reset && !numeric.test(args[0])) || !Number.isFinite(value) || !inRange) {
    service.reply(developer
      ? `${command.name} must be a finite ${command.setting === 'size' ? 'positive' : 'nonnegative'} number. See /help.`
      : `${command.name} must be between ${command.min} and ${command.max}. See /help.`);
    return;
  }
  const result = service.controller.configure(command.setting, value);
  if (!result.ok) { service.reply(result.error); return; }
  let reply = `${command.label} ${reset ? 'reset to default' : 'set to'} ${numberText(value)} ${command.unit}.`;
  if (command.setting === 'size') {
    reply += ` Effective speed ${numberText(result.effective.speed)} blocks/s, reach ${numberText(result.effective.reach)} blocks, jump ${numberText(result.effective.jump)} blocks.`;
  } else if (service.controller.size !== 1) {
    reply += ` Effective ${numberText(result.effective[command.setting])} ${command.unit} at size ${numberText(service.controller.size)}.`;
  }
  service.reply(reply);
}
