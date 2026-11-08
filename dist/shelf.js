(() => {
  const books = JSON.parse(document.querySelector('#bookdata').textContent);
  const byId = new Map(books.map(book => [book.isbn, book]));
  const cards = [...document.querySelectorAll('.book')];
  const storageKey = 'baby-bookshelf.us-owned.v1';
  const owned = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) saved.filter(id => byId.has(id)).forEach(id => owned.add(id));
  } catch { /* The shelf also works when browser storage is unavailable. */ }
  const search = document.querySelector('#search');
  const group = document.querySelector('#group');
  const detail = document.querySelector('#detail');
  let filter = 'all';
  let toastTimer;
  const norm = text => text.normalize('NFKC').toLowerCase().replace(/[\s.,!！?？:，、。\-–—]/g, '');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function notify(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.textContent = '', 2400);
  }
  function applyFilters() {
    const term = norm(search.value);
    let count = 0;
    for (const card of cards) {
      const book = byId.get(card.dataset.isbn);
      const matches = (!group.value || book.group === group.value) &&
        (filter === 'all' || (filter === 'tower' && book.tower) || (filter === 'more' && book.group === '一根毛宝宝' && !book.tower) || (filter === 'owned' && owned.has(book.isbn))) &&
        (!term || [book.title, book.cn, book.isbn, book.alias, book.about, book.author, book.artist, book.series].some(value => norm(value).includes(term)));
      card.hidden = !matches;
      if (matches) count++;
    }
    document.querySelector('#count').textContent = count + ' 本';
    document.querySelector('#empty').hidden = count > 0;
    document.querySelector('#ownedcount').textContent = owned.size;
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    document.querySelectorAll('[data-owned]').forEach(button => {
      const book = byId.get(button.dataset.owned);
      const marked = owned.has(book.isbn);
      button.textContent = marked ? '✓ 已购' : '＋ 标记已购';
      button.setAttribute('aria-label', (marked ? '取消已购 ' : '标记已购 ') + book.title);
      button.setAttribute('aria-pressed', String(marked));
    });
  }
  function toggleOwned(id) {
    if (owned.has(id)) owned.delete(id); else owned.add(id);
    let persisted = true;
    try { localStorage.setItem(storageKey, JSON.stringify([...owned])); } catch { persisted = false; }
    applyFilters();
    const message = persisted ? (owned.has(id) ? '已记入已购书目' : '已移出已购书目') : '已更新，本次浏览期间有效';
    if (detail.open) document.querySelector('#dialogstatus').textContent = message; else notify(message);
  }
  const art = (isbn, title) => '<div class="detailart"><img src="covers/' + isbn + '.jpg" alt="' + escape(title) + ' 英文版封面"></div>';
  const info = (isbn, label) => '<div class="identifier"><div><small>' + label + '</small><b>' + isbn + '</b></div><button class="copy" data-copy="' + isbn + '" type="button">复制 ISBN</button></div>';
  function show(content) {
    document.querySelector('#inside').innerHTML = '<div class="dialoglayout">' + content + '</div>';
    if (!detail.open) detail.showModal();
    document.querySelector('#close').focus({preventScroll:true});
    document.body.style.overflow = 'hidden';
    applyFilters();
  }
  function showBook(id) {
    const b = byId.get(id);
    const note = b.alias ? '<p class="meta">英国版同一本也叫 <b>' + escape(b.alias) + '</b></p>' : '';
    const credit = b.author === b.artist ? '著绘 · ' + b.author : (b.artist ? '文字 · ' + b.author + '　插画 · ' + b.artist : '共同创作 · ' + b.author);
    show(art(id, b.title) + '<div class="description"><div class="kicker">' + escape(b.group + ' · ' + b.edition) + '</div><h2 id="dialogtitle">' + escape(b.title) +
      '</h2><div class="zh">' + escape(b.cn) + '</div><p>' + escape(b.about) + '。</p><p class="meta">' + escape(credit) + '</p>' +
      (b.tower ? '<p class="meta">照片里的四册书塔已收录本书。</p>' : '') + note + info(id, '英文原版 · ' + escape(b.edition) + ' ISBN-13') +
      '<div class="dialogactions"><a class="action" target="_blank" rel="noopener" href="' + escape(b.link) + '">查看英文版 ↗</a><button class="secondary" type="button" data-owned="' + id + '"></button></div><p id="dialogstatus" role="status" class="meta"></p></div>');
  }
  function showTower() {
    show(art('9780763650100', 'Baby’s Book Tower') + '<div class="description"><div class="kicker">FOUR MINI BOARD BOOKS</div><h2 id="dialogtitle">Baby’s Book Tower</h2><div class="zh">照片里的四册迷你书塔</div><p>Leslie Patricelli 著绘，Candlewick Press 于 2010 年出版。盒中四本都可以按英文原名单独查找。</p><p class="tower-contents">' +
      books.filter(b => b.tower).map(b => escape(b.title)).join(' · ') + '</p>' + info('9780763650100', '整盒书塔 · ISBN-13') +
      '<div class="dialogactions"><button class="action" id="filtertower" type="button">看这四本 ↓</button><a class="secondary" href="https://www.walkerbooks.com.au/book/9780763650100/" target="_blank" rel="noopener">书塔出版信息 ↗</a></div><p id="dialogstatus" role="status" class="meta"></p></div>');
  }
  async function copyIsbn(button) {
    const id = button.dataset.copy;
    const status = document.querySelector('#dialogstatus');
    try {
      await navigator.clipboard.writeText(id);
      if (detail.open && status.isConnected) status.textContent = '已复制 ' + id;
    } catch {
      const range = document.createRange();
      range.selectNodeContents(button.previousElementSibling.querySelector('b'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      status.textContent = '已选中 ISBN，可手动复制。';
    }
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-filter')) { filter = button.dataset.filter; group.value = ''; applyFilters(); }
    else if (button.hasAttribute('data-tower')) showTower();
    else if (button.hasAttribute('data-open')) showBook(button.dataset.open);
    else if (button.hasAttribute('data-owned')) toggleOwned(button.dataset.owned);
    else if (button.hasAttribute('data-copy')) copyIsbn(button);
    else if (button.id === 'filtertower') {
      detail.close(); filter = 'tower'; search.value = ''; group.value = ''; applyFilters(); document.querySelector('#catalog').scrollIntoView();
    } else if (button.id === 'reset') { filter = 'all'; search.value = ''; group.value = ''; applyFilters(); }
    else if (button.id === 'close') detail.close();
  });
  detail.addEventListener('close', () => { document.body.style.overflow = ''; });
  detail.addEventListener('click', e => { if (e.target === detail && !e.target.closest('#inside')) {
    const rect = detail.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) detail.close();
  }});
  search.addEventListener('input', applyFilters);
  group.addEventListener('change', () => { if (filter !== 'owned') filter = 'all'; applyFilters(); });
  const boxes = JSON.parse(document.querySelector('#boxdata').textContent);
  const boxesById = new Map(boxes.map(box => [box.isbn, box]));
  const baseSelect = document.querySelector('#baseBox');
  const nextSelect = document.querySelector('#nextBox');
  nextSelect.selectedIndex = 2;
  function compare() {
    const first = boxesById.get(baseSelect.value);
    const next = boxesById.get(nextSelect.value);
    const common = next.books.filter(t => first.books.includes(t));
    const fresh = next.books.filter(t => !first.books.includes(t));
    const titles = list => list.map(title => {
      const book = books.find(b => b.title === title);
      return '<button class="titlechip" type="button" data-open="' + book.isbn + '">' + escape(title) + '</button>';
    }).join('');
    document.querySelector('#comparison').innerHTML = '<div><h3>重复 · ' + common.length + ' 本</h3>' + (titles(common) || '两套没有重复的书。') +
      '</div><div><h3>新增 · ' + fresh.length + ' 本</h3>' + (titles(fresh) || '已有套装包含这些书。') +
      '</div><p><a href="' + escape(next.link) + '" target="_blank" rel="noopener">查这套组合 ↗</a>　套装 ISBN ' + next.isbn + '</p>';
  }
  baseSelect.addEventListener('change',compare);
  nextSelect.addEventListener('change',compare);
  compare();
  window.addEventListener('storage', e => {
    if (e.key !== storageKey && e.key !== null) return;
    try {
      const saved = JSON.parse(e.newValue || '[]');
      if (!Array.isArray(saved)) return;
      owned.clear();
      saved.filter(id => byId.has(id)).forEach(id => owned.add(id));
      applyFilters();
    } catch { /* Ignore invalid changes from another tab. */ }
  });
  applyFilters();
})();
