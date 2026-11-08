import { scryptSync, timingSafeEqual } from 'node:crypto';

const COOKIE = '__Host-bookshelf-session';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const ACCOUNT_PREFIX = 'account:';
const SITES_HOSTS = new Set(['brclio-baby-bookshelf.brclio.chatgpt.site', 'baby-bookshelf.bornforthis.cn']);
const SCRYPT = {N:32768, r:8, p:3, maxmem:48 * 1024 * 1024};
const HASH_FORMAT = 'scrypt-v1';
const LOGIN_WINDOW = 15 * 60;

export function json(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, {status, headers:{'Cache-Control':'private, no-store', ...extraHeaders}});
}

class RequestFailure extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}

export async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return hex(bytes);
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function cookieValue(request) {
  const prefix = COOKIE + '=';
  const cookie = (request.headers.get('Cookie') || '').split(/;\s*/).find(c => c.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : '';
}

function cookie(token) {
  // The explicit signed-out value suppresses automatic legacy Sites access in this browser.
  return COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSION_SECONDS;
}

export function checkWriteOrigin(request) {
  const origin = request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return json({error:'cross_origin'}, 403);
  }
}

export async function readJson(request, limit) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestFailure(415,'expected_json');
  }
  if (Number(request.headers.get('Content-Length')) > limit) throw new RequestFailure(413,'too_large');
  // A chunked request may not declare its length. Stop reading as soon as the cap is exceeded.
  const reader = request.body?.getReader();
  const chunks = [];
  let total = 0;
  while (reader) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      void reader.cancel();
      throw new RequestFailure(413,'too_large');
    }
    chunks.push(value);
  }
  try {
    const data = JSON.parse(await new Blob(chunks).text());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw new RequestFailure(400,'invalid_json'); }
}

function sitesOwner(request, env) {
  const host = new URL(request.url).hostname;
  const local = env.BOOKSHELF_TEST_SITES === '1' && ['localhost','127.0.0.1','[::1]'].includes(host);
  if (!SITES_HOSTS.has(host) && !local) return null;
  // On these deployed origins Sites dispatch sets this header from its authenticated session.
  const owner = request.headers.get('oai-authenticated-user-id');
  return owner && !owner.startsWith(ACCOUNT_PREFIX) ? owner : null;
}

function unix() { return Math.floor(Date.now() / 1000); }

export async function identity(request, env, db) {
  const site = sitesOwner(request, env);
  const token = cookieValue(request);
  if (/^[0-9a-f]{64}$/.test(token)) {
    const account = await db.prepare(`SELECT accounts.id, accounts.username FROM account_sessions s
      JOIN accounts ON accounts.id = s.account_id WHERE s.token_hash = ? AND s.expires > ?`)
      .bind(await digest(token), unix()).first();
    if (account) return {mode:'account', owner:ACCOUNT_PREFIX + account.id, account, site};
  }
  // An expired or revoked app session must not silently change the reader to a Sites identity.
  if (!token && site && !await db.prepare('SELECT 1 FROM account_sites_imports WHERE sites_owner = ?').bind(site).first()) {
    return {mode:'sites', owner:site, account:null, site};
  }
  return {mode:'guest', owner:null, account:null, site};
}

