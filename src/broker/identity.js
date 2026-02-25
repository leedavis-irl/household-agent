import { getHousehold } from '../utils/config.js';

export function resolve(channel, identifier) {
  const household = getHousehold();

  for (const [id, member] of Object.entries(household.members)) {
    if (member.identifiers[channel] === identifier) {
      return {
        id,
        display_name: member.display_name,
        role: member.role,
        permissions: member.permissions,
        identifiers: member.identifiers,
      };
    }
  }
  return null;
}

export function getPermissionDescriptions(permissions) {
  const household = getHousehold();

  return permissions
    .map((p) => {
      const desc = household.permission_definitions[p];
      return desc ? `${p}: ${desc}` : p;
    })
    .join('\n');
}
