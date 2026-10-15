import { describe, expect, it } from 'vitest';
import { settingsSchema } from '../schemas';

describe('settings schema', () => {
  it('validates settings with optional cartoApiKey', () => {
    const raw = {
      _id: 'settings:app',
      type: 'settings',
      homeCurrencyDefault: 'BRL',
      theme: 'system',
      firstDayOfWeek: 1,
      language: 'pt-BR',
      cartoApiKey: 'carto-api-key-test-12345',
      schemaVersion: 1,
      createdAt: '2026-10-15T00:00:00.000Z',
      updatedAt: '2026-10-15T00:00:00.000Z',
      deletedAt: null
    };

    const parsed = settingsSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cartoApiKey).toBe('carto-api-key-test-12345');
      expect(parsed.data.language).toBe('pt-BR');
    }
  });

  it('validates settings without cartoApiKey (default/empty)', () => {
    const raw = {
      _id: 'settings:app',
      type: 'settings',
      homeCurrencyDefault: 'EUR',
      theme: 'dark',
      firstDayOfWeek: 1,
      language: 'en',
      schemaVersion: 1,
      createdAt: '2026-10-15T00:00:00.000Z',
      updatedAt: '2026-10-15T00:00:00.000Z',
      deletedAt: null
    };

    const parsed = settingsSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cartoApiKey).toBeUndefined();
    }
  });
});
