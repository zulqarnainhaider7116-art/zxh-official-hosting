import crypto from 'node:crypto';
import { HttpError } from './core.js';

/**
 * AES-256-GCM encryption for credentials at rest.
 * Key k1 = SHA-256(DEPLOYFORGE_ENCRYPTION_KEY) when configured (recommended).
 * Key k0 = SHA-256 derived from the server-only service role key (fallback so the
 * product works out of the box; still never exposed to the browser).
 * Ciphertexts carry their key id so both can be decrypted after rotation.
 */
function keyFor(id) {
  if (id === 'k1') {
    const env = process.env.DEPLOYFORGE_ENCRYPTION_KEY;
    if (!env) return null;
    return crypto.createHash('sha256').update(`deployforge:k1:${env}`).digest();
  }
  if (id === 'k0') {
    const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base) return null;
    return crypto.createHash('sha256').update(`deployforge:k0:${base}`).digest();
  }
  return null;
}

export function keySource() {
  return process.env.DEPLOYFORGE_ENCRYPTION_KEY ? 'dedicated' : 'derived';
}

export function encrypt(plain) {
  const id = process.env.DEPLOYFORGE_ENCRYPTION_KEY ? 'k1' : 'k0';
  const key = keyFor(id);
  if (!key) throw new HttpError(500, 'Encryption is not configured on the server.', 'encryption_unavailable');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${id}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(payload) {
  if (!payload) return '';
  const [id, ivB, tagB, ctB] = String(payload).split(':');
  const key = keyFor(id);
  if (!key || !ivB || !tagB || !ctB) throw new HttpError(500, 'A stored credential could not be decrypted. Re-enter it to continue.', 'decrypt_failed');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new HttpError(500, 'A stored credential could not be decrypted. Re-enter it to continue.', 'decrypt_failed');
  }
}

export function mask(value) {
  const v = String(value || '');
  return v.length > 8 ? `••••••••${v.slice(-4)}` : '••••••••';
}
