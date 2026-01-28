import { parseJson, getSession, unauthorized, badRequest, ok, forbidden } from './utils.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  const media = await env.MEDIA.get('media', 'json') || [];
  return ok({ media });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  const body = await parseJson(request);
  if (!body || !body.media) return badRequest('Missing media');
  const { name, type, data } = body.media;
  if (!name || !type || !data) return badRequest('Invalid media');
  const approxBytes = data.length * 0.75;
  if (approxBytes > (env.MEDIA_MAX_MB ? Number(env.MEDIA_MAX_MB) * 1024 * 1024 : 5 * 1024 * 1024)) {
    return badRequest('Media too large');
  }
  const media = await env.MEDIA.get('media', 'json') || [];
  const item = { id: crypto.randomUUID(), name, type, data, date: new Date().toISOString(), uploadedBy: session.user.username };
  media.push(item);
  const limit = Number(env.MEDIA_MAX || 200);
  await env.MEDIA.put('media', JSON.stringify(media.slice(-limit)));
  return ok({ id: item.id });
}

export async function onRequestDelete({ request, env }) {
  const session = await getSession(env, request);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();
  const body = await parseJson(request);
  if (!body || !body.id) return badRequest('Missing id');
  const media = await env.MEDIA.get('media', 'json') || [];
  const filtered = media.filter(m => m.id !== body.id);
  await env.MEDIA.put('media', JSON.stringify(filtered));
  return ok({ message: 'deleted' });
}
