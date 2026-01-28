import { getSession, unauthorized, ok, ensureAdmin } from './utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  await ensureAdmin(env);
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  const { user } = session;
  return ok({ user: { username: user.username, isAdmin: user.isAdmin, createdAt: user.createdAt, inviteCode: user.inviteCode, lastLogin: user.lastLogin || null } });
}
