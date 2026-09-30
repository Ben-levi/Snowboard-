import { describe, expect, it } from 'vitest';
import { checkPassword, hashPassword, isAdminSession } from './admin.js';

describe('admin password', () => {
  it('hashes deterministically to hex SHA-256', async () => {
    const a = await hashPassword('ALPS26', '1234');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPassword('ALPS26', '1234')).toBe(a);
  });

  it('salts with the trip code', async () => {
    expect(await hashPassword('ALPS26', '1234')).not.toBe(await hashPassword('ALPS27', '1234'));
  });

  it('verifies only the right password', async () => {
    const hash = await hashPassword('ALPS26', 'secret');
    expect(await checkPassword('ALPS26', 'secret', hash)).toBe(true);
    expect(await checkPassword('ALPS26', 'Secret', hash)).toBe(false);
    expect(await checkPassword('ALPS26', '', hash)).toBe(false);
    expect(await checkPassword('ALPS26', 'secret', undefined)).toBe(false);
  });

  it('keeps a session only while the trip hash matches', () => {
    expect(isAdminSession({ adminHash: 'abc' }, 'abc')).toBe(true);
    expect(isAdminSession({ adminHash: 'def' }, 'abc')).toBe(false);
    expect(isAdminSession({}, undefined)).toBe(false);
    expect(isAdminSession(null, 'abc')).toBe(false);
  });
});
