import { parseJson, hashPassword, ensureAdmin, getUser, createSession, setSessionCookie, logAccess, clientIp, badRequest, ok, unauthorized } from './utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  await ensureAdmin(env);
  const body = await parseJson(request);
  if (!body) return badRequest('Invalid JSON');
  const { username, password, fingerprint, changePassword, newPassword } = body;

  // Password change for current session
  if (changePassword) {
    if (!newPassword || newPassword.length < 6) return badRequest('Password too short');
    const sessionCookie = (request.headers.get('Cookie') || '').match(/rnn_session=([^;]+)/);
    if (!sessionCookie) return unauthorized();
    const session = await env.SESSIONS.get('session:' + sessionCookie[1], 'json');
    if (!session) return unauthorized();
    const user = await getUser(env, session.username);
    if (!user) return unauthorized();
    user.password = await hashPassword(newPassword);
    await env.USERS.put('user:' + user.username, JSON.stringify(user));
    return ok({ message: 'Password updated' });
  }

  if (!username || !password) return badRequest('Missing credentials');
  const user = await getUser(env, username);
  if (!user) return unauthorized();

  const hashed = await hashPassword(password);
  if (hashed !== user.password) {
    await logAccess(env, {
      username,
      timestamp: new Date().toISOString(),
      success: false,
      action: 'login',
      fingerprint: fingerprint || null,
      userAgent: request.headers.get('user-agent') || '',
      ip: clientIp(request)
    });
    return unauthorized();
  }

  const session = await createSession(env, username);
  user.lastLogin = new Date().toISOString();
  await env.USERS.put('user:' + username, JSON.stringify(user));
  await logAccess(env, {
    username,
    timestamp: new Date().toISOString(),
    success: true,
    action: 'login',
    fingerprint: fingerprint || null,
    userAgent: request.headers.get('user-agent') || '',
    ip: clientIp(request)
  });

  return new Response(JSON.stringify({ user: { username: user.username, isAdmin: user.isAdmin, createdAt: user.createdAt, inviteCode: user.inviteCode } }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': setSessionCookie(session.token, Number(env.SESSION_TTL_SECONDS || 604800))
    }
  });
}
