import { randomInt } from 'node:crypto';
import { SPECIALIST_NAMES } from '../shared/branding';
import type { Bot } from '../shared/contracts';

export function assignBotName(bots: Bot[], requested?: string, choose = randomInt): string {
  const used = new Set(bots.filter((b) => !b.archived).map((b) => b.name.trim().toLowerCase()));
  const available = SPECIALIST_NAMES.filter((name) => !used.has(name.toLowerCase()));
  if (!available.length)
    throw new Error(
      'All five specialist names are in use. Archive an unused specialist before creating another.',
    );
  const selected = available.find((name) => name.toLowerCase() === requested?.trim().toLowerCase());
  return selected ?? available[choose(available.length)];
}

export function validateBotRename(bot: Bot, name: string, bots: Bot[]) {
  if (
    bots.some((b) => b.id !== bot.id && !b.archived && b.name.toLowerCase() === name.toLowerCase())
  )
    throw new Error('That name already belongs to an active bot.');
  if (name === bot.name) return;
  if (bot.id === 'orchestrator')
    throw new Error(
      'The orchestrator is named Optimus Prime. Edit its role and instructions separately.',
    );
  if (!SPECIALIST_NAMES.some((n) => n === name))
    throw new Error('Choose a name from the Autobot roster. Roles are configured separately.');
}
