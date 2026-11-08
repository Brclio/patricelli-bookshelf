(() => {
  const books = JSON.parse(document.querySelector('#bookdata').textContent);
  const byId = new Map(books.map(book => [book.isbn, book]));
  const cards = [...document.querySelectorAll('.book')];
  const variants = new Map(books.flatMap(book => book.variants.map(edition => [edition.key, {edition,book}])));
  const hasOwned = book => book.variants.some(v => owned.has(v.key));
  const purchases = window.createPurchaseShelf(new Set(variants.keys()), refreshPurchases);
  let {marked: owned, pending, usable, phase, storageAvailable} = purchases.state();
  function refreshPurchases(state) {
    ({marked: owned, pending, usable, phase, storageAvailable} = state);
    applyFilters();
  }
  function syncMessage() {
    if (phase === 'login') return '请登录后查看和保存账号的购买记录。';
    if (!usable) return phase === 'loading' ? '正在读取账号的购买记录…' : '暂时无法读取购买记录，请检查网络后重试。';
    if (pending.size) {
      if (!storageAvailable) return pending.size + ' 个版本待同步，请保持本页打开。';
      return pending.size + ' 个版本待同步。' + (phase === 'offline' ? '网络恢复后将自动重试。' : '正在保存到账号…');
    }
    return phase === 'offline' ? '连接暂时中断，正在显示上次读取的记录。' : '购买记录已与账号同步。';
  }
  const search = document.querySelector('#search');
  const group = document.querySelector('#group');
  const detail = document.querySelector('#detail');
  let filter = 'all';
  
  const norm = text => text.normalize('NFKC').toLowerCase().replace(/[\s.,!！?？:，、。\-–—]/g, '');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function applyFilters() {
    const term = norm(search.value);
    let count = 0;
    for (const card of cards) {
      const book = byId.get(card.dataset.isbn);
      const matches = (!group.value || book.group === group.value) &&
        (filter === 'all' || (filter === 'sizes' && book.multiSize) || (filter === 'tower' && book.tower) || (filter === 'more' && book.group === '一根毛宝宝' && !book.tower) || (filter === 'owned' && usable && hasOwned(book)) || (filter === 'unowned' && usable && book.variants.some(v => !owned.has(v.key)))) &&
        (!term || [book.title, book.cn, book.isbn, book.alias, book.about, book.summary, book.author, book.artist, book.series,...book.variants.flatMap(v => [v.isbn,v.size,v.label])].some(value => norm(value).includes(term)));
      card.hidden = !matches;
      if (matches) count++;
    }
    document.querySelector('#count').textContent = count + ' 本';
    document.querySelector('#empty').hidden = count > 0;
    const nOwned = [...variants.keys()].filter(key => owned.has(key)).length;
    document.querySelector('#ownedcount').textContent = usable ? nOwned : '…';
    document.querySelector('#unownedcount').textContent = usable ? variants.size - nOwned : '…';
    document.querySelector('#syncnote').textContent = syncMessage();
    document.querySelector('#syncagain').hidden = phase !== 'offline' && phase !== 'login';
    const dialogSync = document.querySelector('#dialogsync');
    if (dialogSync) dialogSync.textContent = syncMessage();
    document.querySelectorAll('[data-variants]').forEach(button => {
      const book = byId.get(button.dataset.variants);
      const n = book.variants.filter(v => owned.has(v.key)).length;
      button.textContent = !usable ? '摘要与版本 ↗' : n ? '已购买 ' + n + '/' + book.variants.length + ' 版' : '未购买 · ' + book.variants.length + ' 版 ↗';
    });
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    document.querySelectorAll('[data-owned]').forEach(button => {
      const {book,edition} = variants.get(button.dataset.owned);
      const marked = owned.has(edition.key);
      button.disabled = !usable;
      button.textContent = !usable ? '购买记录未载入' : (marked ? '✓ 已购买' : '＋ 未购买') + (pending.has(edition.key) ? ' · 待同步' : '');
      button.setAttribute('aria-label', (marked ? '设为未购买 ' : '设为已购买 ') + book.title + ' ' + edition.label);
      button.setAttribute('aria-pressed', String(marked));
    });
    const boxButton = document.querySelector('#markTower');
    if (boxButton) {
      const all = books.filter(b => b.tower).every(b => owned.has(b.isbn+'-9780763650100'));
      boxButton.disabled = !usable;
      boxButton.textContent = !usable ? '购买记录未载入' : all ? '✓ 四本迷你版已购' : '标记四本迷你版已购';
      boxButton.setAttribute('aria-pressed',String(all));
    }
  }
  function toggleOwned(id) {
    purchases.edit([{key:id, purchased:!owned.has(id)}]);
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
    const editionRows = b.variants.map(v => '<div class="editionrow">' +
      (v.cover ? '<img class="versionimg" src="covers/' + v.cover + '.jpg" alt="' + escape(v.pack || (b.title + ' ' + v.label)) + ' 封面">' : '') +
      '<div><strong>' + escape(v.label) + '</strong><p class="edsize">' + escape(v.size) + '</p>' +
      (v.pack ? '<p class="meta">随 ' + escape(v.pack) + ' 收录</p>' : '') +
      info(v.isbn, v.scope) + '<div class="edactions"><button class="secondary" data-owned="' + v.key + '" type="button"></button><a target="_blank" rel="noopener" href="' + escape(v.link) + '">英文版资料 ↗</a>' +
      (v.ref && v.ref !== v.link ? '<a target="_blank" rel="noopener" href="' + escape(v.ref) + '">尺寸出处 ↗</a>' : '') + '</div></div></div>').join('');
    show(art(id, b.title) + '<div class="description"><div class="kicker">' + escape(b.group + ' · ' + b.edition) + '</div><h2 id="dialogtitle">' + escape(b.title) +
      '</h2><div class="zh">' + escape(b.cn) + '</div><h3 class="edhead">内容摘要</h3><p class="synopsis">' + escape(b.summary) + '</p><p class="meta">' + escape(credit) + '　<a target="_blank" rel="noopener" href="' + escape(b.summarySource) + '">内容出处 ↗</a></p>' +
      (b.tower ? '<p class="meta">照片里的四册书塔收录了迷你版。</p>' : '') + note + '<h3 class="edhead">英文购买版本</h3>' + editionRows + '<p id="dialogsync" role="status" class="meta"></p><p id="dialogstatus" role="status" class="meta"></p></div>');
  }
  function showTower() {
    show(art('9780763650100', 'Baby’s Book Tower') + '<div class="description"><div class="kicker">FOUR MINI BOARD BOOKS</div><h2 id="dialogtitle">Baby’s Book Tower</h2><div class="zh">照片里的四册迷你书塔</div><p>盒内每本约 <b>6 × 6 cm</b>。同样四个故事也有约 <b>17.8 × 17.8 cm</b> 的常规英文单行本，各自有独立 ISBN。</p><p class="tower-contents">' +
      books.filter(b => b.tower).map(b => '<button class="titlechip" data-open="'+b.isbn+'">'+escape(b.title)+'</button>').join(' ') + '</p>' + info('9780763650100', '四册迷你版的整盒 ISBN') +
      '<div class="dialogactions"><button class="action" id="markTower" type="button"></button><button class="secondary" id="filtertower" type="button">查看这四部作品 ↓</button></div><p class="meta"><a href="https://www.mackids.com.tw/product/detail/1907" target="_blank" rel="noopener">迷你单册尺寸 ↗</a>　<a href="https://www.walkerbooks.com.au/book/9780763650100/" target="_blank" rel="noopener">书塔出版信息 ↗</a></p><p id="dialogsync" role="status" class="meta"></p><p id="dialogstatus" role="status" class="meta"></p></div>');
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
    else if (button.hasAttribute('data-variants')) showBook(button.dataset.variants);
    else if (button.id === 'markTower') {
      const ids = books.filter(b => b.tower).map(b => b.isbn + '-9780763650100');
      const marked = ids.every(key => owned.has(key));
      purchases.edit(ids.map(key => ({key, purchased:!marked})));
    }
    else if (button.id === 'syncagain') purchases.sync();
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
  group.addEventListener('change', () => { if (filter !== 'owned' && filter !== 'unowned') filter = 'all'; applyFilters(); });
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
      '</div><p class="setfoot"><img src="covers/' + next.isbn + '.jpg" alt="' + escape(next.title) + ' 套装外观"><span><b>想比较的这套 · 单册尺寸</b>　' + escape(next.singleSize) + '<br><b>整套包装尺寸</b>　' + escape(next.packageSize) + '<br><a href="' + escape(next.link) + '" target="_blank" rel="noopener">查这套组合 ↗</a>　套装 ISBN ' + next.isbn + '</span></p>';
  }
  baseSelect.addEventListener('change',compare);
  nextSelect.addEventListener('change',compare);
  compare();
  applyFilters();
  purchases.start();
})();
