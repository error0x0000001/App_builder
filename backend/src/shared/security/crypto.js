import crypto from 'node:crypto';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomDigits = (length) => Array.from({ length }, () => crypto.randomInt(10)).join('');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('base64url');
export const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest('base64url');

export function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomChars = (n) => Array.from({ length: n }, () => RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)]).join('');
export const randomRecoveryCode = () => `${randomChars(5)}-${randomChars(5)}`;

/** AES-256-GCM envelope for secrets stored at rest (e.g. TOTP seeds). Output: iv.tag.ciphertext (base64url). */
export class SecretBox {
  constructor(base64Key) {
    this.key = crypto.createHash('sha256').update(base64Key).digest();
  }

  encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
  }

  decrypt(payload) {
    const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