async function sessionView(db, identity) {
  const {mode,account,site} = identity;
  let legacyCount = 0;
  if (site) {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM purchases WHERE owner = ?
      AND NOT EXISTS (SELECT 1 FROM account_sites_imports WHERE sites_owner = ? OR account_id = ?)`)
      .bind(site, site, account?.id || '').first();
    legacyCount = Number(row?.count || 0);
  }
  return {mode, user:account ? {username:account.username} : null, canImportSites:legacyCount > 0, legacyCount};
}

function parseUsername(value) {
  if (typeof value !== 'string') return null;
  const display = value.trim().normalize('NFKC');
  if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(display)) return null;
  return {display, key:display.toLowerCase()};
}

function validPassword(password) {
  if (typeof password !== 'string') return false;
  const n = [...password].length;
  return n >= 10 && n <= 128;
}

function derive(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g), octet => parseInt(octet,16));
  return scryptSync(password, salt, 32, SCRYPT);
}

function passwordHash(password) {
  const salt = randomHex(16);
  return HASH_FORMAT + '$' + salt + '$' + hex(derive(password, salt));
}

function matchesPassword(password, stored) {
  // A missing username performs the same KDF as an existing username.
  const [format, salt, expected] = (stored || HASH_FORMAT + '$' + '00'.repeat(16) + '$' + '00'.repeat(32)).split('$');
  if (format !== HASH_FORMAT || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(expected)) return false;
  const result = derive(password, salt);
  const bytes = Uint8Array.from(expected.match(/../g), octet => parseInt(octet,16));
  return timingSafeEqual(result, bytes) && !!stored;
}

async function throttle(request, db, env, route, username) {
  const now = unix();
  const ip = request.headers.get('CF-Connecting-IP') || sitesOwner(request,env) || 'shared';
  const quotas = [[route + ':client:' + ip, route === 'register' ? 12 : 60]];
  quotas.push([route + ':name:' + username, route === 'register' ? 8 : 12]);
  const statements = [db.prepare('DELETE FROM account_auth_limits WHERE expires <= ?').bind(now)];
  for (const [bucket] of quotas) {
    statements.push(db.prepare(`INSERT INTO account_auth_limits (bucket, expires, attempts) VALUES (?, ?, 1)
      ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1 RETURNING attempts, expires`)
      .bind(await digest(bucket), now + LOGIN_WINDOW));
  }
  const [, ...budgets] = await db.batch(statements);
  for (let i=0;i<budgets.length;i++) {
    const row = budgets[i].results[0];
    if (row.attempts > quotas[i][1]) return json({error:'rate_limited'},429,{'Retry-After':String(Math.max(1,row.expires-now))});
  }
  return null;
}

async function newSession(db, accountId, request) {
  const token = randomHex(32);
  const old = cookieValue(request);
  const stmts = [db.prepare('DELETE FROM account_sessions WHERE expires <= ?').bind(unix())];
  if (/^[0-9a-f]{64}$/.test(old)) stmts.push(db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(await digest(old)));
  stmts.push(db.prepare('INSERT INTO account_sessions (token_hash, account_id, expires) VALUES (?, ?, ?)')
    .bind(await digest(token), accountId, unix()+SESSION_SECONDS));
  return {token, stmts};
}

function claimStatements(db, site, accountId) {
  const owner = ACCOUNT_PREFIX + accountId;
  // Both unique constraints and the copy+delete belong to one transaction.
  return [
    db.prepare('INSERT INTO account_sites_imports (sites_owner, account_id) VALUES (?, ?)').bind(site,accountId),
    db.prepare('INSERT OR IGNORE INTO purchases (owner, edition) SELECT ?, edition FROM purchases WHERE owner = ?').bind(owner,site),
    db.prepare('DELETE FROM purchases WHERE owner = ?').bind(site)
  ];
}

function constraintName(error) {
  return String(error?.message) + ' ' + String(error?.cause?.message || '');
}

async function registerOrLogin(request, db, env, route, data) {
  const name = parseUsername(data.username);
  if (!name) throw new RequestFailure(route === 'login' ? 401 : 400, route === 'login' ? 'invalid_credentials' : 'invalid_username');
  if (!validPassword(data.password)) throw new RequestFailure(route === 'login' ? 401 : 400, route === 'login' ? 'invalid_credentials' : 'invalid_password');
  if ('importSites' in data && typeof data.importSites !== 'boolean') throw new RequestFailure(400,'invalid_json');
  const limit = await throttle(request,db,env,route,name.key);
  if (limit) return limit;
  const site = sitesOwner(request,env);
  let account;
  const statements = [];
  if (route === 'register') {
    if (data.importSites && !site) throw new RequestFailure(409,'legacy_unavailable');
    account = {id:crypto.randomUUID(),username:name.display};
    statements.push(db.prepare('INSERT INTO accounts (id, username, username_key, password_hash) VALUES (?, ?, ?, ?)')
      .bind(account.id,account.username,name.key,passwordHash(data.password)));
    if (data.importSites) statements.push(...claimStatements(db,site,account.id));
  } else {
    account = await db.prepare('SELECT id, username, password_hash FROM accounts WHERE username_key = ?').bind(name.key).first();
    if (!matchesPassword(data.password,account?.password_hash)) throw new RequestFailure(401,'invalid_credentials');
  }
  const session = await newSession(db,account.id,request);
  try {
    await db.batch([...statements,...session.stmts]);
  } catch (error) {
    const cause = constraintName(error);
    if (cause.includes('accounts.username_key')) throw new RequestFailure(409,'username_unavailable');
    if (cause.includes('account_sites_imports.')) throw new RequestFailure(409,'legacy_unavailable');
    throw error;
  }
  return json(await sessionView(db,{mode:'account',account,site}),route==='register'?201:200,{'Set-Cookie':cookie(session.token)});
}

export async function authRoute(request, env, db, route) {
  if (!['session','login','register','logout','import-sites'].includes(route)) return json({error:'not_found'},404);
  const method = route==='session' ? 'GET' : 'POST';
  if (request.method!==method) return json({error:'method_not_allowed'},405,{Allow:method});
  if (method === 'GET') return json(await sessionView(db,await identity(request,env,db)));
  const data = await readJson(request,4096);
  if (route==='login' || route==='register') return registerOrLogin(request,db,env,route,data);
  if (route==='logout') {
    const token = cookieValue(request);
    if (/^[0-9a-f]{64}$/.test(token)) await db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(await digest(token)).run();
    return json(await sessionView(db,{mode:'guest',account:null,site:sitesOwner(request,env)}),200,{'Set-Cookie':cookie('out')});
  }
  const actor = await identity(request,env,db);
  if (!actor.account) throw new RequestFailure(401,'sign_in_required');
  if (!(await sessionView(db,actor)).canImportSites) throw new RequestFailure(409,'legacy_unavailable');
  try {
    await db.batch(claimStatements(db,actor.site,actor.account.id));
  } catch(error) {
    if (constraintName(error).includes('account_sites_imports.')) throw new RequestFailure(409,'legacy_unavailable');
    throw error;
  }
  return json(await sessionView(db,actor));
}

export function handleError(error) {
  if (error instanceof RequestFailure) return json({error:error.message},error.status);
  console.error('Bookshelf API request failed:', error?.name);
  return json({error:'storage_unavailable'},503);
}
