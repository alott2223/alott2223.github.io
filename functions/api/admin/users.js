import { getSession, unauthorized, forbidden, parseJson, badRequest, ok } from '../utils.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();
  const index = await env.USERS.get('users:index', 'json') || [];
  const users = [];
  for (const username of index) {
    const user = await env.USERS.get('user:' + username, 'json');
    if (user) users.push({ username: user.username, createdAt: user.createdAt, inviteCode: user.inviteCode || null, isAdmin: !!user.isAdmin, lastLogin: user.lastLogin || null });
  }
  return ok({ users });
}

export async function onRequestDelete({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();
  const body = await parseJson(request);
  if (!body || !body.username) return badRequest('Missing username');
  const index = await env.USERS.get('users:index', 'json') || [];
  const filtered = index.filter(u => u !== body.username);
  await env.USERS.put('users:index', JSON.stringify(filtered));
  await env.USERS.delete('user:' + body.username);
  return ok({ message: 'Deleted' });
}
