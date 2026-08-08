import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from '../src/secrets.js';

describe('provider secret encryption', () => {
  it('round-trips structured provider settings without storing plaintext', () => {
    const value = { botToken: '123456:telegram-secret-value', chatId: '-1001234' };
    const encrypted = encryptSecret(
      value,
      'a sufficiently long master key',
      'channel-id',
    );

    expect(encrypted.ciphertext).not.toContain('telegram-secret-value');
    expect(
      decryptSecret<typeof value>(
        encrypted,
        'a sufficiently long master key',
        'channel-id',
      ),
    ).toEqual(value);
  });

  it('binds ciphertext to its record context and master key', () => {
    const encrypted = encryptSecret(
      { url: 'https://example.com/hook' },
      'a sufficiently long master key',
      'channel-a',
    );
    expect(() =>
      decryptSecret(encrypted, 'a sufficiently long master key', 'channel-b'),
    ).toThrow();
    expect(() =>
      decryptSecret(encrypted, 'another sufficiently long key', 'channel-a'),
    ).toThrow();
  });
});
