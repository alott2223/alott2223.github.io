import { parseJson, getSession, unauthorized, badRequest, ok } from './utils.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  const messages = await env.MESSAGES.get('messages', 'json') || [];
  return ok({ messages });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  const body = await parseJson(request);
  if (!body) return badRequest('Invalid JSON');
  const text = (body.text || '').toString().trim();
  if (!text && !body.media) return badRequest('Message is empty');
  if (text.length > 2000) return badRequest('Message too long');

  let media = null;
  if (body.media) {
    const { name, type, data } = body.media;
    if (!name || !type || !data) return badRequest('Invalid media');
    // naive size check
    const approxBytes = data.length * 0.75;
    if (approxBytes > (env.MEDIA_MAX_MB ? Number(env.MEDIA_MAX_MB) * 1024 * 1024 : 5 * 1024 * 1024)) {
      return badRequest('Media too large');
    }
    media = { name, type, data };
  }

  const messages = await env.MESSAGES.get('messages', 'json') || [];
  const msg = {
    id: crypto.randomUUID(),
    author: session.user.username,
    text,
    timestamp: new Date().toISOString(),
    media
  };
  messages.push(msg);
  const limit = Number(env.MESSAGES_MAX || 200);
  await env.MESSAGES.put('messages', JSON.stringify(messages.slice(-limit)));
  return ok({ message: 'created', id: msg.id });
}
