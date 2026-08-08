import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

const SECRET_FORMAT = 'chronicle:secret:v1';

function encryptionKey(masterKey: string): Buffer {
  if (masterKey.length < 16) {
    throw new RangeError('APP_MASTER_KEY must contain at least 16 characters.');
  }
  return createHash('sha256').update(masterKey, 'utf8').digest();
}

function additionalData(context: string): Buffer {
  return Buffer.from(`${SECRET_FORMAT}:${context}`, 'utf8');
}

export function encryptSecret(
  value: unknown,
  masterKey: string,
  context: string,
): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(masterKey), iv);
  cipher.setAAD(additionalData(context));
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptSecret<T>(
  encrypted: EncryptedSecret,
  masterKey: string,
  context: string,
): T {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(masterKey),
    Buffer.from(encrypted.iv, 'base64url'),
  );
  decipher.setAAD(additionalData(context));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext) as T;
}
