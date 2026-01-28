import { getSession, unauthorized, forbidden, parseJson, ok, badRequest } from '../utils.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();
  const logs = await env.LOGS.get('logs', 'json') || [];
  return ok({ logs: logs.slice().reverse() });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();
  const body = await parseJson(request) || {};
  if (body.action === 'clear') {
    await env.LOGS.delete('logs');
    return ok({ message: 'Cleared' });
  }
  return badRequest('Unknown action');
}
