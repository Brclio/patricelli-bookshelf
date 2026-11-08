(function () {
  const legacyKey = 'baby-bookshelf.us-owned.v1';
  const prefix = 'patricelli.purchases.v2.';
  const endpoint = '/api/purchases';

  window.createPurchaseShelf = function (validKeys, render) {
    let scope = '';
    let allRemote = new Set();
    let usable = false;
    let phase = 'loading';
    let inFlight = false;
    let again = false;
    let retry = 0;
    let retryTimer;
    let storageAvailable = true;
    const sessionChanges = new Map();
    const getPrefix = () => prefix + scope + '.';

    function storage(action) {
      try { return action(localStorage); }
      catch { storageAvailable = false; return undefined; }
    }
    function entries() {
      const active = getPrefix();
      const result = new Map();
      if (!scope) return result;
      storage(s => {
        for (let i = 0; i < s.length; i++) {
          const name = s.key(i);
          if (!name || !name.startsWith(active)) continue;
          try {
            const value = JSON.parse(s.getItem(name));
            if (validKeys.has(value.key) && typeof value.purchased === 'boolean' && Number.isFinite(value.order)) {
              result.set(name, value);
            }
          } catch { /* A malformed local record cannot affect the account. */ }
        }
      });
      for (const [id, op] of sessionChanges) if (id.startsWith(active)) result.set(id, op);
      return result;
    }
    function latest(entriesById) {
      const result = new Map();
      for (const [id, op] of entriesById) {
        const prev = result.get(op.key);
        if (!prev || prev.order < op.order || (prev.order === op.order && prev.id < id)) result.set(op.key, {...op, id});
      }
      return result;
    }
    function state() {
      const marked = new Set(usable ? allRemote : []);
      const pending = latest(entries());
      for (const op of pending.values()) {
        if (op.purchased) marked.add(op.key); else marked.delete(op.key);
      }
      return {marked, pending, usable, phase, storageAvailable};
    }
    function add(key, purchased, order) {
      const id = getPrefix() + crypto.randomUUID();
      const op = {key, purchased, order};
      const saved = storage(s => { s.setItem(id, JSON.stringify(op)); return true; });
      if (!saved) sessionChanges.set(id, op);
    }
    function edit(changes) {
      if (!usable || !scope) return;
      const prev = latest(entries());
      let order = Date.now();
      for (const {key,purchased} of changes) {
        if (!validKeys.has(key) || typeof purchased !== 'boolean') continue;
        order = Math.max(order + 1, (prev.get(key)?.order || 0) + 1);
        add(key, purchased, order);
      }
      render(state());
      sync();
    }
    function importLegacy() {
      storage(s => {
        const old = s.getItem(legacyKey);
        if (!old) return;
        let list;
        try { list = JSON.parse(old); } catch { return; }
        if (!Array.isArray(list)) return;
        const pending = latest(entries());
        for (const key of new Set(list)) {
          if (validKeys.has(key) && !allRemote.has(key) && !pending.has(key)) add(key, true, Date.now());
        }
        // If storage is unavailable, keep the source for the next visit.
        if (storageAvailable) s.removeItem(legacyKey);
      });
    }
    function clearSession() {
      scope = '';
      usable = false;
      allRemote = new Set();
    }
    async function request(options) {
      const response = await fetch(endpoint, {credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.timeout(12000), ...options});
      if (!response.ok) throw Object.assign(new Error('purchase request'), {status: response.status});
      const data = await response.json();
      if (!data || typeof data.scope !== 'string' || !/^[0-9a-f]{64}$/i.test(data.scope) ||
          !Array.isArray(data.purchased) || !data.purchased.every(k => typeof k === 'string')) {
        throw new Error('invalid purchase response');
      }
      return data;
    }
    async function exchange() {
      const data = await request({method:'GET'});
      scope = data.scope;
      allRemote = new Set(data.purchased.filter(k => validKeys.has(k)));
      usable = true;
      importLegacy();
      const snapshot = entries();
      const changes = [...latest(snapshot).values()]
        .filter(({key,purchased}) => purchased !== allRemote.has(key))
        .map(({key,purchased}) => ({key,purchased}));
      if (changes.length) {
        phase = 'sending';
        render(state());
        const updated = await request({method: 'PUT',
          headers: {'Content-Type':'application/json', 'If-Match-Account':scope},
          body: JSON.stringify({changes})});
        if (updated.scope !== scope) throw Object.assign(new Error('account changed'), {status:409});
        allRemote = new Set(updated.purchased.filter(k => validKeys.has(k)));
      }
      for (const id of snapshot.keys()) {
        storage(s => s.removeItem(id));
        sessionChanges.delete(id);
      }
      // Edits made while this request ran have different IDs and remain queued.
      if (entries().size && storageAvailable) again = true;
      phase = 'ready';
      retry = 0;
    }
    async function sync() {
      if (inFlight) { again = true; return; }
      clearTimeout(retryTimer);
      inFlight = true;
      again = false;
      try {
        if (navigator.locks) await navigator.locks.request(prefix + 'sync', exchange);
        else await exchange();
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          clearSession();
          phase = 'login';
        } else if (error.status === 409 && retry === 0) {
          retry++;

          clearSession();
          phase = 'loading';
          again = true;
        } else {
          phase = 'offline';
          retry = Math.min(retry + 1, 5);
          retryTimer = setTimeout(sync, Math.min(60000, 1500 * 2 ** retry));
        }
      } finally {
        inFlight = false;
        render(state());
        if (again) queueMicrotask(sync);
      }
    }
    function start() {
      window.addEventListener('storage', e => {
        if (scope && e.key?.startsWith(getPrefix())) {
          if (e.newValue) render(state());
          sync();
        }
      });
      window.addEventListener('online',sync);
      window.addEventListener('focus',sync);
      window.addEventListener('pageshow', event => { if (event.persisted) sync(); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
      setInterval(() => { if (!document.hidden && !inFlight && phase !== 'offline') sync(); }, 20000);
      sync();
    }
    return {edit, sync, start, state};
  };
}());
