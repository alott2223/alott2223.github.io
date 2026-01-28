import { getSession, unauthorized, forbidden, ok } from '../utils.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();

  const usersIndex = await env.USERS.get('users:index', 'json') || [];
  const invitesList = await env.INVITES.list({ prefix: 'invite:' });
  const invites = [];
  for (const key of invitesList.keys) {
    const item = await env.INVITES.get(key.name, 'json');
    if (item) invites.push(item);
  }
  const media = await env.MEDIA.get('media', 'json') || [];
  const messages = await env.MESSAGES.get('messages', 'json') || [];
  const logs = await env.LOGS.get('logs', 'json') || [];
  const successCount = logs.filter(l => l.success).length;
  const failedCount = logs.filter(l => !l.success).length;
  const uniqueFingerprints = new Set(logs.map(l => l.fingerprint).filter(Boolean)).size;
  const inviteActive = invites.filter(i => !i.used).length;
  const recent = logs.slice(-5).reverse();

  return ok({
    userCount: usersIndex.length,
    mediaCount: media.length,
    messageCount: messages.length,
    successCount,
    failedCount,
    uniqueFingerprints,
    inviteActive,
    logsCount: logs.length,
    recent
  });
}
