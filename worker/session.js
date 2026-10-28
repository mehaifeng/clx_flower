const encoder = new TextEncoder();
export const COOKIE_NAME = '__Secure-linxuan_session';
export const SESSION_AGE = 7 * 86400;
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unbase64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
async function key(env) {
  return crypto.subtle.importKey('raw', encoder.encode(`${env.SESSION_SECRET}\n${env.GARDEN_PASSCODE}`), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
export async function fingerprint(env, value) {
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await key(env), encoder.encode(value))));
}
export async function passcodeMatches(given, expected) {
  const digest = value => crypto.subtle.digest('SHA-256', encoder.encode(value));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let different = 0;
  for (let i = 0; i < aa.length; i++) different |= aa[i] ^ bb[i];
  return different === 0;
}
export async function createSession(env, origin) {
  const payload = base64url(encoder.encode(JSON.stringify({sid: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + SESSION_AGE, aud: origin})));
  return `${payload}.${await fingerprint(env, payload)}`;
}
export async function readSession(request, env) {
  try {
    const token = request.headers.get('Cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + '='))?.slice(COOKIE_NAME.length + 1);
    if (!token || token.length > 1024) return null;
    const [payload, signature, extra] = token.split('.');
    if (extra || !signature || !await crypto.subtle.verify('HMAC', await key(env), unbase64(signature), encoder.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(unbase64(payload)));
    return typeof data.sid === 'string' && data.exp > Date.now() / 1000 && data.aud === new URL(request.url).origin ? data : null;
  } catch { return null; }
}
export const sessionCookie = (token, age = SESSION_AGE) => `${COOKIE_NAME}=${token}; Path=/chenlinxuan; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
