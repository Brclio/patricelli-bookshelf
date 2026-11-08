(function () {
  const authEvent = 'patricelli.account-changed.v1';
  const labels = {
    invalid_username: '用户名需为 3–32 个字符，可用中英文字母、数字、下划线或短横线。',
    invalid_password: '密码需要 10–128 个字符。',
    username_unavailable: '这个用户名已经被注册，请换一个用户名或登录。',
    invalid_credentials: '用户名或密码不正确，请重新输入。',
    rate_limited: '尝试次数较多，请稍后再试。',
    legacy_unavailable: '原 Sites 记录已被导入或当前无法导入，请重新查看账号。',
    sign_in_required: '当前登录已失效，请重新登录。',
    cross_origin: '请在书架网页内重新提交。',
    storage_unavailable: '暂时无法连接账号服务，请稍后重试。'
  };
  window.createBookshelfAccount = function (purchases) {
    const dialog = document.querySelector('#accountDialog');
    const form = document.querySelector('#accountForm');
    const accountOpen = document.querySelector('#accountOpen');
    const tabs = document.querySelector('#accountTabs');
    const profile = document.querySelector('#accountProfile');
    const title = document.querySelector('#accountTitle');
    const desc = document.querySelector('#accountDesc');
    const name = document.querySelector('#accountName');
    const password = document.querySelector('#accountPassword');
    const submit = document.querySelector('#accountSubmit');
    const importCheck = document.querySelector('#importCheck');
    const importButton = document.querySelector('#accountImport');
    const logoutButton = document.querySelector('#accountLogout');
    const message = document.querySelector('#accountMessage');
    let session = null;
    let mode = 'login';
    let loadingSession = false;
    let submitting = false;
    let revision = 0;

    function identity(data) {
      return data ? data.mode + '/' + (data.user?.username || '') : '';
    }
    async function call(path, payload) {
      const options = {credentials:'same-origin', cache:'no-store', redirect:'error', signal:AbortSignal.timeout(20000)};
      if (payload !== undefined) {
        options.method = 'POST';
        options.headers = {'Content-Type':'application/json'};
        options.body = JSON.stringify(payload);
      }
      const response = await fetch('/api/auth/' + path, options);
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(labels[data.error] || '暂时无法完成操作，请稍后重试。');
        error.code = data.error;
        throw error;
      }
      if (!['guest','sites','account'].includes(data.mode) ||
          (data.mode === 'account' && typeof data.user?.username !== 'string')) throw new Error('无法读取账号状态，请重试。');
      return data;
    }
    function paint() {
      const signedIn = session?.mode === 'account';
      const register = mode === 'register';
      const canImport = Boolean(session?.canImportSites);
      accountOpen.textContent = signedIn ? session.user.username : session?.mode === 'sites' ? 'Sites 账号' : '登录 / 注册';
      accountOpen.setAttribute('aria-label', signedIn ? '书架账号 ' + session.user.username : accountOpen.textContent);
      title.textContent = signedIn ? '我的账号' : register ? '注册书架账号' : '登录书架账号';
      desc.textContent = signedIn ? '购买记录保存在这个账号里，可在其他设备登录查看。' :
        session?.mode === 'sites' ? '当前使用 Sites 身份。你也可以用用户名和密码登录自己的书架。' :
        '登录后，可在不同设备查看和标记购买记录。';
      profile.hidden = !signedIn;
      tabs.hidden = signedIn;
      form.hidden = signedIn;
      document.querySelector('#accountWho').textContent = signedIn ? session.user.username : '';
      document.querySelector('#nameHint').hidden = !register;
      document.querySelector('#passwordHint').hidden = !register;
      password.autocomplete = register ? 'new-password' : 'current-password';
      form.action = '/api/auth/' + (register ? 'register' : 'login');
      for (const button of tabs.querySelectorAll('button')) {
        button.disabled = submitting;
        button.setAttribute('aria-pressed', String(button.dataset.accountMode === mode));
      }
      const choice = !signedIn && register && canImport;
      document.querySelector('#importChoice').hidden = !choice;
      if (!choice) importCheck.checked = false;
      document.querySelector('#importText').textContent = '将原 Sites 书架的 ' + (session?.legacyCount || 0) + ' 条购买记录导入新账号';
      const note = document.querySelector('#accountImportNote');
      note.hidden = !signedIn || !canImport;
      note.textContent = canImport ? '原 Sites 书架有 ' + session.legacyCount + ' 条购买记录可导入当前账号。' : '';
      importButton.hidden = !signedIn || !canImport;
      name.disabled = password.disabled = importCheck.disabled = submit.disabled = submitting;
      importButton.disabled = logoutButton.disabled = submitting;
      submit.textContent = submitting ? '正在提交…' : register ? '注册' : '登录';
    }
    function explain(error) {
      return error?.code ? error.message : '连接账号服务失败，请稍后重试。';
    }
    async function refresh({changed=false}={}) {
      if (submitting || (loadingSession && !changed)) return;
      const ticket = ++revision;
      loadingSession = true;
      if (changed) {
        purchases.suspend();
        session = null;
        password.value = '';
        name.value = '';
        importCheck.checked = false;
        message.textContent = '';
        paint();
      }
      try {
        const next = await call('session');
        if (ticket !== revision) return;
        const wasDifferent = session && identity(next) !== identity(session);
        if (wasDifferent) purchases.suspend();
        session = next;
        paint();
        if (changed || wasDifferent) purchases.resume();
      } catch (error) {
        if (ticket !== revision) return;
        if (changed) purchases.resume();
        if (!session && dialog.open) message.textContent = explain(error);
      } finally {
        if (ticket === revision) loadingSession = false;
      }
    }
    function open(preferredMode='login') {
      if (dialog.open) return;
      mode = preferredMode;
      password.value = '';
      importCheck.checked = false;
      message.textContent = '';
      paint();
      dialog.showModal();
      if (session?.mode === 'account') document.querySelector('#accountClose').focus();
      else name.focus();
      refresh();
    }
    async function perform(path, body) {
      if (submitting) return;
      submitting = true;
      ++revision;
      loadingSession = false;
      message.textContent = '';
      paint();
      try {
        if (session?.mode === 'sites' && purchases.state().pending.size) {
          message.textContent = '正在同步原 Sites 购买记录…';
          if (!await purchases.flushPending()) {
            message.textContent = '原 Sites 购买记录还有改动待同步。请联网后重试。';
            return;
          }
        }
        purchases.suspend();
        const next = await call(path,body);
        session = next;
        message.textContent = '';
        password.value = '';
        importCheck.checked = false;
        if (path === 'logout') {
          name.value = '';
          mode = 'login';
        } else if (path === 'import-sites') {
          message.textContent = '原购买记录已导入。';
        }
        try { localStorage.setItem(authEvent, crypto.randomUUID()); } catch { /* focus also refreshes the session */ }
        if (path !== 'import-sites' && !(path === 'login' && next.canImportSites)) dialog.close();
      } catch (error) {
        message.textContent = explain(error);
        // A lost response may have changed the cookie before the connection broke.
        try { session = await call('session'); } catch { session = null; }
      } finally {
        submitting = false;
        paint();
        purchases.resume();
      }
    }
    function start() {
      accountOpen.addEventListener('click', () => open());
      document.querySelector('#accountClose').addEventListener('click', () => {
        if (!submitting) dialog.close();
      });
      dialog.addEventListener('cancel', event => { if (submitting) event.preventDefault(); });
      dialog.addEventListener('close', () => {
        password.value = '';
        importCheck.checked = false;
        message.textContent = '';
      });
      tabs.addEventListener('click', event => {
        const button = event.target.closest('[data-account-mode]');
        if (!button || submitting || button.dataset.accountMode === mode) return;
        mode = button.dataset.accountMode;
        password.value = '';
        message.textContent = '';
        paint();
        name.focus();
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (submitting) return;
        const username = name.value.normalize('NFKC').trim();
        const secret = password.value;
        if (mode === 'register') {
          if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(username)) {
            message.textContent = labels.invalid_username; name.focus(); return;
          }
          if (Array.from(secret).length < 10 || Array.from(secret).length > 128) {
            message.textContent = labels.invalid_password; password.focus(); return;
          }
        }
        const payload = {username,password:secret};
        if (mode === 'register') payload.importSites = Boolean(session?.canImportSites && importCheck.checked);
        perform(mode,payload);
      });
      logoutButton.addEventListener('click', () => perform('logout',{}));
      importButton.addEventListener('click', () => perform('import-sites',{}));
      window.addEventListener('storage', event => {
        if (event.key === authEvent || event.key === null) refresh({changed:true});
      });
      window.addEventListener('focus', () => refresh());
      window.addEventListener('pageshow', event => { if (event.persisted) refresh({changed:true}); });
      // A hidden tab may return after another device's session has expired.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
      paint();
      refresh();
    }
    return {start, open};
  };
}());
