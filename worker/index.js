import { authRoute, checkWriteOrigin, digest, handleError, identity, json, readJson } from './auth.js';

async function purchases(request, env, db, knownEditions) {
  if (!['GET','PUT'].includes(request.method)) return json({error:'method_not_allowed'},405,{Allow:'GET, PUT'});
  const actor = await identity(request,env,db);
  if (!actor.owner) return json({error:'sign_in_required'},401);
  const scope = await digest(actor.owner);
  const read = db.prepare('SELECT edition FROM purchases WHERE owner = ? ORDER BY edition').bind(actor.owner);
  if (request.method === 'GET') {
    const {results} = await read.all();
    return json({scope,mode:actor.mode,purchased:results.map(row=>row.edition)});
  }

  // A write queued by another account must never be replayed after a login change.
  const expected = request.headers.get('If-Match-Account');
  if (!expected) return json({error:'account_precondition_required'},428);
  if (expected !== scope) return json({error:'account_changed'},409);
  const {changes} = await readJson(request,32768);
  if (!Array.isArray(changes) || changes.length > knownEditions.size) return json({error:'invalid_changes'},400);
  const keys = new Set();
  // A claim moving legacy marks and an older browser writing them can race.
  // Test the claim inside the write transaction to prevent resurrecting retired records.
  const guard = actor.mode === 'sites' ? 'NOT EXISTS (SELECT 1 FROM account_sites_imports WHERE sites_owner = ?)' : '1';
  const statements = [];
  for (const change of changes) {
    if (!knownEditions.has(change?.key) || typeof change?.purchased !== 'boolean' || keys.has(change.key)) {
      return json({error:'invalid_edition_change'},400);
    }
    keys.add(change.key);
    const sql = change.purchased
      ? 'INSERT OR IGNORE INTO purchases (owner, edition) SELECT ?, ? WHERE '+guard
      : 'DELETE FROM purchases WHERE owner = ? AND edition = ? AND '+guard;
    const args = [actor.owner,change.key];
    if (actor.mode === 'sites') args.push(actor.owner);
    statements.push(db.prepare(sql).bind(...args));
  }
  if (actor.mode === 'sites') statements.push(db.prepare('SELECT 1 FROM account_sites_imports WHERE sites_owner = ?').bind(actor.owner));
  const result = await db.batch([...statements,read]);
  if (actor.mode === 'sites' && result.at(-2).results.length) return json({error:'account_changed'},409);
  return json({scope,mode:actor.mode,purchased:result.at(-1).results.map(row=>row.edition)});
}

export function createWorker(editionKeys) {
  const knownEditions = new Set(editionKeys);
  return {
    async fetch(request, env) {
      const {pathname} = new URL(request.url);
      if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      try {
        if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
          const denied = checkWriteOrigin(request);
          if (denied) return denied;
        }
        const db = env.DB.withSession('first-primary');
        if (pathname === '/api/purchases') return await purchases(request,env,db,knownEditions);
        if (pathname.startsWith('/api/auth/')) return await authRoute(request,env,db,pathname.slice('/api/auth/'.length));
        return json({error:'not_found'},404);
      } catch(error) {
        return handleError(error);
      }
    }
  };
}
