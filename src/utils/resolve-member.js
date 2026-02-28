import { getHousehold } from './config.js';

export function resolveMemberId(input, fallbackId) {
  const id = (input || fallbackId || '').toString().trim().toLowerCase();
  if (!id) return null;
  const household = getHousehold();
  if (id === 'me' || id === 'self') return fallbackId || null;
  if (household.members[id]) return id;
  for (const [memberId, member] of Object.entries(household.members)) {
    if (member.display_name?.toLowerCase() === id) return memberId;
  }
  return null;
}

export function formatPacific(isoTs) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZoneName: 'short',
  }).format(new Date(isoTs));
}
