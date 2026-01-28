import { getSession, unauthorized, ok } from './utils.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  const index = await env.USERS.get('users:index', 'json') || [];
  const users = [];
  for (const username of index) {
    const user = await env.USERS.get('user:' + username, 'json');
    if (user) users.push({ username: user.username, createdAt: user.createdAt });
  }
  return ok({ users });
}
