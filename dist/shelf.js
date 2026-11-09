(() => {
  const books = JSON.parse(document.querySelector('#bookdata').textContent);
  const byId = new Map(books.map(book => [book.isbn, book]));
  const cards = [...document.querySelectorAll('.book')];
  const variants = new Map(books.flatMap(book => book.variants.map(edition => [edition.key, {edition,book}])));
  const purchases = window.createPurchaseShelf(new Set(variants.keys()), refreshPurchases);
  const account = window.createBookshelfAccount(purchases);
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
  const miniRows = [...document.querySelectorAll('.mini-item')];
  const miniSearch = document.querySelector('#mini-search');
  const miniPack = document.querySelector('#mini-pack');
  let miniFilter = 'all';
  function updatePurchaseBadge(card, purchased, total) {
    const badge = card.querySelector('.purchase-badge');
    let state = 'unknown';
    let label = '';
    if (usable) {
      if (!purchased) {
        state = 'unowned';
        label = '未购买';
      } else if (purchased < total) {
        state = 'partial';
        label = '部分已购 ' + purchased + '/' + total;
      } else {
        state = 'owned';
        label = total === 1 ? '✓ 已购买' : '✓ 全部已购 ' + total + '/' + total;
      }
    }
    card.dataset.purchaseState = state;
    badge.textContent = label;
    badge.hidden = !usable;
  }
  function updateMini() {
    const term = norm(miniSearch.value);
    let visible = 0, acquired = 0, scope = 0;
    for (const row of miniRows) {
      const {book,edition} = variants.get(row.dataset.editionKey);
      const marked = usable && owned.has(edition.key);
      updatePurchaseBadge(row, marked ? 1 : 0, 1);
      if (miniPack.value !== 'all' && edition.isbn !== miniPack.value) { row.hidden = true; continue; }
      scope++;
      if (marked) acquired++;
      const matches = (miniFilter === 'all' || (usable && marked === (miniFilter === 'owned'))) &&
        (!term || [book.title, book.cn, book.alias, edition.label, edition.size, edition.pack, edition.isbn, row.querySelector('.minitag span').textContent]
              .some(value => norm(value || '').includes(term)));
      row.hidden = !matches;
      if (matches) visible++;
    }
    document.querySelector('#mini-count').textContent = '显示 ' + visible + ' 册' +
      (usable ? '　·　所选开本：已购 ' + acquired + ' / ' + scope + ' 册' : '');
    document.querySelector('#mini-empty').hidden = !!visible;
    document.querySelectorAll('[data-mini-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.miniFilter === miniFilter)));
    document.querySelectorAll('[data-mini-pack]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.miniPack === miniPack.value)));
    document.querySelector('#mini-sync').textContent = syncMessage();
    document.querySelector('[data-mini-retry]').hidden = phase !== 'offline';
  }
  
  const norm = text => text.normalize('NFKC').toLowerCase().replace(/[\s.,!！?？:，、。\-–—]/g, '');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function applyFilters() {
    updateMini();
    const term = norm(search.value);
    const purchaseFilter = filter === 'owned' || filter === 'unowned';
    let count = 0;
    let matchingEditions = 0;
    for (const card of cards) {
      const book = byId.get(card.dataset.isbn);
      const candidateEditions = purchaseFilter
        ? book.variants.filter(v => usable && owned.has(v.key) === (filter === 'owned'))
        : book.variants;
      const matchesWorkText = !term || [book.title, book.cn, book.alias, book.about, book.summary, book.author, book.artist, book.series]
        .some(value => norm(value).includes(term));
      const matching = matchesWorkText ? candidateEditions : candidateEditions.filter(v =>
        [v.isbn, v.size, v.label, v.pack || ''].some(value => norm(value).includes(term)));
      const matches = matching.length > 0 && (!group.value || book.group === group.value) &&
        (filter === 'all' || purchaseFilter || (filter === 'sizes' && book.multiSize) || (filter === 'tower' && book.tower) ||
        (filter === 'more' && book.group === '一根毛宝宝' && !book.tower));
      const purchased = book.variants.filter(v => owned.has(v.key)).length;
      updatePurchaseBadge(card, purchased, book.variants.length);
      for (const row of card.querySelectorAll('[data-size-edition]')) {
        const key = row.dataset.sizeEdition;
        row.hidden = purchaseFilter && !matching.some(v => v.key === key);
        row.dataset.marked = String(usable && owned.has(key));
        row.querySelector('.purchase-choice').hidden = !usable;
        const login = row.querySelector('[data-quick-login]');
        login.hidden = usable;
        login.disabled = phase !== 'login';
        login.textContent = phase === 'login' ? '登录后标记' : phase === 'loading' ? '正在读取…' : '购买记录未载入';
        row.querySelector('.quick-pending').hidden = !usable || !pending.has(key);
      }
      card.hidden = !matches;
      if (matches) { count++; matchingEditions += matching.length; }
    }
    document.querySelector('#count').textContent = purchaseFilter ?
      count + ' 部作品 · ' + matchingEditions + ' 个版本' : count + ' 本';
    document.querySelector('#empty').hidden = count > 0;
    const nOwned = [...variants.keys()].filter(key => owned.has(key)).length;
    document.querySelector('#ownedcount').textContent = usable ? nOwned : '…';
    document.querySelector('#unownedcount').textContent = usable ? variants.size - nOwned : '…';
    document.querySelector('#syncnote').textContent = syncMessage();
    document.querySelector('#syncagain').hidden = phase !== 'offline';
    document.querySelector('[data-account-login]').hidden = phase !== 'login';
    const dialogSync = document.querySelector('#dialogsync');
    if (dialogSync) dialogSync.textContent = syncMessage();
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    document.querySelectorAll('[data-owned]').forEach(button => {
      const {book,edition} = variants.get(button.dataset.owned);
      const marked = owned.has(edition.key);
      if (button.hasAttribute('data-purchase-value')) {
        const target = button.dataset.purchaseValue === 'true';
        button.disabled = !usable;
        button.setAttribute('aria-pressed', String(usable && marked === target));
        button.setAttribute('aria-label', book.title + '，' + edition.label + '，' + (target ? '已购买' : '未购买'));
        return;
      }
      button.disabled = !usable && phase !== 'login';
      button.textContent = !usable ? (phase === 'login' ? '登录后标记' : '购买记录未载入') : (marked ? '✓ 已购买' : '未购买 · 标记购买') + (pending.has(edition.key) ? ' · 待同步' : '');
      button.setAttribute('aria-label', (phase === 'login' ? '登录后标记 ' : marked ? '设为未购买 ' : '设为已购买 ') + book.title + ' ' + edition.label);
      button.setAttribute('aria-pressed', String(marked));
    });
    const boxButton = document.querySelector('#markTower');
    if (boxButton) {
      const all = books.filter(b => b.tower).every(b => owned.has(b.isbn+'-9780763650100'));
      boxButton.disabled = !usable && phase !== 'login';
      boxButton.textContent = !usable ? (phase === 'login' ? '登录后标记四本迷你版' : '购买记录未载入') : all ? '✓ 四本迷你版已购' : '标记四本迷你版已购';
      boxButton.setAttribute('aria-pressed',String(all));
    }
  }
  function toggleOwned(id) {
    if (phase === 'login') { account.open(); return; }
    purchases.edit([{key:id, purchased:!owned.has(id)}]);
  }
  const art = (isbn, title) => '<div class="detailart"><img src="covers/' + isbn + '.jpg" alt="' + escape(title) + ' 英文版封面"></div>';
  const info = (isbn, label) => '<div class="identifier"><div><small>' + label + '</small><b>' + isbn + '</b></div><button class="copy" data-copy="' + isbn + '" type="button">复制 ISBN</button></div>';
  const retail = JSON.parse(document.querySelector('#retaildata').textContent);
  function purchaseLinks(isbn) {
    const shops = retail.products[isbn] || [];
    const chosen = new Set();
    const anchor = (url, label, note) => '<a class="shoplink" href="' + escape(url) +
      '" target="_blank" rel="noopener noreferrer"><span>' + escape(label) +
      ' ↗</span>' + (note ? '<small>' + escape(note) + '</small>' : '') + '</a>';
    const top = retail.priority.map(platform => {
      const direct = shops.find(shop => shop.channel === platform.channel);
      if (direct) {
        chosen.add(direct);
        return anchor(direct.url, direct.platform, direct.stock || '商品页');
      }
      return anchor(platform.search.replace('{isbn}',isbn), platform.label, '按 ISBN 搜索');
    }).join('');
    const others = shops.filter(shop => !chosen.has(shop));
    const extra = others.map(shop => anchor(shop.url,shop.platform,shop.stock || '商品页')).join('');
    const additional = extra ? '<details class="shopmore"><summary>其他书店 · ' + others.length +
      '</summary><div class="shopgrid">' + extra + '</div></details>' : '';
    return '<section class="buyarea" aria-label="ISBN ' + isbn + ' 的购买链接"><h4>购买链接</h4><div class="shopgrid">' +
      top + '</div>' + additional + '</section>';
  }
  function show(content) {
    document.querySelector('#inside').innerHTML = '<div class="dialoglayout">' + content + '</div>';
    if (!detail.open) detail.showModal();
    document.querySelector('#inside').scrollTop = 0;
    document.querySelector('#close').focus({preventScroll:true});
    document.body.style.overflow = 'hidden';
    applyFilters();
  }
  function editionDimensions(edition) {
    const known = edition.size !== '待核实';
    const source = (url, label) => '<a href="' + escape(url) + '" target="_blank" rel="noopener">' + label + ' ↗</a>';
    const copy = '<p class="edsize"><span>单册尺寸（宽 × 高）</span> <b>' + escape(edition.size) + '</b>' +
      (known && edition.ref ? ' ' + source(edition.ref, edition.sizeBasis || '尺寸出处') : '') + '</p>';
    const outer = edition.packageSize ? '<p class="meta outer-size">外盒（宽 × 高 × 厚） ' +
      escape(edition.packageSize) + ' ' + source(edition.packageRef, '外盒出处') + '</p>' : '';
    const note = edition.sizeNote ? '<p class="meta">' + escape(edition.sizeNote) + '</p>' : '';
    return copy + outer + note;
  }
  function showBook(id) {
    const b = byId.get(id);
    const note = b.alias ? '<p class="meta">英国版同一本也叫 <b>' + escape(b.alias) + '</b></p>' : '';
    const credit = b.author === b.artist ? '著绘 · ' + b.author : (b.artist ? '文字 · ' + b.author + '　插画 · ' + b.artist : '共同创作 · ' + b.author);
    const editionRows = b.variants.map(v => '<div class="editionrow">' +
      (v.cover ? '<img class="versionimg" src="covers/' + v.cover + '.jpg" alt="' + escape(v.pack || (b.title + ' ' + v.label)) + ' 封面">' : '') +
      '<div><strong>' + escape(v.label) + '</strong>' + editionDimensions(v) +
      (v.pack ? '<p class="meta">随 ' + escape(v.pack) + ' 收录</p>' : '') +
      info(v.isbn, v.scope) + '<div class="edactions"><button class="secondary" data-owned="' + v.key + '" type="button"></button><a target="_blank" rel="noopener" href="' + escape(v.link) + '">英文版资料 ↗</a>' +
      '</div>' + purchaseLinks(v.isbn) + '</div></div>').join('');
    show(art(id, b.title) + '<div class="description"><div class="kicker">' + escape(b.group + ' · ' + b.edition) + '</div><h2 id="dialogtitle">' + escape(b.title) +
      '</h2><div class="zh">' + escape(b.cn) + '</div><h3 class="edhead">内容摘要</h3><p class="synopsis">' + escape(b.summary) + '</p><p class="meta">' + escape(credit) + '　<a target="_blank" rel="noopener" href="' + escape(b.summarySource) + '">内容出处 ↗</a></p>' +
      (b.tower ? '<p class="meta">照片里的四册书塔收录了迷你版。</p>' : '') + note + '<h3 class="edhead">英文购买版本</h3>' + editionRows + '<p id="dialogsync" role="status" class="meta"></p><p id="dialogstatus" role="status" class="meta"></p></div>');
  }
  function showMini(key) {
    const {book:b, edition:v} = variants.get(key);
    const same = b.variants.find(other => other.pack && other.key !== key);
    const fromTower = b.tower && v.isbn === '9780763650100';
    const splitTerms = ('Leslie Patricelli ' + b.title + ' ' + (fromTower ? "Baby's Book Tower 6cm" : "Little Library") + ' 英文 拆售');
    const splitUrl = 'https://s.taobao.com/search?q=' + encodeURIComponent(splitTerms);
    const detailArt = '<div class="detailart miniart"><img src="covers/' + b.isbn + '.jpg" alt="' + escape(b.title) +
      ' 常规英文版封面参考"><small>同名常规版封面参考</small></div>';
    show(detailArt + '<div class="description"><p class="kicker">' + escape(v.label) + '</p><h2 id="dialogtitle">' + escape(b.title) +
      '</h2><div class="zh">' + escape(b.cn) + '</div>' + editionDimensions(v) +
      '<div class="edactions"><button class="secondary" type="button" data-owned="' + key + '"></button></div>' +
      (same ? '<p class="meta">另有同名小本：<button type="button" class="minilink" data-mini-open="' + same.key + '">' + escape(same.label) + ' ↗</button>，购买状态分别记录。</p>' : '') +
      '<p id="dialogsync" class="meta" role="status"></p><h3 class="edhead">内容摘要</h3><p class="synopsis">' + escape(b.summary) + '</p>' +
      '<p class="meta"><a href="' + escape(b.summarySource) + '" target="_blank" rel="noopener">内容出处 ↗</a></p>' +
      '<h3 class="edhead">想买这一册</h3><p class="meta">此开本尚未查到单册独立 ISBN。找拆售时，请让卖家确认书名、尺寸和英文内页。</p>' +
      '<a class="minilink" target="_blank" rel="noopener noreferrer" href="' + escape(splitUrl) + '">淘宝搜这册拆售 ↗</a>' +
      '<h3 class="edhead">购买整套</h3><div class="minipackdetail"><img src="covers/' + v.isbn + '.jpg" alt="' + escape(v.pack) +
      ' 整套封面"><div><b>' + escape(v.pack) + '</b><br><a href="' + escape(v.ref) + '" target="_blank" rel="noopener">' + (fromTower ? '查看四册实物与尺寸' : '尺寸与套装资料') + ' ↗</a></div></div>' +
      info(v.isbn, '整套 ISBN（非单册书号）') + purchaseLinks(v.isbn) +
      '<p class="meta"><button class="minilink" data-open="' + b.isbn + '" type="button">查看同一故事的常规本与其他版本 ↗</button></p><p id="dialogstatus" class="meta" role="status"></p></div>');
  }
  function showTower() {
    show(art('9780763650100', 'Baby’s Book Tower') + '<div class="description"><div class="kicker">FOUR MINI BOARD BOOKS</div><h2 id="dialogtitle">Baby’s Book Tower</h2><div class="zh">照片里的四册迷你书塔</div><p>盒内每本约 <b>6 × 6 cm</b>。同样四个故事也有约 <b>17.8 × 17.8 cm</b> 的常规英文单行本，各自有独立 ISBN。</p><p class="tower-contents">' +
      books.filter(b => b.tower).map(b => {
        const edition = b.variants.find(v => v.isbn === '9780763650100');
        return '<button class="titlechip set-title" data-mini-open="' + edition.key + '">' +
          escape(b.title) + '<small>单册（宽 × 高） ' + escape(edition.size) + '</small></button>';
      }).join(' ') + '</p>' + info('9780763650100', '四册迷你版的整盒 ISBN') +
      purchaseLinks('9780763650100') + '<div class="dialogactions"><button class="action" id="markTower" type="button"></button><button class="secondary" id="filtertower" type="button">逐册整理这四本 ↓</button></div><p class="meta"><a href="https://www.mackids.com.tw/product/detail/1907" target="_blank" rel="noopener">迷你单册尺寸 ↗</a>　<a href="https://www.walkerbooks.com.au/book/9780763650100/" target="_blank" rel="noopener">书塔出版信息 ↗</a></p><p id="dialogsync" role="status" class="meta"></p><p id="dialogstatus" role="status" class="meta"></p></div>');
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
    if (button.hasAttribute('data-filter')) {
      if (phase === 'login' && ['owned','unowned'].includes(button.dataset.filter)) account.open();
      else { filter = button.dataset.filter; group.value = ''; applyFilters(); }
    }
    else if (button.hasAttribute('data-mini-filter')) {
      if (!usable && phase === 'login' && button.dataset.miniFilter !== 'all') { account.open(); return; }
      miniFilter = button.dataset.miniFilter; updateMini();
    }
    else if (button.hasAttribute('data-mini-pack')) {
      miniPack.value = miniPack.value === button.dataset.miniPack ? 'all' : button.dataset.miniPack;
      updateMini();
    }
    else if (button.hasAttribute('data-mini-open')) showMini(button.dataset.miniOpen);
    else if (button.hasAttribute('data-mini-reset')) {
      miniFilter = 'all'; miniPack.value = 'all'; miniSearch.value = ''; updateMini();
    }
    else if (button.hasAttribute('data-mini-retry')) purchases.sync();
    else if (button.hasAttribute('data-account-login') || button.hasAttribute('data-quick-login')) account.open();
    else if (button.hasAttribute('data-tower')) showTower();
    else if (button.hasAttribute('data-open')) showBook(button.dataset.open);
    else if (button.hasAttribute('data-variants')) showBook(button.dataset.variants);
    else if (button.id === 'markTower') {
      if (phase === 'login') { account.open(); return; }
      const ids = books.filter(b => b.tower).map(b => b.isbn + '-9780763650100');
      const marked = ids.every(key => owned.has(key));
      purchases.edit(ids.map(key => ({key, purchased:!marked})));
    }
    else if (button.id === 'syncagain') purchases.sync();
    else if (button.hasAttribute('data-purchase-value')) {
      const key = button.dataset.owned;
      const purchased = button.dataset.purchaseValue === 'true';
      if (usable && owned.has(key) !== purchased) purchases.edit([{key, purchased}]);
    }
    else if (button.hasAttribute('data-owned')) toggleOwned(button.dataset.owned);
    else if (button.hasAttribute('data-copy')) copyIsbn(button);
    else if (button.id === 'filtertower') {
      detail.close(); miniPack.value = '9780763650100'; miniSearch.value = ''; miniFilter = 'all'; updateMini(); location.hash = 'mini';
    } else if (button.id === 'reset') { filter = 'all'; search.value = ''; group.value = ''; applyFilters(); }
    else if (button.id === 'close') detail.close();
  });
  detail.addEventListener('close', () => { document.body.style.overflow = ''; });
  detail.addEventListener('click', e => { if (e.target === detail && !e.target.closest('#inside')) {
    const rect = detail.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) detail.close();
  }});
  miniSearch.addEventListener('input', updateMini);
  miniPack.addEventListener('change', updateMini);
  function syncNavigation() {
    const active = location.hash === '#mini';
    document.querySelector('.mininav').toggleAttribute('aria-current', active);
    if (active) document.querySelector('.mininav').setAttribute('aria-current', 'page');
    document.title = active ? '迷你本逐册清单 · Patricelli Bookshelf' : 'Leslie Patricelli 的英文书架 · 英文作品目录';
  }
  window.addEventListener('hashchange', syncNavigation);
  syncNavigation();
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
      const edition = book.variants.find(v => v.isbn === next.isbn);
      const packRecord = next.copySizes?.[title];
      const size = edition?.size || packRecord?.size || '待核实';
      const target = edition ? 'data-mini-open="' + edition.key + '"' : 'data-open="' + book.isbn + '"';
      const source = packRecord ? ' <a class="set-size-source" href="' + escape(packRecord.ref) +
        '" target="_blank" rel="noopener" aria-label="' + escape(title) + ' 的尺寸出处">出处 ↗</a>' : '';
      const difference = packRecord?.note ? '<small class="set-size-note"><a href="' + escape(packRecord.otherRef) +
        '" target="_blank" rel="noopener">' + escape(packRecord.note) + ' ↗</a></small>' : '';
      return '<span class="set-title-row"><button class="titlechip set-title" type="button" ' + target + '>' +
        escape(title) + '<small>单册（宽 × 高） ' + escape(size) + '</small></button>' + source + difference + '</span>';
    }).join('');
    document.querySelector('#comparison').innerHTML = '<div><h3>重复 · ' + common.length + ' 本</h3>' + (titles(common) || '两套没有重复的书。') +
      '</div><div><h3>新增 · ' + fresh.length + ' 本</h3>' + (titles(fresh) || '已有套装包含这些书。') +
      '</div><p class="setfoot"><img src="covers/' + next.isbn + '.jpg" alt="' + escape(next.title) + ' 套装外观"><span><b>想比较的这套 · 单册尺寸</b>　' + escape(next.singleSize) + '<br><b>整套包装尺寸</b>　' + escape(next.packageSize) + '<br><a href="' + escape(next.link) + '" target="_blank" rel="noopener">查这套组合 ↗</a>　套装 ISBN ' + next.isbn + '</span></p>' + purchaseLinks(next.isbn);
  }
  baseSelect.addEventListener('change',compare);
  nextSelect.addEventListener('change',compare);
  compare();
  applyFilters();
  account.start();
  purchases.start();
})();
