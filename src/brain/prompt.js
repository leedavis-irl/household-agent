import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPermissionDescriptions } from '../broker/identity.js';
import log from '../utils/logger.js';

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
};

const CAPABILITY_TRIGGERS = {
  'home-assistant': /\b(light|lamp|thermostat|temperature|lock|sensor|device|room|home|house|who.*home|turn (on|off))\b/i,
  calendar: /\b(calendar|schedule|event|meeting|appointment|free|busy|available|book|when)\b/i,
  knowledge: /\b(remember|forgot|know|told you|last time|dinner|plan|logistics)\b/i,
  weather: /\b(weather|rain|cold|hot|umbrella|jacket|forecast|outside)\b/i,
  finance: /\b(money|spend|cost|transaction|budget|pay|expense|financial)\b/i,
  email: /\b(email|inbox|gmail|message from|mail)\b/i,
  messaging: /\b(tell |send |message |text |relay |let .* know)\b/i,
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

export function buildSystemPrompt({ person, user_message, person_id }) {
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
  return coreTemplate
    .replace('{{capabilities}}', capabilities)
    .replace('{{capability_guidelines}}', capabilityGuidelines)
    .replace('{{person_name}}', person.display_name)
    .replace('{{person_role}}', person.role)
    .replace('{{permissions_description}}', getPermissionDescriptions(person.permissions))
    .replace('{{group_behavior}}', groupBehavior);
}
