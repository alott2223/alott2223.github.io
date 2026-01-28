export function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export async function parseJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

function randomString(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

export async function hashPassword(pw) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function ensureAdmin(env) {
  const adminKey = 'user:alott';
  const existing = await env.USERS.get(adminKey, 'json');
  if (!existing) {
    const hashed = await hashPassword('Alott@1234*');
    const user = { username: 'alott', password: hashed, createdAt: new Date().toISOString(), inviteCode: 'ADMIN', isAdmin: true, lastLogin: null };
    await env.USERS.put(adminKey, JSON.stringify(user));
    const index = await env.USERS.get('users:index', 'json') || [];
    if (!index.includes('alott')) index.push('alott');
    await env.USERS.put('users:index', JSON.stringify(index));
  }
}

export async function getUser(env, username) {
  return await env.USERS.get('user:' + username, 'json');
}

export async function saveUser(env, user) {
  await env.USERS.put('user:' + user.username, JSON.stringify(user));
  const index = await env.USERS.get('users:index', 'json') || [];
  if (!index.includes(user.username)) {
    index.push(user.username);
    await env.USERS.put('users:index', JSON.stringify(index));
  }
}

export async function createSession(env, username) {
  const token = randomString(48);
  const now = Date.now();
  const ttl = Number(env.SESSION_TTL_SECONDS || 604800) * 1000;
  const session = { token, username, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + ttl).toISOString() };
  await env.SESSIONS.put('session:' + token, JSON.stringify(session), { expirationTtl: ttl / 1000 });
  return session;
}

export async function getSession(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = /rnn_session=([^;]+)/.exec(cookie);
  if (!match) return null;
  const token = match[1];
  const session = await env.SESSIONS.get('session:' + token, 'json');
  if (!session) return null;
  const now = Date.now();
  if (new Date(session.expiresAt).getTime() < now) {
    await env.SESSIONS.delete('session:' + token);
    return null;
  }
  const user = await getUser(env, session.username);
  if (!user) return null;
  return { session, user, token };
}

export function setSessionCookie(token, ttlSeconds) {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toUTCString();
  return `rnn_session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=${expires}`;
}

export async function clearSession(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = /rnn_session=([^;]+)/.exec(cookie);
  if (match) {
    const token = match[1];
    await env.SESSIONS.delete('session:' + token);
  }
  return 'rnn_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax; Secure';
}

export async function logAccess(env, payload) {
  const logs = await env.LOGS.get('logs', 'json') || [];
  logs.push(payload);
  const max = Number(env.LOGS_MAX || 500);
  await env.LOGS.put('logs', JSON.stringify(logs.slice(-max)));
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'Unknown';
}

export function unauthorized() {
  return json(401, { error: 'Unauthorized' });
}

export function forbidden() {
  return json(403, { error: 'Forbidden' });
}

export function badRequest(msg) {
  return json(400, { error: msg });
}

export function ok(data) {
  return json(200, data);
}

export function created(data) {
  return json(201, data);
}

export function notFound(msg = 'Not found') {
  return json(404, { error: msg });
}
