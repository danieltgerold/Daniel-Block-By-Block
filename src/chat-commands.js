import { DEFAULT_SETTINGS } from './player-settings.js';

import { ITEMS } from './inventory.js';
// One registry drives parsing, help, and Tab completions.
export const COMMANDS = Object.freeze([
  { name: '/help', description: 'Show commands' },
  { name: '/speed', setting: 'speed', label: 'Walking speed', unit: 'blocks/s', min: 0, max: 255, description: 'walking speed at size 1' },
  { name: '/reach', setting: 'reach', label: 'Reach', unit: 'blocks', min: 0, max: 255, description: 'eye-to-hit interaction distance at size 1' },
  { name: '/jump', setting: 'jump', label: 'Jump apex', unit: 'blocks', min: 0, max: 255, description: 'jump apex above takeoff at size 1' },
  { name: '/size', setting: 'size', label: 'Size', unit: 'multiplier', min: 0.1, max: 4, description: 'player size multiplier' },
  { name: '/default', action: 'defaults', description: 'Reset all player settings' },
  { name: '/tp', action: 'teleport', usage: '/tp <x> <y> <z>', description: 'Teleport feet (~ for relative)' },
  { name: '/give', action: 'give', usage: '/give <item> [quantity]', description: 'Give items' },
].map(Object.freeze));
export const numberText = value => String(Number(value.toPrecision(8)));
export function commandHelp() {
  const labels = { speed: 'Walking speed', reach: 'Interaction distance', jump: 'Jump height', size: 'Player size' };
  return 'Commands\n' + COMMANDS.map(command => command.setting
    ? `${command.name} <value> — ${labels[command.setting]}`
    : `${command.usage ?? command.name} — ${command.description}`).join('\n')
    + '\nUse default in place of a value to reset that setting.';
}
export function commandCompletions(text) {
  const match = /^\/(\S*)(\s+)?(.*)$/.exec(text);
  if (!match) return [];
  const [, prefix, separator, argument] = match;
  if (!separator) return COMMANDS.filter(command => command.name.startsWith(`/${prefix.toLowerCase()}`)).map(command => `${command.name} `);
  const command = COMMANDS.find(item => item.name === `/${prefix.toLowerCase()}`);
  if (command?.action === 'teleport') return '~ ~ ~'.startsWith(argument) ? [`/tp ~ ~ ~`] : [];
  if (command?.action === 'give') return /\s/.test(argument) ? [] : [...ITEMS.keys()]
    .filter(id => id.startsWith(argument.toLowerCase())).map(id => `/give ${id} `);
  if (!command?.setting || /\s/.test(argument)) return [];
  return 'default'.startsWith(argument.toLowerCase()) ? [`${command.name} default`] : [];
}
export function applyCommand(service, text) {
  const [name, ...args] = text.split(/\s+/);
  const command = COMMANDS.find(item => item.name === name.toLowerCase());
  if (!command) { service.reply('Unknown command. Type /help for available commands.'); return; }
  if (command.action === 'give') {
    if (!ITEMS.has(args[0])) { service.reply('Unknown item. Use /give test.block [quantity].'); return; }
    if (args.length > 2 || (args[1] !== undefined && !/^\+?\d+$/.test(args[1])) || BigInt(args[1] ?? '1') <= 0n) {
      service.reply('Quantity must be a positive whole number. Use /give test.block [quantity].'); return;
    }
    const amount = BigInt(args[1] ?? '1');
    service.controller.giveItem(args[0], amount);
    service.reply(`Gave ${amount} ${ITEMS.get(args[0]).name}.`); return;
  }
  if (command.action === 'teleport') {
    const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
    const values = text.slice(name.length).trim();
    const coordinate = `(?:${number}|~(?:${number})?)`;
    const whitespace = new RegExp(`^(${coordinate})\\s+(${coordinate})\\s+(${coordinate})$`, 'i');
    const commas = new RegExp(`^(${coordinate})\\s*,\\s*(${coordinate})\\s*,\\s*(${coordinate})$`, 'i');
    const match = whitespace.exec(values) ?? commas.exec(values);
    const origin = { ...service.controller.player };
    const coords = match?.slice(1).map((value, index) => value.startsWith('~')
      ? origin[['x', 'y', 'z'][index]] + Number(value.slice(1) || 0) : Number(value));
    if (!coords?.every(Number.isFinite)) { service.reply(`Usage: ${command.usage}`); return; }
    service.controller.teleport({ x: coords[0], y: coords[1], z: coords[2] });
    service.reply(`Teleported to ${coords.join(', ')}.`);
    return;
  }
  if (!command.setting) {
    if (args.length) service.reply(`Usage: ${command.name}. See /help for commands.`);
    else if (command.action === 'defaults') {
      const result = service.controller.resetAllSettings();
      service.reply(result.ok ? 'Speed, reach, jump height, and size reset to default.' : result.error);
    } else service.reply(commandHelp());
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
