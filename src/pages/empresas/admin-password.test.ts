import { describe, expect, test } from 'bun:test';
import { generateAdminPassword } from './admin-password';

describe('Generated administrator password', () => {
  test('has exactly 12 characters', () => {
    for (let index = 0; index < 100; index++) {
      expect(generateAdminPassword()).toHaveLength(12);
    }
  });
  test('always includes uppercase, lowercase and a number', () => {
    for (let index = 0; index < 100; index++) {
      const password = generateAdminPassword();
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[2-9]/);
    }
  });
  test('excludes ambiguous characters and symbols', () => {
    for (let index = 0; index < 100; index++) {
      const password = generateAdminPassword();
      expect(password).not.toMatch(/[0Ool1I]/);
      expect(password).toMatch(/^[A-Za-z2-9]+$/);
    }
  });
});