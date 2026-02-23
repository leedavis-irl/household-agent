import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPermissionDescriptions } from '../broker/identity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, '../../config/system-prompt.md');
const template = readFileSync(templatePath, 'utf-8');

const GROUP_BEHAVIOR = `You are in a group chat. Every message in the group is sent to you; you see the flow of conversation. You choose whether to respond or stay silent.

**Respond when:** you can answer a question (even if not directed at you), provide useful context, flag a scheduling conflict, acknowledge information you should track, correct a factual error about household operations, or offer to help with something clearly in your scope.

**Stay silent when:** the conversation is casual or social, people are joking, someone is venting, the topic doesn't benefit from your input, or someone else has already given a good answer.

When in doubt, stay silent. Being helpful once too few is better than being annoying once too many. If you stay silent, respond with nothing (empty message).`;

const DM_BEHAVIOR = 'You are in a direct message. Respond helpfully to whatever the person sends.';

export function buildSystemPrompt(person) {
  const groupBehavior = person.isGroup ? GROUP_BEHAVIOR : DM_BEHAVIOR;
  return template
    .replace('{{person_name}}', person.display_name)
    .replace('{{person_role}}', person.role)
    .replace('{{permissions_description}}', getPermissionDescriptions(person.permissions))
    .replace('{{group_behavior}}', groupBehavior);
}
