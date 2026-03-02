import { describe, it, expect } from 'vitest';
import { resolve, getPermissionDescriptions } from '../src/broker/identity.js';
import { resolveMemberId, formatPacific } from '../src/utils/resolve-member.js';

describe('identity.resolve', () => {
  it('resolves lee by Signal number', () => {
    const member = resolve('signal', '+13392360070');
    expect(member).not.toBeNull();
    expect(member.id).toBe('lee');
    expect(member.display_name).toBe('Lee');
    expect(member.role).toBe('admin');
    expect(member.permissions).toContain('ha_all');
  });

  it('resolves steve by Signal UUID', () => {
    const member = resolve('signal_uuid', '886f92ec-b5c9-4b60-8249-b4cf25e0b29f');
    expect(member).not.toBeNull();
    expect(member.id).toBe('steve');
  });

  it('resolves kelly by CLI identifier', () => {
    const member = resolve('cli', 'kelly');
    expect(member).not.toBeNull();
    expect(member.id).toBe('kelly');
    expect(member.role).toBe('adult');
  });

  it('returns null for unknown identifier', () => {
    const member = resolve('signal', '+10000000000');
    expect(member).toBeNull();
  });

  it('returns null for unknown channel', () => {
    const member = resolve('telegram', 'lee');
    expect(member).toBeNull();
  });

  it('returns permissions array on resolved member', () => {
    const member = resolve('cli', 'ryker');
    expect(member).not.toBeNull();
    expect(Array.isArray(member.permissions)).toBe(true);
    expect(member.permissions).toContain('tasks');
    expect(member.permissions).not.toContain('financial');
  });

  it('returns identifiers on resolved member', () => {
    const member = resolve('cli', 'lee');
    expect(member.identifiers).toBeDefined();
    expect(member.identifiers.signal).toBe('+13392360070');
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
    expect(resolveMemberId('lee')).toBe('lee');
  });

  it('resolves by display name (case-insensitive)', () => {
    expect(resolveMemberId('Steve')).toBe('steve');
    expect(resolveMemberId('KELLY')).toBe('kelly');
  });

  it('resolves "me" to fallback ID', () => {
    expect(resolveMemberId('me', 'hallie')).toBe('hallie');
  });

  it('resolves "self" to fallback ID', () => {
    expect(resolveMemberId('self', 'firen')).toBe('firen');
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
    expect(resolveMemberId('', 'lee')).toBe('lee');
    expect(resolveMemberId(null, 'steve')).toBe('steve');
  });

  it('trims and lowercases input', () => {
    expect(resolveMemberId('  Lee  ')).toBe('lee');
    expect(resolveMemberId('LEE')).toBe('lee');
  });

  it('resolves children by ID', () => {
    expect(resolveMemberId('ryker')).toBe('ryker');
    expect(resolveMemberId('Hazel')).toBe('hazel');
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
