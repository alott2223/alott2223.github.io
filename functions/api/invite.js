import { parseJson, ensureAdmin, getSession, unauthorized, forbidden, badRequest, ok, created } from './utils.js';

export async function onRequestGet({ request, env }) {
  await ensureAdmin(env);
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();
  const index = await env.INVITES.list({ prefix: 'invite:' });
  const invites = [];
  for (const key of index.keys) {
    const item = await env.INVITES.get(key.name, 'json');
    if (item) invites.push(item);
  }
  return ok({ invites });
}

export async function onRequestPost({ request, env }) {
  await ensureAdmin(env);
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();
  const body = await parseJson(request) || {};
  if (body.action === 'clearUsed') {
    const index = await env.INVITES.list({ prefix: 'invite:' });
    for (const key of index.keys) {
      const item = await env.INVITES.get(key.name, 'json');
      if (item && item.used) await env.INVITES.delete(key.name);
    }
    return ok({ message: 'Cleared used invites' });
  }
  const description = body.description || 'No description';
  const code = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 36]).join('');
  const invite = { code, description, createdAt: new Date().toISOString(), used: false, usedBy: null, usedAt: null };
  await env.INVITES.put('invite:' + code, JSON.stringify(invite));
  return created({ code });
}

export async function onRequestDelete({ request, env }) {
  await ensureAdmin(env);
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();
  const body = await parseJson(request);
  if (!body || !body.code) return badRequest('Missing code');
  await env.INVITES.delete('invite:' + body.code);
  return ok({ message: 'Deleted' });
}
