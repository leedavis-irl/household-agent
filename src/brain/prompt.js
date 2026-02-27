import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPermissionDescriptions } from '../broker/identity.js';
import log from '../utils/logger.js';
import { getDb } from '../utils/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreTemplatePath = join(__dirname, '../../config/prompts/core.md');
const coreTemplate = readFileSync(coreTemplatePath, 'utf-8');

const capabilityDir = join(__dirname, '../../config/prompts/capabilities');
const capabilityFiles = {
  'home-assistant': 'home-assistant.md',
  knowledge: 'knowledge.md',
  calendar: 'calendar.md',
  messaging: 'messaging.md',
  weather: 'weather.md',
  finance: 'finance.md',
  email: 'email.md',
  sms: 'sms.md',
  reminders: 'reminders.md',
  'feature-requests': 'feature-requests.md',
};

const CAPABILITY_TRIGGERS = {
  'home-assistant': /\b(light|lamp|thermostat|temperature|lock|sensor|device|room|home|house|who.*home|turn (on|off))\b/i,
  calendar: /\b(calendar|schedule|event|meeting|appointment|free|busy|available|book|when)\b/i,
  knowledge: /\b(remember|forgot|know|told you|last time|dinner|plan|logistics)\b/i,
  weather: /\b(weather|rain|cold|hot|umbrella|jacket|forecast|outside)\b/i,
  finance: /\b(money|spend|cost|transaction|budget|pay|expense|financial)\b/i,
  email: /\b(email|inbox|gmail|message from|mail)\b/i,
  sms: /\b(text|sms|txt)\b/i,
  messaging: /\b(tell |send |message |text |relay |let .* know)\b/i,
  reminders: /\b(remind|reminder|reminders|don't forget|don't let me forget|nudge|follow up|snooze)\b/i,
};

function loadCapability(fileName) {
  const raw = readFileSync(join(capabilityDir, fileName), 'utf-8');
  const [whatYouCanDoRaw, guidelinesRaw] = raw.split('\n---\n');
  return {
    whatYouCanDo: (whatYouCanDoRaw || '').trim(),
    guidelines: (guidelinesRaw || '').trim(),
  };
}

const capabilityContentByName = Object.fromEntries(
  Object.entries(capabilityFiles).map(([name, fileName]) => [name, loadCapability(fileName)])
);

const GROUP_BEHAVIOR = `You are in a group chat. Every message in the group is sent to you; you see the flow of conversation. You choose whether to respond or stay silent.

**Respond when:** you can answer a question (even if not directed at you), provide useful context, flag a scheduling conflict, acknowledge information you should track, correct a factual error about household operations, or offer to help with something clearly in your scope.

**Stay silent when:** the conversation is casual or social, people are joking, someone is venting, the topic doesn't benefit from your input, or someone else has already given a good answer.

When in doubt, stay silent. Being helpful once too few is better than being annoying once too many. If you stay silent, respond with nothing (empty message).`;

const DM_BEHAVIOR = 'You are in a direct message. Respond helpfully to whatever the person sends.';

function getCapabilitiesForMessage(userMessage) {
  const text = (userMessage || '').trim();
  const matches = Object.entries(CAPABILITY_TRIGGERS)
    .filter(([, trigger]) => trigger.test(text))
    .map(([name]) => name);

  return matches.length > 0 ? matches : Object.keys(capabilityFiles);
}

function formatPacific(isoTs) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(isoTs));
}

function getFiredReminderContext(personId) {
  if (!personId) return '';
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT id,
              COALESCE(message, content) AS message,
              fired_at
       FROM reminders
       WHERE status = 'fired'
         AND COALESCE(target_id, target_person_id) = ?
       ORDER BY fired_at DESC
       LIMIT 5`
    ).all(personId);

    if (!rows.length) return '';

    const lines = rows.map((r) => {
      const fired = r.fired_at ? formatPacific(r.fired_at) : 'recently';
      return `- #${r.id}: ${r.message} (sent ${fired})`;
    });

    return `\n\n## Outstanding fired reminders\nThis person has active fired reminders. If their reply looks like reminder follow-up, use reminder_update.\n${lines.join('\n')}`;
  } catch (err) {
    log.warn('Failed to load fired reminder context', { person_id: personId, error: err.message });
    return '';
  }
}

export function buildSystemPrompt({ person, user_message, person_id }) {
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const loadedCapabilities = getCapabilitiesForMessage(user_message);
  const capabilityParts = loadedCapabilities
    .map((name) => capabilityContentByName[name])
    .filter(Boolean);
  const capabilities = capabilityParts
    .map((p) => p.whatYouCanDo)
    .filter(Boolean)
    .join('\n\n');
  const capabilityGuidelines = capabilityParts
    .map((p) => p.guidelines)
    .filter(Boolean)
    .join('\n');

  log.debug('Loaded prompt capabilities', {
    person_id: person_id ?? person.display_name ?? 'unknown',
    capabilities: loadedCapabilities,
  });

  const groupBehavior = person.isGroup ? GROUP_BEHAVIOR : DM_BEHAVIOR;
  const firedReminderContext = getFiredReminderContext(person_id);
  return coreTemplate
    .replace('{{current_datetime}}', now)
    .replace('{{capabilities}}', capabilities)
    .replace('{{capability_guidelines}}', capabilityGuidelines)
    .replace('{{person_name}}', person.display_name)
    .replace('{{person_role}}', person.role)
    .replace('{{permissions_description}}', getPermissionDescriptions(person.permissions))
    .replace('{{group_behavior}}', groupBehavior)
    + firedReminderContext;
}
