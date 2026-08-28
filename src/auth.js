/**
 * Minimal shared-password gate for the capture app.
 *
 * This is a TEMPORARY stand-in for Cloudflare Access (design §5.1). It exists
 * because a write endpoint on the open internet with no gate at all is not
 * acceptable, even for a few weeks. Access replaces it before bulk capture:
 * email one-time codes, no shared secret to leak or rotate.
 */

const COOKIE = 'inv_session';
const TTL_SECONDS = 60 * 60 * 12;   // a working day

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time-ish comparison; avoids leaking position of first difference. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makeSession(env, who) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${who}|${exp}`;
  const sig = await hmac(env.CAPTURE_PASSWORD, payload);
  return `${COOKIE}=${encodeURIComponent(payload + '|' + sig)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

export async function whoami(request, env) {
  const raw = (request.headers.get('cookie') || '')
    .split(';').map(s => s.trim())
    .find(s => s.startsWith(COOKIE + '='));
  if (!raw) return null;
  const parts = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('|');
  if (parts.length !== 3) return null;
  const [who, exp, sig] = parts;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  const expected = await hmac(env.CAPTURE_PASSWORD, `${who}|${exp}`);
  return safeEqual(sig, expected) ? who : null;
}

export async function checkPassword(env, given) {
  if (!env.CAPTURE_PASSWORD) return false;
  // Hash both sides so length alone doesn't leak.
  const a = await hmac(env.CAPTURE_PASSWORD, 'pw');
  const b = await hmac(given || '', 'pw');
  return safeEqual(a, b);
}