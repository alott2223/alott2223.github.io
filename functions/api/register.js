import { parseJson, hashPassword, ensureAdmin, getUser, saveUser, createSession, setSessionCookie, logAccess, clientIp, badRequest, ok, unauthorized } from './utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  await ensureAdmin(env);
  const body = await parseJson(request);
  if (!body) return badRequest('Invalid JSON');
  const { username, password, inviteCode, fingerprint } = body;
  if (!username || !password || !inviteCode) return badRequest('Missing fields');
  const existing = await getUser(env, username);
  if (existing) return badRequest('Username already exists');
  const invite = await env.INVITES.get('invite:' + inviteCode, 'json');
  if (!invite || invite.used) return badRequest('Invalid or used invite');
  const hashed = await hashPassword(password);
  const user = { username, password: hashed, createdAt: new Date().toISOString(), inviteCode, isAdmin: false, lastLogin: null };
  await saveUser(env, user);
  invite.used = true;
  invite.usedBy = username;
  invite.usedAt = new Date().toISOString();
  await env.INVITES.put('invite:' + inviteCode, JSON.stringify(invite));
  const session = await createSession(env, username);
  await logAccess(env, {
    username,
    timestamp: new Date().toISOString(),
    success: true,
    action: 'register',
    fingerprint: fingerprint || null,
    userAgent: request.headers.get('user-agent') || '',
    screen: body.screen || null,
    timezone: body.timezone || null,
    language: body.language || null,
    ip: clientIp(request)
  });
  return new Response(JSON.stringify({ user: { username, createdAt: user.createdAt, inviteCode, isAdmin: false } }), {
    status: 201,
    headers: {
      'content-type': 'application/json',
      'set-cookie': setSessionCookie(session.token, Number(env.SESSION_TTL_SECONDS || 604800))
    }
  });
}
