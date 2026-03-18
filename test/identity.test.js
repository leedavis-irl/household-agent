import { describe, it, expect } from 'vitest';
import { resolve, getPermissionDescriptions } from '../src/broker/identity.js';
import { resolveMemberId, formatPacific } from '../src/utils/resolve-member.js';

describe('identity.resolve', () => {
  it('resolves admin by Signal number', () => {
    const member = resolve('signal', '+15550001001');
    expect(member).not.toBeNull();
    expect(member.id).toBe('alice');
    expect(member.display_name).toBe('Alice');
    expect(member.role).toBe('admin');
    expect(member.permissions).toContain('ha_all');
  });

  it('resolves member by Signal UUID', () => {
    const member = resolve('signal_uuid', '00000000-0000-0000-0000-000000000002');
    expect(member).not.toBeNull();
    expect(member.id).toBe('bob');
  });

  it('resolves member by CLI identifier', () => {
    const member = resolve('cli', 'carol');
    expect(member).not.toBeNull();
    expect(member.id).toBe('carol');
    expect(member.role).toBe('adult');
  });

  it('returns null for unknown identifier', () => {
    const member = resolve('signal', '+10000000000');
    expect(member).toBeNull();
  });

  it('returns null for unknown channel', () => {
    const member = resolve('telegram', 'alice');
    expect(member).toBeNull();
  });

  it('returns permissions array on resolved member', () => {
    const member = resolve('cli', 'child_1');
    expect(member).not.toBeNull();
    expect(Array.isArray(member.permissions)).toBe(true);
    expect(member.permissions).toContain('tasks');
    expect(member.permissions).not.toContain('financial');
  });

  it('returns identifiers on resolved member', () => {
    const member = resolve('cli', 'alice');
    expect(member.identifiers).toBeDefined();
    expect(member.identifiers.signal).toBe('+15550001001');
  });
});

describe('identity.getPermissionDescriptions', () => {
  it('returns descriptions for known permissions', () => {
    const desc = getPermissionDescriptions(['ha_all', 'financial']);
    expect(desc).toContain('ha_all:');
    expect(desc).toContain('financial:');
  });

  it('returns bare permission name for unknown permissions', () => {
    const desc = getPermissionDescriptions(['unknown_perm']);
    expect(desc).toBe('unknown_perm');
  });

  it('returns empty string for empty array', () => {
    const desc = getPermissionDescriptions([]);
    expect(desc).toBe('');
  });
});

describe('resolveMemberId', () => {
  it('resolves by exact member ID', () => {
    expect(resolveMemberId('alice')).toBe('alice');
  });

  it('resolves by display name (case-insensitive)', () => {
    expect(resolveMemberId('Bob')).toBe('bob');
    expect(resolveMemberId('CAROL')).toBe('carol');
  });

  it('resolves "me" to fallback ID', () => {
    expect(resolveMemberId('me', 'dan')).toBe('dan');
  });

  it('resolves "self" to fallback ID', () => {
    expect(resolveMemberId('self', 'eve')).toBe('eve');
  });

  it('returns null for "me" with no fallback', () => {
    expect(resolveMemberId('me')).toBeNull();
  });

  it('returns null for unknown input', () => {
    expect(resolveMemberId('nobody')).toBeNull();
  });

  it('returns null for empty input with no fallback', () => {
    expect(resolveMemberId('')).toBeNull();
    expect(resolveMemberId(null)).toBeNull();
    expect(resolveMemberId(undefined)).toBeNull();
  });

  it('falls back to fallbackId when input is empty', () => {
    expect(resolveMemberId('', 'alice')).toBe('alice');
    expect(resolveMemberId(null, 'bob')).toBe('bob');
  });

  it('trims and lowercases input', () => {
    expect(resolveMemberId('  Alice  ')).toBe('alice');
    expect(resolveMemberId('ALICE')).toBe('alice');
  });

  it('resolves children by ID', () => {
    expect(resolveMemberId('child_1')).toBe('child_1');
    expect(resolveMemberId('Child 3')).toBe('child_3');
  });
});

describe('formatPacific', () => {
  it('formats an ISO timestamp to Pacific time', () => {
    // 2026-03-01T17:00:00Z = 9:00 AM PST (UTC-8)
    const result = formatPacific('2026-03-01T17:00:00Z');
    expect(result).toContain('Mar');
    expect(result).toContain('2026');
    expect(result).toMatch(/9:00/);
    expect(result).toMatch(/AM/);
  });

  it('returns a string', () => {
    expect(typeof formatPacific('2026-06-15T12:00:00Z')).toBe('string');
  });
});
