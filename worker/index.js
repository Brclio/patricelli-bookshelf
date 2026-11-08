function json(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store', ...extraHeaders }
  });
}

async function scopeFor(owner) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(owner));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function purchases(request, env, knownEditions) {
  const owner = request.headers.get('oai-authenticated-user-id');
  if (!owner) return json({ error: 'sign_in_required' }, 401);
  if (!['GET', 'PUT'].includes(request.method)) {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, PUT' });
  }
  const scope = await scopeFor(owner);
  const session = env.DB.withSession('first-primary');
  const read = session.prepare('SELECT edition FROM purchases WHERE owner = ? ORDER BY edition').bind(owner);
  if (request.method === 'GET') {
    const { results } = await read.all();
    return json({ scope, purchased: results.map(row => row.edition) });
  }

  // An offline queue can only be replayed into the account that created it.
  const expected = request.headers.get('If-Match-Account');
  if (!expected) return json({ error: 'account_precondition_required' }, 428);
  if (expected !== scope) return json({ error: 'account_changed' }, 409);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'expected_json' }, 415);
  }
  if (Number(request.headers.get('Content-Length')) > 32_768) return json({ error: 'too_large' }, 413);
  let body;
  try {
    const input = await request.text();
    if (input.length > 32_768) return json({ error: 'too_large' }, 413);
    body = JSON.parse(input);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const changes = body?.changes;
  if (!Array.isArray(changes) || changes.length > knownEditions.size) {
    return json({ error: 'invalid_changes' }, 400);
  }

  const pending = new Map();
  for (const change of changes) {
    if (!knownEditions.has(change?.key) || typeof change?.purchased !== 'boolean' || pending.has(change.key)) {
      return json({ error: 'invalid_edition_change' }, 400);
    }
    pending.set(change.key, change.purchased);
  }
  const statements = [];
  for (const [key, purchased] of pending) {
    const query = purchased
      ? 'INSERT INTO purchases (owner, edition) VALUES (?, ?) ON CONFLICT (owner, edition) DO NOTHING'
      : 'DELETE FROM purchases WHERE owner = ? AND edition = ?';
    statements.push(session.prepare(query).bind(owner, key));
  }
  // D1 executes a batch atomically, including the read of the committed state.
  const result = await session.batch([...statements, read]);
  return json({ scope, purchased: result.at(-1).results.map(row => row.edition) });
}

// The build derives editionKeys directly from the catalog that it publishes.
const knownEditions = new Set(editionKeys);
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/purchases') {
      try {
        return await purchases(request, env, knownEditions);
      } catch (error) {
        console.error('Purchase storage request failed:', error?.name);
        return json({ error: 'storage_unavailable' }, 503);
      }
    }
    if (pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  }
};
