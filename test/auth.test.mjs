import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';

const edition = '9780763619503';
const mini = edition + '-9780763650100';
const password = 'test-only password 1';

test('registered accounts isolate purchases and can explicitly claim previous Sites records once', async t => {
  const runtime = new Miniflare({
    modules: true, script: await readFile('dist/server/index.js','utf8'),
    compatibilityDate: '2026-05-15', compatibilityFlags:['nodejs_compat'],
    bindings:{BOOKSHELF_TEST_SITES:'1'}, d1Databases:['DB']
  });
  t.after(() => runtime.dispose());
  const db = await runtime.getD1Database('DB');
  for (const filename of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()) {
    for (const sql of (await readFile('drizzle/'+filename,'utf8')).split('--> statement-breakpoint')) {
      await db.prepare(sql).run();
    }
  }
  async function call(path, {method='GET', body, cookie, site, headers={}, host='localhost'} = {}) {
    const url = 'https://'+host+'/api/'+path;
    const options = {method, headers:{...headers}};
    if (body) {
      options.body = JSON.stringify(body);
      options.headers['Content-Type']='application/json';
    }
    if (cookie) options.headers.Cookie=cookie;
    if (site) options.headers['oai-authenticated-user-id']=site;
    const response=await runtime.dispatchFetch(url,options);
    const rawCookie=response.headers.get('set-cookie');
    return {status:response.status, data:await response.json(), rawCookie, cookie:rawCookie?.split(';')[0]};
  }
  const legacy = 'trusted-reader';
  const original=await call('purchases',{site:legacy});
  assert.equal(original.data.mode,'sites');
  assert.equal((await call('purchases',{host:'example.org',site:legacy})).status,401);
  assert.equal((await call('purchases',{site:legacy,method:'PUT',headers:{'If-Match-Account':original.data.scope},
    body:{changes:[{key:mini,purchased:true}]}})).status,200);

  const registration = {username:'Ｒeader_1',password};
  const denied=await call('auth/register',{method:'POST',body:registration,headers:{Origin:'https://elsewhere.test'}});
  assert.equal(denied.status,403);
  const one=await call('auth/register',{site:legacy,method:'POST',body:registration});
  assert.equal(one.status,201);
  assert.equal(one.data.user.username,'Reader_1');
  assert.equal(one.data.legacyCount,1);
  assert.equal(one.data.canImportSites,true);
  assert.match(one.rawCookie,/; HttpOnly; Secure; SameSite=Lax;/);
  assert.deepEqual((await call('purchases',{site:legacy,cookie:one.cookie})).data.purchased,[]);
  const dup=await call('auth/register',{method:'POST',body:{username:'reader_1',password}});
  assert.equal(dup.status,409);
  const imported=await call('auth/import-sites',{site:legacy,cookie:one.cookie,method:'POST',body:{}});
  assert.equal(imported.status,200);
  assert.equal(imported.data.canImportSites,false);
  const shelf=await call('purchases',{cookie:one.cookie});
  assert.equal(shelf.data.mode,'account');
  assert.deepEqual(shelf.data.purchased,[mini]);
  assert.equal((await call('purchases',{site:legacy})).status,401);
  assert.equal((await call('purchases',{cookie:one.cookie,site:legacy,method:'PUT',headers:{'If-Match-Account':original.data.scope},
    body:{changes:[{key:edition,purchased:true}]}})).status,409);
  assert.equal((await call('purchases',{cookie:one.cookie,method:'PUT',headers:{'If-Match-Account':shelf.data.scope},
    body:{changes:[{key:edition,purchased:true}]}})).status,200);
  const two=await call('auth/register',{site:legacy,method:'POST',body:{username:'Reader_2',password}});
  assert.equal(two.status,201);
  assert.equal(two.data.canImportSites,false);
  assert.deepEqual((await call('purchases',{cookie:two.cookie,site:legacy})).data.purchased,[]);
  assert.equal((await call('auth/import-sites',{site:legacy,cookie:two.cookie,method:'POST',body:{}})).status,409);
  const raced=await call('auth/register',{site:legacy,method:'POST',body:{username:'Reader_3',password,importSites:true}});
  assert.equal(raced.status,409);
  assert.equal((await db.prepare('SELECT id FROM accounts WHERE username_key=?').bind('reader_3').first()),null);
  const hashRows=await db.prepare('SELECT password_hash FROM accounts').all();
  assert.equal(hashRows.results.length,2);
  assert.notEqual(hashRows.results[0].password_hash,hashRows.results[1].password_hash);
  assert(hashRows.results.every(row=>row.password_hash.startsWith('scrypt-v1$') && !row.password_hash.includes(password)));
  const token=one.cookie.split('=')[1];
  assert.equal(token.length,64);
  const tokenHash=createHash('sha256').update(token).digest('hex');
  assert(await db.prepare('SELECT token_hash FROM account_sessions WHERE token_hash=?').bind(tokenHash).first());
  assert.equal(await db.prepare('SELECT token_hash FROM account_sessions WHERE token_hash=?').bind(token).first(),null);
  const secondBrowser=await call('auth/login',{method:'POST',body:{username:'reader_1',password}});
  assert.equal(secondBrowser.status,200);
  assert.notEqual(secondBrowser.cookie,one.cookie);
  assert.deepEqual((await call('purchases',{cookie:secondBrowser.cookie})).data.purchased.sort(),[edition,mini].sort());
  const logout=await call('auth/logout',{site:legacy,cookie:one.cookie,method:'POST',body:{}});
  assert.equal(logout.data.mode,'guest');
  assert.equal((await call('purchases',{cookie:one.cookie})).status,401);
  assert.equal((await call('purchases',{cookie:logout.cookie,site:'another-legacy-reader'})).status,401);
  assert.equal((await call('purchases',{cookie:secondBrowser.cookie})).status,200);
  const missing=await call('auth/login',{method:'POST',body:{username:'reader_missing',password}});
  const wrong=await call('auth/login',{method:'POST',body:{username:'reader_1',password:'not this password'}});
  assert.deepEqual([missing.status,missing.data.error],[wrong.status,wrong.data.error]);
});
