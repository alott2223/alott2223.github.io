import { clearSession, ok } from './utils.js';

export async function onRequestPost({ request, env }) {
  const cookie = await clearSession(env, request);
  return new Response(JSON.stringify({ message: 'Logged out' }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': cookie }
  });
}
