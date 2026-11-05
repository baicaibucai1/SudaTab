/* ============================================================
   SudaTab · 网格画布
   ------------------------------------------------------------
   24 列 × N 行的整数网格，画布上每个东西都是一块：
     时钟 / 搜索框 / 引语 / 每一个站点图标
   站点方块的基准单位 = 2 列 × 3 行：
     1×1 → 2×3   1×2 → 2×6   2×1 → 4×3   2×2 → 4×6
   ============================================================ */

(function () {
  'use strict';

  var KEY = 'sudatab.state.v1';
  var LEGACY_KEY = 'webtab.state.v3';  /* 旧名字的数据，读一次迁过来 */

  var COLS = 24;    /* 当前列数，会随「网格密度」设置变化 */
  var GAP = 12;

  var DENSITIES = [16, 24, 32, 40];

  var UNIT_W = 2;   /* 一个方块宽 = 2 列 */
  var UNIT_H = 3;   /* 一个方块高 = 3 行（行高由列宽推导，保证正方） */

  /* 视口再矮也至少保留这么多行，多出来的部分纵向滚动 */
  var BASE_ROWS = 18;

  var ENGINES = [
    { id: 'bing',   name: 'Bing',       url: 'https://www.bing.com/search?q=' },
    { id: 'google', name: 'Google',     url: 'https://www.google.com/search?q=' },
    { id: 'baidu',  name: '百度',        url: 'https://www.baidu.com/s?wd=' },
    { id: 'ddg',    name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' }
  ];

  var BACKGROUNDS = [
    { id: 'aurora', name: '晨曦' },
    { id: 'dusk',   name: '暮色' },
    { id: 'mist',   name: '晨雾' },
    { id: 'ink',    name: '墨夜' }
  ];

  var DEFAULT_LINKS = [
    { title: '淘宝网',    url: 'https://www.taobao.com' },
    { title: 'DeepSeek',  url: 'https://chat.deepseek.com' },
    { title: '即梦 AI',   url: 'https://jimeng.jianying.com' },
    { title: '硅基流动',  url: 'https://cloud.siliconflow.cn' },
    { title: 'Copilot',   url: 'https://copilot.microsoft.com' },
    { title: '豆包',      url: 'https://www.doubao.com' },
    { title: 'GitHub',    url: 'https://github.com' },
    { title: '知乎',      url: 'https://www.zhihu.com' },
    { title: '哔哩哔哩',  url: 'https://www.bilibili.com' },
    { title: '少数派',    url: 'https://sspai.com' },
    { title: '豆瓣',      url: 'https://www.douban.com' },
    { title: '掘金',      url: 'https://juejin.cn' },
    { title: '网易云音乐', url: 'https://music.163.com' },
    { title: '微博',      url: 'https://weibo.com' }
  ];

  var DEFAULT_QUOTE = '把常用的事放在顺手的地方。';

  var PER_ROW = 7;
  var ROW_START = 9;

  var MIN_SIZE = {
    clock:  { w: 4, h: 2 },
    search: { w: 6, h: 1 },
    quote:  { w: 4, h: 1 },
    link:   { w: UNIT_W, h: UNIT_H }
  };

  var hasExt = (typeof chrome !== 'undefined') && chrome.storage && chrome.storage.local;

  /* ---------------- 小工具 ---------------- */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function uid() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
  }

  /* 网址统一入口：补全协议、拒绝危险/无效地址。返回 '' 表示不合法 */
  function normalizeUrl(v) {
    if (typeof v !== 'string') { return ''; }
    var s = v.trim();
    if (!s) { return ''; }
    if (/^(javascript|data|vbscript|file|blob|about):/i.test(s)) { return ''; }
    if (!/^https?:\/\//i.test(s)) { s = 'https://' + s; }
    var u;
    try { u = new URL(s); } catch (e) { return ''; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') { return ''; }
    if (!u.hostname || (u.hostname.indexOf('.') < 0 && u.hostname !== 'localhost')) { return ''; }
    return s;
  }

  /* 自定义图标只允许 http(s) 图片地址或图片 dataURL，防止导入文件塞进脚本/超大串 */
  function safeIconData(v) {
    if (typeof v !== 'string' || !v) { return ''; }
    if (/^https?:\/\//i.test(v)) { return v.length <= 2048 ? v : ''; }
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/i.test(v)) {
      return v.length <= 700000 ? v : '';
    }
    return '';
  }

  function hueOf(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) % 360; }
    return h;
  }

  function intersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ---------------- 默认状态 ---------------- */

  function defaultState() {
    var items = [];

    items.push({ id: 'clock',  type: 'clock',  x: 8, y: 1, w: 8,  h: 4, hour12: false, showDate: true });
    items.push({ id: 'search', type: 'search', x: 6, y: 6, w: 12, h: 2 });

    DEFAULT_LINKS.forEach(function (l, i) {
      var perRow = Math.max(1, Math.min(PER_ROW, Math.floor(COLS / UNIT_W)));
      var c = i % perRow;
      var r = Math.floor(i / perRow);
      items.push({
        id: 'link-' + i,
        type: 'link',
        title: l.title,
        url: l.url,
        x: Math.round((COLS - perRow * UNIT_W) / 2) + c * UNIT_W,
        y: ROW_START + r * UNIT_H,
        w: UNIT_W,
        h: UNIT_H
      });
    });

    items.push({ id: 'quote', type: 'quote', x: 6, y: 17, w: 12, h: 1, text: DEFAULT_QUOTE });

    return { bg: 'aurora', engine: 'bing', cols: 24, locked: false, tipShown: false, items: items };
  }

  /* ---------------- 状态归一化 ---------------- */

  function cleanItem(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') { return null; }
    var t = raw.type;
    if (['clock', 'search', 'quote', 'link'].indexOf(t) < 0) { return null; }

    var it = {
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : fallbackId,
      type: t,
      x: clamp(Math.round(Number(raw.x) || 0), 0, 4096),
      y: clamp(Math.round(Number(raw.y) || 0), 0, 4096),
      w: clamp(Math.round(Number(raw.w) || 1), 1, 40),
      h: clamp(Math.round(Number(raw.h) || 1), 1, 40)
    };

    if (t === 'link') {
      it.url = normalizeUrl(raw.url);
      if (!it.url) { return null; }               /* 无效或危险地址直接丢弃 */
      it.title = typeof raw.title === 'string' ? raw.title.slice(0, 40) : '';

      /* 自定义图标必须原样带回：以前这里漏了，刷新后文字/上传/抓取的图标全丢 */
      var mode = raw.iconMode;
      it.iconMode = (mode === 'text' || mode === 'custom') ? mode : 'auto';
      it.iconText = typeof raw.iconText === 'string' ? raw.iconText.slice(0, 3) : '';
      it.iconColor = (typeof raw.iconColor === 'string' &&
        /^(#[0-9a-f]{3,8}|rainbow)$/i.test(raw.iconColor)) ? raw.iconColor : '';
      it.iconData = it.iconMode === 'custom' ? safeIconData(raw.iconData) : '';
      if (it.iconMode === 'custom' && !it.iconData) { it.iconMode = 'auto'; }
    }
    if (t === 'quote') {
      it.text = typeof raw.text === 'string' ? raw.text.slice(0, 120) : DEFAULT_QUOTE;
    }
    if (t === 'clock') {
      it.hour12 = !!raw.hour12;
      it.showDate = raw.showDate !== false;
    }
    return it;
  }

  function normalizeState(s) {
    var d = defaultState();
    if (!s || typeof s !== 'object') { return d; }

    var items = null;

    if (Array.isArray(s.items) && s.items.length) {
      items = s.items.map(function (raw, i) { return cleanItem(raw, 'it-' + i); })
                      .filter(Boolean);
    } else if (Array.isArray(s.links)) {
      /* 从 v2（站点面板版）迁移：拆成独立方块，按默认网格排布 */
      items = [];
      var oldLayout = s.layout || {};
      ['clock', 'search'].forEach(function (k) {
        var o = oldLayout[k] || { x: 8, y: 1, w: 8, h: 4 };
        items.push({ id: k, type: k, x: o.x, y: o.y, w: o.w, h: o.h });
      });
      s.links.forEach(function (l, i) {
        if (!l || !l.url) { return; }
        var perRow = Math.max(1, Math.min(PER_ROW, Math.floor(COLS / UNIT_W)));
        var c = i % perRow, r = Math.floor(i / perRow);
        items.push({
          id: 'link-' + i, type: 'link', title: l.title || '', url: l.url,
          x: Math.round((COLS - perRow * UNIT_W) / 2) + c * UNIT_W,
          y: ROW_START + r * UNIT_H, w: UNIT_W, h: UNIT_H
        });
      });
      var q = oldLayout.quote || { x: 6, y: 17, w: 12, h: 1 };
      items.push({ id: 'quote', type: 'quote', x: q.x, y: q.y, w: q.w, h: q.h, text: DEFAULT_QUOTE });
    }

    if (!items || !items.length) { return d; }

    /* 导入文件可能带重复 id，去重避免右键/删除打错对象 */
    var seen = {};
    items = items.filter(function (o) {
      if (seen[o.id]) { return false; }
      seen[o.id] = 1;
      return true;
    });

    /* 至少要有时钟和搜索 */
    ['clock', 'search'].forEach(function (k) {
      var has = items.some(function (o) { return o.type === k; });
      if (!has) {
        var base = d.items.filter(function (o) { return o.type === k; })[0];
        items.push(base);
      }
    });

    return {
      bg: BACKGROUNDS.some(function (b) { return b.id === s.bg; }) ? s.bg : d.bg,
      engine: ENGINES.some(function (e) { return e.id === s.engine; }) ? s.engine : d.engine,
      cols: DENSITIES.indexOf(s.cols) >= 0 ? s.cols : d.cols,
      locked: !!s.locked,
      tipShown: !!s.tipShown,
      items: items
    };
  }

  var state = defaultState();

  /* ---------------- 状态序列化 ----------------
     item 上挂着 el / tile / nameEl 等 DOM 引用，直接 JSON.stringify 会把
     一堆空对象写进存储和备份文件。存盘、导出、撤销一律走这里的干净副本。 */

  function serializeItem(o) {
    var c = { id: o.id, type: o.type, x: o.x, y: o.y, w: o.w, h: o.h };
    if (o.type === 'link') {
      c.title = o.title || '';
      c.url = o.url || '';
      c.iconMode = o.iconMode || 'auto';
      c.iconText = o.iconText || '';
      c.iconColor = o.iconColor || '';
      c.iconData = o.iconData || '';
    } else if (o.type === 'quote') {
      c.text = o.text || DEFAULT_QUOTE;
    } else if (o.type === 'clock') {
      c.hour12 = !!o.hour12;
      c.showDate = o.showDate !== false;
    }
    return c;
  }

  function serializeState() {
    return {
      bg: state.bg,
      engine: state.engine,
      cols: state.cols,
      locked: !!state.locked,
      tipShown: !!state.tipShown,
      items: state.items.map(serializeItem)
    };
  }

  /* ---------------- 存储 ---------------- */

  var BROKEN_PREFIX = KEY + '.broken.';

  /* 数据读不出来时先把原始值另存一份，别静默清空用户的布局 */
  function quarantine(raw) {
    if (typeof raw !== 'string') { return; }
    try { localStorage.setItem(BROKEN_PREFIX + Date.now(), raw.slice(0, 2000000)); } catch (e) {}
  }

  var store = {
    load: function (done) {
      if (hasExt) {
        try {
          chrome.storage.local.get([KEY, LEGACY_KEY], function (res) {
            if (chrome.runtime && chrome.runtime.lastError) {
              done(null, '扩展存储读取失败');
              return;
            }
            var v = (res && res[KEY]) || (res && res[LEGACY_KEY]) || null;
            if (v && (typeof v !== 'object' || !Array.isArray(v.items) || !v.items.length)) {
              done(null, '已保存的数据格式异常');
              return;
            }
            done(v);
          });
          return;
        } catch (e) { /* fallthrough */ }
      }
      var raw = null;
      try { raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY); }
      catch (e) { done(null, '本地存储不可用'); return; }
      if (!raw) { done(null); return; }
      try {
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
            !Array.isArray(parsed.items) || !parsed.items.length) {
          throw new Error('bad shape');
        }
        done(parsed);
      } catch (e) {
        quarantine(raw);
        done(null, '数据损坏');
      }
    },
    save: function (s, onFail) {
      var fail = onFail || function (msg) {
        showTip('保存失败：' + msg + '（这次改动可能不会保留）', 6000);
      };
      if (hasExt) {
        try {
          var o = {}; o[KEY] = s;
          chrome.storage.local.set(o, function () {
            var le = chrome.runtime && chrome.runtime.lastError;
            if (le) { fail(le.message || '扩展存储写入失败'); }
          });
          return;
        } catch (e) { fail(e.message || '扩展存储不可用'); return; }
      }
      try { localStorage.setItem(KEY, JSON.stringify(s)); }
      catch (e) {
        fail(e && e.name === 'QuotaExceededError' ? '存储空间不足' : '本地存储写入失败');
      }
    }
  };

  var saveTimer = null;
  function scheduleSave() {
    if (saveTimer) { clearTimeout(saveTimer); }
    saveTimer = setTimeout(function () { store.save(serializeState()); }, 260);
  }

  /* ---------------- DOM ---------------- */

  var canvas = document.getElementById('canvas');
  var overlay = document.getElementById('gridOverlay');
  var hintEl = document.getElementById('hint');
  var drawer = document.getElementById('drawer');
  var scrim = document.getElementById('scrim');
  var elSwatches = document.getElementById('bgSwatches');
  var elSeg = document.getElementById('engineSeg');
  var elRows = document.getElementById('linkRows');
  var elDensity = document.getElementById('densitySeg');
  var elDensityHint = document.getElementById('densityHint');

  /* ---------------- 几何 ---------------- */

  function metrics() {
    var W = canvas.clientWidth;
    var H = canvas.clientHeight;

    var colW = (W - GAP * (COLS - 1)) / COLS;
    var stepX = colW + GAP;

    /* 行高由列宽推导：保证 2 列 × 3 行 恰好是正方形 */
    var unit = UNIT_W * colW + (UNIT_W - 1) * GAP;
    var rowH = (unit - (UNIT_H - 1) * GAP) / UNIT_H;
    if (rowH < 6) { rowH = 6; }

    var stepY = rowH + GAP;
    var viewRows = Math.floor((H + GAP) / stepY);
    var rows = Math.max(4, viewRows, BASE_ROWS);

    return {
      W: W, H: H, colW: colW, rowH: rowH,
      rows: rows, viewRows: viewRows,
      stepX: stepX, stepY: stepY
    };
  }

  function rectOf(b, m) {
    return {
      left: b.x * m.stepX,
      top: b.y * m.stepY,
      width: b.w * m.colW + (b.w - 1) * GAP,
      height: b.h * m.rowH + (b.h - 1) * GAP
    };
  }

  /* ---------------- 占位推挤 ---------------- */

  /* iOS 式就近挤入排布（替代原来的整列下推）：
     把目标格让给拖动块，被挡住的方块从原位置向外一圈圈找最近的空位挪开。
     返回完整坐标表；实在放不下返回 null，调用方据此弹回。
     只算坐标，不改 state 也不改 DOM。 */
  function plan(it, box, m) {
    var rowsLimit = Math.max(m.rows, BASE_ROWS + 8);
    var cols = COLS;

    var all = state.items.map(function (o) {
      var b = o.id === it.id
        ? { x: box.x, y: box.y, w: box.w, h: box.h }
        : { x: o.x, y: o.y, w: o.w, h: o.h };
      return { id: o.id, x: b.x, y: b.y, w: b.w, h: b.h, ox: o.x, oy: o.y };
    });

    function blocked(b, selfId) {
      for (var i = 0; i < all.length; i++) {
        if (all[i].id !== selfId && intersect(b, all[i])) { return true; }
      }
      return false;
    }

    /* 螺旋扩散：先试原地，再一圈圈往外，同行优先于换行 */
    function nearestFree(o) {
      var maxR = Math.max(cols, rowsLimit);
      for (var r = 0; r <= maxR; r++) {
        var best = null, bestCost = Infinity;
        for (var dy = -r; dy <= r; dy++) {
          for (var dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) { continue; }
            var x = o.ox + dx, y = o.oy + dy;
            if (x < 0 || y < 0 || x + o.w > cols || y + o.h > rowsLimit) { continue; }
            var b = { x: x, y: y, w: o.w, h: o.h };
            if (blocked(b, o.id)) { continue; }
            var cost = Math.abs(dx) + Math.abs(dy) * 1.35;
            if (cost < bestCost) { bestCost = cost; best = b; }
          }
        }
        if (best) { return best; }
      }
      return null;
    }

    /* 只动真正被目标格挡住的方块，其余留在原处 */
    var queue = [];
    all.forEach(function (o) {
      if (o.id !== it.id && intersect(box, o)) { queue.push(o.id); }
    });

    var guard = 0, done = {};
    while (queue.length) {
      if (guard++ > 300) { return null; }
      var id = queue.shift();
      if (done[id]) { continue; }
      done[id] = 1;

      var o = null;
      for (var k = 0; k < all.length; k++) { if (all[k].id === id) { o = all[k]; break; } }
      if (!o) { continue; }
      if (!blocked({ x: o.x, y: o.y, w: o.w, h: o.h }, o.id)) { continue; }

      var spot = nearestFree(o);
      if (!spot) { return null; }
      o.x = spot.x; o.y = spot.y;
    }

    /* 最终校验：任何重叠或越界都判为放不下 */
    for (var i = 0; i < all.length; i++) {
      var a = all[i];
      if (a.x < 0 || a.y < 0 || a.x + a.w > cols || a.y + a.h > rowsLimit) { return null; }
      for (var j = i + 1; j < all.length; j++) {
        if (intersect(a, all[j])) { return null; }
      }
    }

    var geo = {};
    all.forEach(function (o) { geo[o.id] = { x: o.x, y: o.y, w: o.w, h: o.h }; });
    return geo;
  }

  function applyPlan(geo) {
    state.items.forEach(function (o) {
      var g = geo[o.id];
      if (!g) { return; }
      o.x = g.x; o.y = g.y; o.w = g.w; o.h = g.h;
    });
  }

  function findSpot(w, h, m) {
    for (var y = 0; y + h <= m.rows; y++) {
      for (var x = 0; x + w <= COLS; x++) {
        var box = { x: x, y: y, w: w, h: h };
        var hit = state.items.some(function (o) { return intersect(box, o); });
        if (!hit) { return box; }
      }
    }
    return null;
  }

  /* ---------------- 图标 ---------------- */

  var TWO_PART_TLD = [
    'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
    'com.hk', 'com.tw', 'co.uk', 'co.jp', 'co.kr'
  ];

  /* 主域候选：chat.deepseek.com → deepseek.com */
  function rootHosts(host) {
    var out = [];
    var bare = host.replace(/^www\./, '');
    if (bare) { out.push(bare); }

    var parts = bare.split('.');
    if (parts.length > 2) {
      var last2 = parts.slice(-2).join('.');
      var base = (TWO_PART_TLD.indexOf(last2) >= 0) ? parts.slice(-3).join('.') : last2;
      if (base && out.indexOf(base) < 0) { out.push(base); }
    }
    return out;
  }

  /* 站点自己托管的图标：国内站点比第三方服务可靠得多，而且 apple-touch-icon 是大图 */
  function siteIcons(url) {
    var host = hostOf(url);
    if (!host) { return []; }
    var out = [];
    rootHosts(host).forEach(function (h) {
      out.push('https://' + h + '/apple-touch-icon.png');
      out.push('https://' + h + '/favicon.ico');
    });
    return out;
  }

  function iconCandidates(url) {
    var out = [];
    var host = hostOf(url);

    if (!host) {
      if (hasExt && chrome.runtime && chrome.runtime.getURL) {
        try { out.push(chrome.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=64')); } catch (e) {}
      }
      return out;
    }

    out = out.concat(siteIcons(url));
    out.push('https://icons.duckduckgo.com/ip3/' + host + '.ico');
    out.push('https://www.google.com/s2/favicons?sz=128&domain=' + host);

    if (hasExt && chrome.runtime && chrome.runtime.getURL) {
      try { out.push(chrome.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=64')); } catch (e) {}
    }
    return out;
  }

  /* 手动「获取图标」用的候选：只走站点自托管 + 第三方，不碰浏览器缓存 */
  function probeCandidates(url) {
    var host = hostOf(url);
    var out = siteIcons(url);
    if (host) {
      out.push('https://icons.duckduckgo.com/ip3/' + host + '.ico');
      out.push('https://www.google.com/s2/favicons?sz=128&domain=' + host);
    }
    return out;
  }

  /* 并发试全部候选，取优先级最高的那个能真正解码出图的 */
  function probeIcon(url, onFound, onFail) {
    var list = probeCandidates(url);
    if (!list.length) { onFail('这个网址没解析出域名'); return; }

    var hits = [];
    var left = list.length;
    var done = false;

    var guard = window.setTimeout(finish, 2600);

    function finish() {
      if (done) { return; }
      done = true;
      window.clearTimeout(guard);
      if (!hits.length) { onFail(); return; }
      hits.sort(function (a, b) { return a.i - b.i; });
      onFound(hits[0].src);
    }

    list.forEach(function (src, i) {
      var img = new Image();
      img.onload = function () {
        if (done) { return; }
        if (img.naturalWidth >= 16 && img.naturalHeight >= 16) { hits.push({ i: i, src: src }); }
        if (--left <= 0) { finish(); }
      };
      img.onerror = function () {
        if (done) { return; }
        if (--left <= 0) { finish(); }
      };
      img.src = src;
    });
  }

  /* <img> / <a> 默认可被浏览器原生拖拽。真实鼠标按在图标上时，浏览器会抢先
     启动原生 drag 并派发 pointercancel，我们的拖动就被当成「取消」弹回了。
     统一关掉原生拖拽，让整个方块都是拖动手柄。 */
  function makeImg() {
    var im = document.createElement('img');
    im.draggable = false;
    im.setAttribute('draggable', 'false');
    im.alt = '';
    return im;
  }

  function buildIcon(item) {
    var box = document.createElement('div');
    box.className = 'ico';

    /* 文字图标 */
    if (item.iconMode === 'text') {
      var glyph = document.createElement('div');
      glyph.className = 'glyph';
      var txt = (item.iconText || item.title || hostOf(item.url) || '?').slice(0, 3);
      glyph.textContent = txt;
      glyph.dataset.len = txt.length;
      if (item.iconColor === 'rainbow') {
        glyph.style.background = 'conic-gradient(from 200deg,#F26B6B,#F2B93B,#7BD07B,#4AA8E0,#9A7BE0,#F26B6B)';
      } else if (item.iconColor) {
        glyph.style.background = item.iconColor;
      } else {
        var gh = hueOf(hostOf(item.url) || item.title || 'x');
        glyph.style.background = 'hsl(' + gh + ' 62% 46%)';
      }
      box.appendChild(glyph);
      return box;
    }

    /* 自定义图标（上传的图片或抓到的网址） */
    if (item.iconMode === 'custom' && item.iconData) {
      var up = makeImg();
      up.alt = '';
      up.referrerPolicy = 'no-referrer';
      up.src = item.iconData;
      box.appendChild(up);

      up.onerror = function () {
        box.textContent = '';
        var hh = hueOf(hostOf(item.url) || item.title || 'x');
        var sp = document.createElement('div');
        sp.className = 'letter';
        sp.textContent = (item.title || hostOf(item.url) || '?').trim().charAt(0);
        sp.style.background = 'linear-gradient(145deg, hsl(' + hh + ' 68% 58%), hsl(' + ((hh + 34) % 360) + ' 66% 44%))';
        box.appendChild(sp);
      };
      return box;
    }

    var cands = iconCandidates(item.url);
    var idx = 0;
    var img = makeImg();
    img.referrerPolicy = 'no-referrer';

    function letter() {
      box.textContent = '';
      var h = hueOf(hostOf(item.url) || item.title || 'x');
      var sp = document.createElement('div');
      sp.className = 'letter';
      sp.textContent = (item.title || hostOf(item.url) || '?').trim().charAt(0);
      sp.style.background = 'linear-gradient(145deg, hsl(' + h + ' 68% 58%), hsl(' + ((h + 34) % 360) + ' 66% 44%))';
      box.appendChild(sp);
    }

    var stageTimer = null;

    function tryNext() {
      window.clearTimeout(stageTimer);
      if (idx >= cands.length) { letter(); return; }
      var src = cands[idx++];
      img.src = src;
      /* 被墙的候选可能一直挂着，3 秒不走就换下一个 */
      stageTimer = window.setTimeout(tryNext, 3000);
    }

    img.onload = function () { window.clearTimeout(stageTimer); };
    img.onerror = tryNext;

    if (!cands.length) { letter(); }
    else { box.appendChild(img); tryNext(); }

    return box;
  }

  /* ---------------- 挂载各类部件 ---------------- */

  var suppressClick = false;

  /* 全局兜底：从捕获阶段掐断任何原生 drag。只挂在 widget 上不够可靠，
     浏览器可能在更早阶段就为 <a>/<img> 启动拖拽（拖出半透明图标副本）。 */
  document.addEventListener('dragstart', function (e) {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  function makeShell(item, extraClass) {
    var el = document.createElement('section');
    el.className = 'widget w-' + item.type + (extraClass ? ' ' + extraClass : '');
    el.dataset.id = item.id;
    el.dataset.type = item.type;

    var body = document.createElement('div');
    body.className = 'w-body';
    el.appendChild(body);

    canvas.appendChild(el);
    item.el = el;
    item.body = body;

    /* 兜底：任何子元素（链接 / 图片 / 文字）发起的原生拖拽都拦掉。
       否则真实鼠标按在图标上时浏览器会抢走指针并派发 pointercancel，
       我们的拖动就被当成「取消」直接弹回 */
    el.draggable = false;
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });

    /* 按住即拖，不做长按判断；位移不到 4px 当点击处理 */
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || state.locked) { return; }

      /* 站点方块里的 <a>/<img> 会启动浏览器原生拖拽，从源头阻止默认行为。
         顺便也不会给链接聚焦（避免 blur 事件干扰）；click 仍会派发，
         所以「点一下打开链接」不受影响。输入框部件不在这里处理。 */
      if (item.type === 'link') { e.preventDefault(); }

      /* 已聚焦的输入框里按下，留给文本选择；先点别处失焦后再拖整块 */
      var t = e.target;
      var isField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (isField && document.activeElement === t) { return; }

      startDrag(e, item);
    });

    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showWidgetMenu(item, e.clientX, e.clientY);
    });

    return item;
  }

  /* 阻断拖动结束后浏览器补发的那一次 click（避免误开链接） */
  document.addEventListener('click', function (e) {
    if (!suppressClick) { return; }
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  function mountClock(item) {
    makeShell(item);
    var wrap = document.createElement('div');
    wrap.className = 'clock-wrap';
    var time = document.createElement('div');
    time.className = 'time';
    time.textContent = '--:--';
    var date = document.createElement('div');
    date.className = 'date';
    wrap.appendChild(time);
    wrap.appendChild(date);
    item.body.appendChild(wrap);
    item.time = time;
    item.date = date;

    item.fit = function (r) {
      var wDiv = item.hour12 ? 4.9 : 3.2;
      var size = clamp(Math.min(r.height * 0.58, r.width / wDiv), 22, 180);
      time.style.fontSize = size.toFixed(1) + 'px';
      date.style.fontSize = clamp(size * 0.135, 9, 14).toFixed(1) + 'px';
    };
  }

  function mountSearch(item) {
    makeShell(item);
    var form = document.createElement('form');
    form.className = 'search';
    form.autocomplete = 'off';
    form.setAttribute('role', 'search');

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '搜索或输入网址';
    input.spellcheck = false;
    input.setAttribute('aria-label', '搜索');

    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'search-go';
    btn.setAttribute('aria-label', '搜索');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6L20 20"/></svg>';

    form.appendChild(btn);
    form.appendChild(input);
    item.body.appendChild(form);
    item.input = input;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) { return; }
      if (looksLikeUrl(v)) {
        window.location.assign(/^https?:\/\//i.test(v) ? v : 'https://' + v);
        return;
      }
      window.location.assign(currentEngine().url + encodeURIComponent(v));
    });
  }

  function mountLink(item) {
    makeShell(item);

    var a = document.createElement('a');
    a.className = 'tile';
    a.draggable = false;          /* 链接本身也不能被原生拖拽 */
    a.href = item.url;
    a.title = (item.title || hostOf(item.url)) + '\n' + item.url;
    item.iconEl = buildIcon(item);
    a.appendChild(item.iconEl);

    var nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = item.title || hostOf(item.url);
    a.appendChild(nm);
    item.body.appendChild(a);

    item.tile = a;
    item.nameEl = nm;

    item.fit = function (r) {
      var ratio = r.width / r.height;
      var horiz = ratio > 1.65;          /* 2x1 / 4x2：图标在左，文字在右 */
      var vert = ratio < 1 / 1.65;       /* 1x2：图标在上，文字在下 */
      /* 1x1 / 2x2 这类正方方块走「应用图标 + 名称」布局 */
      var square = !horiz && !vert &&
        Math.abs(r.width - r.height) / Math.max(r.width, r.height) < 0.2;
      item.el.classList.toggle('h-layout', horiz);
      item.el.classList.toggle('is-square', square);

      var s = Math.min(r.width, r.height);

      /* 1×1 的图标本身就是方块；更大的块需要一层同形状的底板把范围画出来 */
      var plate = (item.w / UNIT_W) * (item.h / UNIT_H) > 1.001;
      item.el.classList.toggle('is-plate', plate);
      if (plate) {
        item.el.style.setProperty('--plate-r', Math.round(clamp(s * 0.17, 14, 24)) + 'px');
      }

      var ico, labelSize;

      if (square) {
        /* 图标尽量占满方块，下面只留名称的完整行高 */
        labelSize = clamp(s * 0.125, 11.5, 15);
        var labelH = Math.ceil(labelSize * 1.15) + 1;
        var pad = Math.round(s * (plate ? 0.085 : 0.03));
        var gap = Math.round(s * 0.035);
        ico = Math.min(s - pad * 2 - gap - labelH - 1, s * (plate ? 0.66 : 0.78));
        item.el.style.setProperty('--pad', pad + 'px');
        item.el.style.setProperty('--gap', gap + 'px');
        item.el.style.setProperty('--label', labelH + 'px');
      } else if (horiz) {
        /* 宽扁方块：按高度取图标，否则 4x2 里图标会缩成一个小点 */
        ico = clamp(r.height * 0.62, 24, 150);
        labelSize = clamp(r.height * 0.15, 11, 20);
      } else if (vert) {
        ico = clamp(r.width * 0.62, 24, 150);
        labelSize = clamp(r.width * 0.135, 11, 18);
      } else {
        ico = clamp(s * 0.55, 22, 96);
        labelSize = clamp(ico * 0.22, 9.5, 15);
      }

      item.el.style.setProperty('--ico', Math.round(ico) + 'px');
      nm.style.fontSize = labelSize.toFixed(1) + 'px';
      nm.style.maxWidth = horiz ? Math.max(40, r.width - ico - 40) + 'px' : '100%';
    };
  }

  function mountQuote(item) {
    makeShell(item);
    var txt = document.createElement('div');
    txt.className = 'txt';
    txt.textContent = item.text || DEFAULT_QUOTE;
    item.body.appendChild(txt);
    item.txt = txt;

    item.fit = function (r) {
      txt.style.fontSize = clamp(Math.min(r.height * 0.46, r.width / 21), 11.5, 17).toFixed(1) + 'px';
    };
  }

  function mountItem(item) {
    if (item.type === 'clock') { mountClock(item); }
    else if (item.type === 'search') { mountSearch(item); }
    else if (item.type === 'link') { mountLink(item); }
    else if (item.type === 'quote') { mountQuote(item); }
  }

  function refreshLink(item) {
    if (!item.tile) { return; }
    item.tile.href = item.url;
    item.tile.title = (item.title || hostOf(item.url)) + '\n' + item.url;
    if (item.nameEl) { item.nameEl.textContent = item.title || hostOf(item.url); }

    var nu = buildIcon(item);
    if (item.iconEl && item.iconEl.parentNode) {
      item.iconEl.parentNode.replaceChild(nu, item.iconEl);
    }
    item.iconEl = nu;
  }

  function removeItem(id) {
    var idx = -1;
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) { idx = i; break; }
    }
    if (idx < 0) { return; }
    var it = state.items[idx];
    var before = serializeState();
    var name = it.type === 'link'
      ? (it.title || hostOf(it.url) || '站点')
      : ({ clock: '时钟', search: '搜索框', quote: '引语' }[it.type] || '组件');
    name = name.slice(0, 20);

    if (it.el) {
      it.el.classList.add('tile-out');
      var dying = it.el;
      window.setTimeout(function () {
        if (dying.parentNode) { dying.parentNode.removeChild(dying); }
      }, reduced() ? 0 : 190);
    }
    state.items.splice(idx, 1);
    renderRows();
    scheduleSave();

    pushUndo('删除「' + name + '」', before);
    undoTip('已删除「' + name + '」');
  }

  /* ---------------- 布局 ---------------- */

  function clearCanvas() {
    var kids = Array.prototype.slice.call(canvas.children);
    kids.forEach(function (c) {
      if (c !== overlay) { canvas.removeChild(c); }
    });
    state.items.forEach(function (o) {
      if (o.el && o.el.parentNode) { o.el.parentNode.removeChild(o.el); }
    });
  }

  function layoutAll() {
    var m = metrics();

    state.items.forEach(function (it) {
      /* 拖动中窗口尺寸变化 / 其它刷新，都不把正在跟手的方块拉回原位 */
      if (it === draggingItem) {
        if (it.fit) { it.fit(rectOf(it, m)); }
        return;
      }

      var min = MIN_SIZE[it.type] || { w: 1, h: 1 };
      it.w = clamp(it.w, min.w, COLS);
      it.h = clamp(it.h, min.h, m.rows);
      it.x = clamp(it.x, 0, COLS - it.w);
      it.y = clamp(it.y, 0, Math.max(0, m.rows - it.h));

      var r = rectOf(it, m);
      it.el.style.left = r.left + 'px';
      it.el.style.top = r.top + 'px';
      it.el.style.width = r.width + 'px';
      it.el.style.height = r.height + 'px';
      if (it.fit) { it.fit(r); }
    });

    paintGrid(m);
  }

  function paintGrid(m) {
    overlay.style.backgroundSize = m.stepX.toFixed(2) + 'px ' + m.stepY.toFixed(2) + 'px';
    overlay.style.backgroundPosition = (-m.stepX / 2).toFixed(2) + 'px ' + (-m.stepY / 2).toFixed(2) + 'px';
    /* 拖动中挤到更下面的行时，网格层临时长高，这里不要把它压回去 */
    var cur = parseFloat(overlay.style.height) || 0;
    var rows = Math.max(m.rows, Math.ceil((cur + GAP) / m.stepY));
    overlay.style.height = (rows * m.stepY - GAP).toFixed(1) + 'px';
  }

  /* ---------------- 拖动 ---------------- */

  function reduced() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* 全局唯一的活跃拖动：pointerup 在窗口外丢失时，下一次按下会先把它收尾，
     否则两个闭包会同时响应 pointermove，看起来就像「拖动被禁用/乱跳」 */
  var activeDrag = null;
  var draggingItem = null;   /* layoutAll 跳过正在跟手的这一块 */

  function startDrag(e, item) {
    if (activeDrag) { activeDrag.cancel(); }

    var myToken = {};
    var m = metrics();
    var rect = rectOf(item, m);
    var grabX = e.clientX - rect.left;
    var grabY = e.clientY - rect.top;
    var sx = e.clientX, sy = e.clientY;
    var scroll0 = canvas.scrollTop;
    var home = { x: item.x, y: item.y };

    var started = false, finished = false;
    var curCol = item.x, curRow = item.y;
    var hole = null;
    var lastEv = null, lastGeo = null;
    var autoY = 0, scrollTimer = 0;

    /* 只改 DOM 预览，不动 state：被挤开的方块先弹性让位。
       新排布会同时改 x/y，所以 left/top 都要画 */
    function paintOthers(geo) {
      state.items.forEach(function (o) {
        if (o.id === item.id || !o.el) { return; }
        var g = geo && geo[o.id];
        o.el.style.left = ((g ? g.x : o.x) * m.stepX) + 'px';
        o.el.style.top = ((g ? g.y : o.y) * m.stepY) + 'px';
      });
      if (geo) {
        var bottom = 0;
        Object.keys(geo).forEach(function (k) { bottom = Math.max(bottom, geo[k].y + geo[k].h); });
        overlay.style.height = (Math.max(m.rows, bottom) * m.stepY - GAP).toFixed(1) + 'px';
      }
    }

    function paintCell() {
      /* 拖动块自己吸附在目标格上，它本身就是落点指示，不再画额外的彩色框 */
      item.el.style.left = (curCol * m.stepX) + 'px';
      item.el.style.top = (curRow * m.stepY) + 'px';
    }

    function begin() {
      if (finished) { return; }
      started = true;
      draggingItem = item;

      /* 只让输入框失焦（保留文本选择行为）。不要 blur <a>：
         那会派发元素 blur，被窗口失焦兜底误判成「取消拖动」 */
      var af = document.activeElement;
      if (af && (af.tagName === 'INPUT' || af.tagName === 'TEXTAREA') && af.blur) {
        af.blur();
      }

      document.body.classList.add('is-dragging');
      /* 入场/落位/弹回动画的 fill 会锁住 transform，拖起前先清掉 */
      item.el.classList.remove('tile-in', 'is-rebounding', 'is-settling');
      item.el.classList.add('dragging');

      /* 原位虚坑 */
      hole = document.createElement('div');
      hole.className = 'drop-hole';
      hole.style.left = rect.left + 'px';
      hole.style.top = rect.top + 'px';
      hole.style.width = rect.width + 'px';
      hole.style.height = rect.height + 'px';
      canvas.appendChild(hole);
      paintCell();
    }

    /* 每换一格都重排一次，用户能提前看到谁会被就近挤开 */
    function commitPreview() {
      lastGeo = plan(item, { x: curCol, y: curRow, w: item.w, h: item.h }, m);
      paintOthers(lastGeo);
      /* 放不下时只把拖动块压暗一点，不再画彩色框 */
      item.el.classList.toggle('is-blocked', !lastGeo);
    }

    function computeCell(ev) {
      /* 画布滚动后，同一个视口坐标对应的内容坐标会变 */
      var shift = canvas.scrollTop - scroll0;
      return {
        x: clamp(Math.round((ev.clientX - grabX) / m.stepX), 0, COLS - item.w),
        y: clamp(Math.round((ev.clientY - grabY + shift) / m.stepY), 0,
                 Math.max(0, Math.max(m.rows, BASE_ROWS + 8) - item.h))
      };
    }

    function onMove(ev) {
      lastEv = ev;
      if (!started) {
        if (Math.abs(ev.clientX - sx) < 4 && Math.abs(ev.clientY - sy) < 4) { return; }
        begin();
      }

      var c = computeCell(ev);
      if (c.x !== curCol || c.y !== curRow) {
        curCol = c.x; curRow = c.y;
        paintCell();
        commitPreview();
      }

      /* 拖到画布上下边缘时自动滚动，滚下去还能继续找位置 */
      var cr = canvas.getBoundingClientRect();
      var edge = 60;
      autoY = 0;
      if (ev.clientY < cr.top + edge) {
        autoY = -clamp(Math.ceil((cr.top + edge - ev.clientY) / 5), 2, 18);
      } else if (ev.clientY > cr.bottom - edge) {
        autoY = clamp(Math.ceil((ev.clientY - (cr.bottom - edge)) / 5), 2, 18);
      }
      if (autoY && !scrollTimer) {
        scrollTimer = window.setInterval(stepScroll, 16);
      } else if (!autoY && scrollTimer) {
        window.clearInterval(scrollTimer);
        scrollTimer = 0;
      }
    }

    function stepScroll() {
      if (!started || finished || !lastEv) { return; }
      var before = canvas.scrollTop;
      canvas.scrollTop += autoY;
      if (canvas.scrollTop === before) { return; }
      var c = computeCell(lastEv);
      if (c.x !== curCol || c.y !== curRow) {
        curCol = c.x; curRow = c.y;
        paintCell();
        commitPreview();
      }
    }

    /* 弹性弹回：视觉上从当前落点一路弹回原位，带一点过冲 */
    function rebound() {
      if (reduced()) { return; }
      var dx = (curCol - home.x) * m.stepX;
      var dy = (curRow - home.y) * m.stepY;
      item.el.style.setProperty('--rx', dx.toFixed(1) + 'px');
      item.el.style.setProperty('--ry', dy.toFixed(1) + 'px');
      item.el.style.setProperty('--rx2', (-dx * 0.08).toFixed(1) + 'px');
      item.el.style.setProperty('--ry2', (-dy * 0.08).toFixed(1) + 'px');
      item.el.classList.add('is-rebounding');
      window.setTimeout(function () { item.el.classList.remove('is-rebounding'); }, 430);
    }

    function settle() {
      if (reduced()) { return; }
      item.el.classList.add('is-settling');
      window.setTimeout(function () { item.el.classList.remove('is-settling'); }, 360);
    }

    /* reason: 'drop' 正常松手 / 'cancel' Esc、指针取消、窗口失焦、被新拖动接管 */
    function end(reason) {
      if (finished) { return; }
      finished = true;
      if (activeDrag && activeDrag.token === myToken) { activeDrag = null; }

      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onCancel, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur, false);
      if (scrollTimer) { window.clearInterval(scrollTimer); scrollTimer = 0; }

      draggingItem = null;
      if (!started) { return; }

      document.body.classList.remove('is-dragging');
      item.el.classList.remove('dragging', 'is-blocked');

      if (hole && hole.parentNode) { hole.parentNode.removeChild(hole); }

      var cancelled = (reason === 'cancel');
      if (cancelled || !lastGeo) {
        paintOthers(null);           /* 让位预览全部收回 */
        rebound();
      } else {
        applyPlan(lastGeo);
        var mx = 18;
        state.items.forEach(function (o) { mx = Math.max(mx, o.y + o.h); });
        BASE_ROWS = mx;
        settle();
      }

      overlay.style.height = '';   /* 收掉拖动时临时撑高的网格层 */
      layoutAll();
      scheduleSave();

      if (!cancelled) {
        suppressClick = true;
        window.setTimeout(function () { suppressClick = false; }, 600);
      }
    }

    function onUp() { end('drop'); }
    function onCancel() { end('cancel'); }
    function onBlur(ev) {
      /* blur 不冒泡但 capture 会经过 window；只认真正的窗口失焦，
         否则点图标时链接失焦会把拖动直接取消掉 */
      if (ev.target !== window) { return; }
      end('cancel');
    }
    function onKey(ev) {
      if (ev.key !== 'Escape') { return; }
      ev.preventDefault();
      ev.stopPropagation();
      end('cancel');
    }

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur, false);

    activeDrag = { token: myToken, cancel: function () { end('cancel'); } };
  }

  /* ---------------- 图标素材 ---------------- */

  var ICONS = {
    plus:     'M12 5.5v13M5.5 12h13',
    external: 'M14 4h6v6M20 4l-9 9M18 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5',
    layout:   'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    pencil:   'M4.5 19.5h4L20 8l-4-4L4.5 15.5v4z',
    link:     'M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.7 6.6M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.4-1.4',
    trash:    'M5 7h14M9.5 7V5h5v2M7.5 7l.9 12h7.2l.9-12',
    lock:     'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
    unlock:   'M7 11V8a5 5 0 0 1 9.2-2.7M5 11h14v9H5z',
    image:    'M4 5h16v14H4zM4 15.5l4-4 3.5 3.5 3-3L20 16',
    search:   'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM16 16l4.5 4.5',
    backup:   'M12 16.5V4.5M8 8.5l4-4 4 4M4.5 16.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-2.5',
    gear:     'M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM19 12a7 7 0 0 0-.1-1.1l1.9-1.4-1.9-3.3-2.2.9a7 7 0 0 0-1.9-1.1L14.4 3.5h-3.8L10.2 6a7 7 0 0 0-1.9 1.1l-2.2-.9-1.9 3.3L6.1 10.9a7 7 0 0 0 0 2.2l-1.9 1.4 1.9 3.3 2.2-.9a7 7 0 0 0 1.9 1.1l.4 2.5h3.8l.4-2.5a7 7 0 0 0 1.9-1.1l2.2.9 1.9-3.3-1.9-1.4c.06-.36.1-.73.1-1.1z',
    upload:   'M12 16.5V5M8 9l4-4 4 4M4.5 19h15',
    check:    'M5 12.5l4.6 4.6L19 7',
    x:        'M6.5 6.5l11 11M17.5 6.5l-11 11',
    type:     'M5 6h14M12 6v13M9 19h6',
    reset:    'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5V9h4.5'
  };

  function iconEl(name) {
    var s = document.createElement('span');
    s.className = 'ctx-ico';
    if (name && ICONS[name]) {
      s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + ICONS[name] + '"/></svg>';
    }
    return s;
  }

  /* 按候选顺序逐个试，全部失败则显示文字占位 */
  function fillPreview(box, list, fallbackText) {
    box.textContent = '';

    var idx = 0;
    var img = null;

    function placeholder() {
      var g = document.createElement('div');
      g.className = 'glyph-fixed';
      g.textContent = fallbackText || '?';
      g.style.background = '#3a3f45';
      box.appendChild(g);
    }

    function next() {
      if (idx >= list.length) { placeholder(); return; }
      if (!img) {
        img = makeImg();
        img.alt = '';
        img.onerror = next;
        box.appendChild(img);
      }
      img.src = list[idx++];
    }

    if (!list.length) { placeholder(); return; }
    next();
  }

  var ICON_COLORS = [
    '#2F6FDB', '#F2B93B', '#E5484D', '#7A5C48', '#8AA35A',
    '#1E4FA3', '#D9B26A', '#3B2F4A', '#B8303A', '#1F5FD8',
    '#5FBF9F', '#E8EAED', 'rainbow'
  ];

  /* ---------------- 右键菜单 ---------------- */

  var menu = document.createElement('div');
  menu.className = 'ctxmenu';
  menu.hidden = true;
  document.body.appendChild(menu);

  var menuHideTimer = 0;

  function hideMenu(immediate) {
    if (menuHideTimer) { clearTimeout(menuHideTimer); menuHideTimer = 0; }
    if (menu.hidden) { return; }
    if (immediate || reduced()) {
      menu.hidden = true;
      menu.classList.remove('ctx-in', 'ctx-out');
      return;
    }
    menu.classList.remove('ctx-in');
    menu.classList.add('ctx-out');
    menuHideTimer = window.setTimeout(function () {
      menu.hidden = true;
      menu.classList.remove('ctx-out');
      menuHideTimer = 0;
    }, 140);
  }

  function placeMenu(x, y) {
    /* 快速连续右键时，取消上一次没播完的退场 */
    if (menuHideTimer) { clearTimeout(menuHideTimer); menuHideTimer = 0; }
    menu.classList.remove('ctx-out', 'ctx-in');
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.hidden = false;

    var r = menu.getBoundingClientRect();
    var left = Math.max(10, Math.min(x, window.innerWidth - r.width - 10));
    var top = Math.max(10, Math.min(y, window.innerHeight - r.height - 10));

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.transformOrigin = (x - left) + 'px ' + (y - top) + 'px';

    menu.classList.remove('ctx-in');
    /* 触发一次重排，让入场动画能重复播放 */
    void menu.offsetWidth;
    menu.classList.add('ctx-in');
  }

  function mItem(label, fn, opts) {
    opts = opts || {};
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctx-item' + (opts.danger ? ' is-danger' : '');

    b.appendChild(iconEl(opts.icon || ''));

    var sp = document.createElement('span');
    sp.className = 'ctx-text';
    sp.textContent = label;
    b.appendChild(sp);

    var hint = document.createElement('span');
    hint.className = 'ctx-hint';
    hint.textContent = opts.hint || '';
    b.appendChild(hint);

    b.addEventListener('click', function () { hideMenu(); fn(); });
    return b;
  }

  function mSep() {
    var d = document.createElement('div');
    d.className = 'ctx-sep';
    return d;
  }

  function mGroup(label, icon, chips) {
    var g = document.createElement('div');
    g.className = 'ctx-group';

    var head = document.createElement('div');
    head.className = 'ctx-item is-static';
    head.appendChild(iconEl(icon));
    var sp = document.createElement('span');
    sp.className = 'ctx-text';
    sp.textContent = label;
    head.appendChild(sp);
    head.appendChild(document.createElement('span'));
    g.appendChild(head);
    g.appendChild(chips);
    return g;
  }

  function mChips(opts, current, onPick) {
    var row = document.createElement('div');
    row.className = 'ctx-chips';
    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctx-chip' + (o.value === current ? ' is-active' : '');
      b.textContent = o.label;
      b.addEventListener('click', function () { hideMenu(); onPick(o.value); });
      row.appendChild(b);
    });
    return row;
  }

  var SIZE_OPTS = [
    { label: '1x1', value: UNIT_W + 'x' + UNIT_H },
    { label: '2x1', value: (UNIT_W * 2) + 'x' + UNIT_H },
    { label: '1x2', value: UNIT_W + 'x' + (UNIT_H * 2) },
    { label: '2x2', value: (UNIT_W * 2) + 'x' + (UNIT_H * 2) },
    { label: '4x2', value: (UNIT_W * 4) + 'x' + (UNIT_H * 2) }
  ];

  /* 空白处右键 */
  function showCanvasMenu(x, y) {
    menu.textContent = '';
    menu.appendChild(mItem('添加图标', addLink, { icon: 'plus' }));
    /* 写清楚「点下去会发生什么」，以前写「自由布局」结果点了反而锁上 */
    menu.appendChild(mItem(state.locked ? '解锁布局' : '锁定布局', toggleLock, {
      icon: state.locked ? 'unlock' : 'lock',
      hint: state.locked ? '当前不能拖动' : ''
    }));
    menu.appendChild(mItem('换壁纸', cycleBg, { icon: 'image', hint: bgName(state.bg) }));
    menu.appendChild(mItem('本地搜索', openFinder, { icon: 'search', hint: 'Ctrl+F' }));
    menu.appendChild(mItem('立即备份', exportBackup, { icon: 'backup' }));
    menu.appendChild(mItem('设置', openDrawer, { icon: 'gear' }));
    placeMenu(x, y);
  }

  /* 组件上右键 */
  function showWidgetMenu(item, x, y) {
    menu.textContent = '';

    if (item.type === 'link') {
      menu.appendChild(mItem('在新标签页打开', function () {
        window.open(item.url, '_blank', 'noopener');
      }, { icon: 'external' }));

      menu.appendChild(mGroup('布局', 'layout', mChips(SIZE_OPTS, item.w + 'x' + item.h, function (v) {
        var p = v.split('x');
        applySize(item, parseInt(p[0], 10), parseInt(p[1], 10));
      })));

      menu.appendChild(mItem('编辑图标', function () { openIconEditor(item); }, { icon: 'pencil' }));
      menu.appendChild(mItem('编辑主页', function () { editLink(item); }, { icon: 'link' }));
      menu.appendChild(mItem('删除', function () { removeItem(item.id); }, { icon: 'trash', danger: true }));

    } else if (item.type === 'clock') {
      menu.appendChild(mGroup('时间制式', 'layout', mChips([
        { label: '24 小时', value: 24 },
        { label: '12 小时', value: 12 }
      ], item.hour12 ? 12 : 24, function (v) {
        item.hour12 = (v === 12);
        layoutAll();
        paintClock();
        scheduleSave();
      })));

      menu.appendChild(mItem(item.showDate === false ? '显示日期' : '隐藏日期', function () {
        item.showDate = (item.showDate === false);
        paintClock();
        scheduleSave();
      }, { icon: 'type' }));

      menu.appendChild(mSep());
      menu.appendChild(mItem('删除', function () { removeItem(item.id); }, { icon: 'trash', danger: true }));

    } else if (item.type === 'search') {
      menu.appendChild(mGroup('搜索引擎', 'search', mChips(ENGINES.map(function (e) {
        return { label: e.name, value: e.id };
      }), state.engine, function (v) {
        state.engine = v;
        scheduleSave();
        renderEngines();
      })));

      menu.appendChild(mSep());
      menu.appendChild(mItem('删除', function () { removeItem(item.id); }, { icon: 'trash', danger: true }));

    } else if (item.type === 'quote') {
      menu.appendChild(mItem('编辑文字', function () { editQuote(item); }, { icon: 'pencil' }));
      menu.appendChild(mSep());
      menu.appendChild(mItem('删除', function () { removeItem(item.id); }, { icon: 'trash', danger: true }));
    }

    placeMenu(x, y);
  }

  function applySize(item, w, h) {
    var m = metrics();
    var box = { x: clamp(item.x, 0, COLS - w), y: item.y, w: w, h: h };
    var g = plan(item, box, m);

    if (!g) {
      var spot = findSpot(w, h, m);
      if (spot) {
        box = spot;
        g = plan(item, box, m);
      }
    }

    if (g) { applyPlan(g); }
    layoutAll();
    scheduleSave();
  }

  var BG_VARS = [
    '--bg-grad', '--waves-op', '--grain-op', '--glass', '--glass-brd', '--glass-hi',
    '--panel', '--panel-brd', '--input-bg', '--input-brd', '--hover', '--shadow',
    '--dash', '--grid-dot', '--fg', '--fg-dim', '--fg-faint'
  ];

  function setBg(id) {
    if (state.bg === id) { return; }

    /* CSS 变量驱动的渐变不会过渡，克隆一份旧背景淡出，做交叉淡入 */
    var old = document.querySelector('.bg');
    if (old && !reduced()) {
      var cs = getComputedStyle(document.body);
      var ghost = old.cloneNode(true);
      ghost.classList.add('bg-ghost');
      BG_VARS.forEach(function (k) { ghost.style.setProperty(k, cs.getPropertyValue(k)); });
      /* 克隆出来的 defs id 会重复；去掉后引用落到新层，配色一致 */
      Array.prototype.forEach.call(ghost.querySelectorAll('[id]'), function (n) {
        n.removeAttribute('id');
      });
      document.body.insertBefore(ghost, old.nextSibling);
      window.setTimeout(function () {
        if (ghost.parentNode) { ghost.parentNode.removeChild(ghost); }
      }, 700);
    }

    state.bg = id;
    document.body.dataset.bg = id;
    scheduleSave();
    renderSwatches();
  }

  function bgName(id) {
    for (var i = 0; i < BACKGROUNDS.length; i++) {
      if (BACKGROUNDS[i].id === id) { return BACKGROUNDS[i].name; }
    }
    return '';
  }

  function cycleBg() {
    var idx = 0;
    for (var i = 0; i < BACKGROUNDS.length; i++) {
      if (BACKGROUNDS[i].id === state.bg) { idx = i; }
    }
    var next = BACKGROUNDS[(idx + 1) % BACKGROUNDS.length];
    setBg(next.id);
    showTip('背景 · ' + next.name, 1400);
  }

  function syncLockUI() {
    document.body.classList.toggle('is-locked', !!state.locked);
    var badge = document.getElementById('btnLock');
    if (badge) { badge.hidden = !state.locked; }
  }

  function setLocked(v) {
    state.locked = !!v;
    syncLockUI();
    scheduleSave();
  }

  function toggleLock() {
    setLocked(!state.locked);
    showTip(state.locked
      ? '布局已锁定：方块不能拖动，点右上角「布局已锁定」可解锁'
      : '布局已解锁，可以直接拖动方块', 3600);
  }

  function tidyLayout() {
    var startY = 1;
    state.items.forEach(function (o) {
      if (o.type === 'clock' || o.type === 'search') {
        startY = Math.max(startY, o.y + o.h + 1);
      }
    });
    var endY = repackLinks(startY);
    state.items.forEach(function (o) {
      if (o.type === 'quote') { o.y = Math.min(endY + 1, 200); }
    });
    layoutAll();
    scheduleSave();
  }

  /* ---------------- 通用弹窗骨架 ---------------- */

  var dialogOpen = false;

  function buildScrim(card) {
    var wrap = document.createElement('div');
    wrap.className = 'dialog-scrim';
    wrap.appendChild(card);
    return wrap;
  }

  function closeScrim(wrap) {
    dialogOpen = false;
    if (!wrap || !wrap.parentNode) { return; }
    if (reduced()) { wrap.parentNode.removeChild(wrap); return; }
    wrap.classList.add('is-closing');
    window.setTimeout(function () {
      if (wrap.parentNode) { wrap.parentNode.removeChild(wrap); }
    }, 190);
  }

  function dlgField(labelText, iconName, value, placeholder) {
    var f = document.createElement('div');
    f.className = 'dlg-field';

    if (labelText) {
      var l = document.createElement('span');
      l.className = 'dlg-label';
      l.textContent = labelText;
      f.appendChild(l);
    }

    var row = document.createElement('div');
    row.className = 'dlg-input-wrap';
    if (iconName) { row.appendChild(iconEl(iconName)); }

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value || '';
    inp.placeholder = placeholder || '';
    inp.spellcheck = false;
    row.appendChild(inp);

    f.appendChild(row);
    return { root: f, input: inp, row: row };
  }

  /* ---------------- 编辑图标 ---------------- */

  function openIconEditor(item) {
    if (dialogOpen) { return; }

    var draft = {
      url: item.url,
      title: item.title,
      mode: item.iconMode || 'auto',
      text: item.iconText || (item.title || hostOf(item.url) || '').slice(0, 3),
      color: item.iconColor || ICON_COLORS[0],
      data: item.iconData || '',
      /* custom 的数据来源：url = 抓到的网址，file = 本地传的图 */
      source: (item.iconMode === 'custom')
        ? (/^https?:/i.test(item.iconData || '') ? 'url' : 'file')
        : ''
    };

    var card = document.createElement('div');
    card.className = 'dlg-icon';

    var head = document.createElement('div');
    head.className = 'dlg-head';
    var h3 = document.createElement('h3');
    h3.textContent = '编辑图标';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'dlg-x';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.appendChild(iconEl('x'));
    head.appendChild(h3);
    head.appendChild(closeBtn);
    card.appendChild(head);

    var box1 = document.createElement('div');
    box1.className = 'dlg-box';

    var fUrl = dlgField('网址', 'link', draft.url, 'https://');
    var fetchBtn = document.createElement('button');
    fetchBtn.type = 'button';
    fetchBtn.className = 'dlg-inline-btn';
    fetchBtn.textContent = '获取图标';
    fUrl.row.appendChild(fetchBtn);
    box1.appendChild(fUrl.root);

    var fName = dlgField('名称', 'type', draft.title, '显示的名字');
    box1.appendChild(fName.root);

    var urlErr = document.createElement('div');
    urlErr.className = 'dlg-error';
    urlErr.hidden = true;
    box1.appendChild(urlErr);
    fUrl.input.addEventListener('input', function () { urlErr.hidden = true; });
    card.appendChild(box1);

    var box2 = document.createElement('div');
    box2.className = 'dlg-box';

    var previews = document.createElement('div');
    previews.className = 'di-previews';

    function pTile(label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'di-prev';
      var box = document.createElement('div');
      box.className = 'di-prev-ico';
      b.appendChild(box);
      var sp = document.createElement('span');
      sp.className = 'di-prev-label';
      sp.textContent = label;
      b.appendChild(sp);
      return { root: b, box: box };
    }

    var tAuto = pTile('当前图标');
    var tText = pTile('文字图标');
    var tUp = pTile('上传');

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    tAuto.root.addEventListener('click', function () {
      draft.mode = 'auto';
      draft.data = '';
      draft.source = '';
      syncPreview();
    });
    tText.root.addEventListener('click', function () { draft.mode = 'text'; syncPreview(); });
    tUp.root.addEventListener('click', function () { fileInput.click(); });

    previews.appendChild(tAuto.root);
    previews.appendChild(tText.root);
    previews.appendChild(tUp.root);
    previews.appendChild(fileInput);
    box2.appendChild(previews);

    var fText = dlgField('图标文字', 'type', draft.text, '最多 3 个字');
    box2.appendChild(fText.root);

    var colorWrap = document.createElement('div');
    colorWrap.className = 'dlg-field';
    var colorLab = document.createElement('span');
    colorLab.className = 'dlg-label';
    colorLab.textContent = '图标颜色';
    colorWrap.appendChild(colorLab);

    var swatchRow = document.createElement('div');
    swatchRow.className = 'di-colors';
    ICON_COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'di-color' + (c === draft.color ? ' is-active' : '');
      b.dataset.color = c;
      if (c === 'rainbow') {
        b.style.background = 'conic-gradient(from 200deg,#F26B6B,#F2B93B,#7BD07B,#4AA8E0,#9A7BE0,#F26B6B)';
      } else {
        b.style.background = c;
      }
      b.addEventListener('click', function () {
        draft.color = c;
        syncPreview();
      });
      swatchRow.appendChild(b);
    });
    colorWrap.appendChild(swatchRow);
    box2.appendChild(colorWrap);
    card.appendChild(box2);

    var foot = document.createElement('div');
    foot.className = 'dlg-foot';
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'dlg-primary';
    saveBtn.textContent = '保存';
    foot.appendChild(saveBtn);
    card.appendChild(foot);

    var wrap = buildScrim(card);

    function paintBox(box, mode) {
      box.textContent = '';
      box.className = 'di-prev-ico mode-' + mode;

      if (mode === 'upload') {
        if (draft.mode === 'custom' && draft.source === 'file' && draft.data) {
          var up = makeImg();
          up.src = draft.data;
          up.alt = '';
          box.appendChild(up);
        } else {
          box.appendChild(iconEl('plus'));
        }
        return;
      }

      if (mode === 'text') {
        var g = document.createElement('div');
        g.className = 'glyph-fixed';
        g.textContent = draft.text.slice(0, 3);
        if (draft.color === 'rainbow') {
          g.style.background = 'conic-gradient(from 200deg,#F26B6B,#F2B93B,#7BD07B,#4AA8E0,#9A7BE0,#F26B6B)';
        } else {
          g.style.background = draft.color;
        }
        box.appendChild(g);
        return;
      }

      var url = fUrl.input.value.trim() || item.url;
      var list = (draft.mode === 'custom' && draft.source === 'url' && draft.data)
        ? [draft.data]
        : iconCandidates(url);

      fillPreview(box, list, (fName.input.value || '?').slice(0, 3));
    }

    function syncPreview() {
      paintBox(tAuto.box, 'auto');
      paintBox(tText.box, 'text');
      paintBox(tUp.box, 'upload');

      tAuto.root.classList.toggle('is-active',
        draft.mode === 'auto' || (draft.mode === 'custom' && draft.source === 'url'));
      tText.root.classList.toggle('is-active', draft.mode === 'text');
      tUp.root.classList.toggle('is-active',
        draft.mode === 'custom' && draft.source === 'file');

      var isText = draft.mode === 'text';
      fText.root.style.display = isText ? '' : 'none';
      colorWrap.style.display = isText ? '' : 'none';

      Array.prototype.forEach.call(swatchRow.children, function (b) {
        b.classList.toggle('is-active', b.dataset.color === draft.color);
      });
    }

    fText.input.addEventListener('input', function () {
      draft.text = fText.input.value.trim();
      if (draft.mode !== 'text') { draft.mode = 'text'; }
      syncPreview();
    });

    fUrl.input.addEventListener('change', function () { paintBox(tAuto.box, 'auto'); });
    fetchBtn.addEventListener('click', function () {
      var url = normalizeUrl(fUrl.input.value);
      if (!url) {
        urlErr.textContent = '先填一个有效的网址，例如 example.com';
        urlErr.hidden = false;
        fUrl.input.focus();
        return;
      }

      fetchBtn.disabled = true;
      fetchBtn.textContent = '获取中…';
      tAuto.box.classList.add('is-loading');

      probeIcon(url, function (src) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = '获取图标';
        tAuto.box.classList.remove('is-loading');
        /* 重排一次，让「抓到了」的脉冲可以重复播放 */
        tAuto.box.classList.remove('is-success');
        void tAuto.box.offsetWidth;
        tAuto.box.classList.add('is-success');

        draft.data = src;
        draft.source = 'url';
        draft.mode = 'custom';
        syncPreview();
        showTip('已抓到这个网站的图标', 1500);
      }, function (msg) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = '获取图标';
        tAuto.box.classList.remove('is-loading');
        showTip(msg || '没抓到图标，可以改用文字图标或上传', 2600);
      });
    });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) { return; }
      if (file.size > 512 * 1024) { showTip('图片太大，请选 512KB 以内的', 2200); return; }
      var reader = new FileReader();
      reader.onload = function () {
        draft.data = String(reader.result || '');
        draft.source = 'file';
        draft.mode = 'custom';
        syncPreview();
      };
      reader.readAsDataURL(file);
    });

    function close() {
      closeScrim(wrap);
      document.removeEventListener('keydown', onKey, true);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
    }

    closeBtn.addEventListener('click', close);
    wrap.addEventListener('pointerdown', function (e) { if (e.target === wrap) { close(); } });
    document.addEventListener('keydown', onKey, true);

    saveBtn.addEventListener('click', function () {
      var url = normalizeUrl(fUrl.input.value);
      if (!url) {
        urlErr.textContent = '网址无效，请填 example.com 或 https://example.com';
        urlErr.hidden = false;
        fUrl.input.focus();
        return;
      }

      item.url = url;
      item.title = fName.input.value.trim().slice(0, 40) || item.title;
      item.iconMode = draft.mode;
      item.iconText = draft.text.slice(0, 3);
      item.iconColor = draft.color;
      item.iconData = (draft.mode === 'custom') ? draft.data : '';

      refreshLink(item);
      close();
      scheduleSave();
      renderRows();
    });

    document.body.appendChild(wrap);
    dialogOpen = true;
    hideMenu();
    syncPreview();
    fUrl.input.focus();
    fUrl.input.select();
  }

  /* ---------------- 本地搜索 ---------------- */

  function openFinder() {
    if (dialogOpen) { return; }

    var card = document.createElement('div');
    card.className = 'finder';

    var row = document.createElement('div');
    row.className = 'finder-row';
    row.appendChild(iconEl('search'));

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '搜索图标名称或网址…';
    input.spellcheck = false;
    row.appendChild(input);

    var hint = document.createElement('span');
    hint.className = 'finder-hint';
    hint.textContent = 'Esc';
    row.appendChild(hint);
    card.appendChild(row);

    var list = document.createElement('div');
    list.className = 'finder-list';
    card.appendChild(list);

    var wrap = buildScrim(card);

    var results = [];

    function render(q) {
      list.textContent = '';
      var kw = q.trim().toLowerCase();
      results = state.items.filter(function (o) {
        if (o.type !== 'link') { return false; }
        if (!kw) { return true; }
        return (o.title || '').toLowerCase().indexOf(kw) >= 0 ||
               (o.url || '').toLowerCase().indexOf(kw) >= 0;
      }).slice(0, 8);

      if (!results.length) {
        var empty = document.createElement('div');
        empty.className = 'finder-empty';
        empty.textContent = '没有匹配的图标';
        list.appendChild(empty);
        return;
      }

      results.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'finder-item';
        b.appendChild(buildIcon(o));
        var sp = document.createElement('span');
        sp.className = 'finder-name';
        sp.textContent = o.title || hostOf(o.url);
        b.appendChild(sp);
        var host = document.createElement('span');
        host.className = 'finder-host';
        host.textContent = hostOf(o.url);
        b.appendChild(host);
        b.addEventListener('click', function () {
          close();
          window.location.assign(o.url);
        });
        list.appendChild(b);
      });
    }

    function close() {
      closeScrim(wrap);
      document.removeEventListener('keydown', onKey, true);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
      if (e.key === 'Enter' && results.length) {
        e.preventDefault();
        var url = results[0].url;
        close();
        window.location.assign(url);
      }
    }

    input.addEventListener('input', function () { render(input.value); });
    wrap.addEventListener('pointerdown', function (e) {
      if (e.target === wrap || e.target === list) { close(); }
    });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(wrap);
    dialogOpen = true;
    hideMenu();
    render('');
    input.focus();
  }

  /* ---------------- 普通编辑弹窗 ---------------- */

  /* 统一的确认框，替代原生 confirm（原生弹窗在新标签页里很突兀） */
  function openConfirm(title, message, onOk, okLabel) {
    if (dialogOpen) { return; }

    var card = document.createElement('div');
    card.className = 'dlg';

    var h = document.createElement('h3');
    h.textContent = title;
    card.appendChild(h);

    var p = document.createElement('p');
    p.className = 'dlg-msg';
    p.textContent = message;
    card.appendChild(p);

    var foot = document.createElement('div');
    foot.className = 'dlg-foot';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dlg-btn';
    cancel.textContent = '取消';
    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'dlg-primary is-danger';
    ok.textContent = okLabel || '确定';
    foot.appendChild(cancel);
    foot.appendChild(ok);
    card.appendChild(foot);

    var wrap = buildScrim(card);

    function close() {
      closeScrim(wrap);
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
      else if (e.key === 'Enter') { e.preventDefault(); ok.click(); }
    }

    cancel.addEventListener('click', close);
    ok.addEventListener('click', function () { close(); onOk(); });
    wrap.addEventListener('pointerdown', function (e) { if (e.target === wrap) { close(); } });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(wrap);
    dialogOpen = true;
    hideMenu();
    ok.focus();
  }

  function openDialog(title, fields, onOk, validate) {
    if (dialogOpen) { return; }

    var card = document.createElement('div');
    card.className = 'dlg';

    var h = document.createElement('h3');
    h.textContent = title;
    card.appendChild(h);

    var inputs = {};
    fields.forEach(function (f) {
      var made = dlgField(f.label, f.icon || '', f.value, f.placeholder);
      card.appendChild(made.root);
      inputs[f.key] = made.input;
    });

    var errEl = document.createElement('div');
    errEl.className = 'dlg-error';
    errEl.hidden = true;
    card.appendChild(errEl);

    var actions = document.createElement('div');
    actions.className = 'dlg-foot';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dlg-btn';
    cancel.textContent = '取消';

    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'dlg-primary';
    ok.textContent = '保存';

    actions.appendChild(cancel);
    actions.appendChild(ok);
    card.appendChild(actions);

    var wrap = buildScrim(card);

    function close() {
      closeScrim(wrap);
      document.removeEventListener('keydown', onKey, true);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
      else if (e.key === 'Enter') { e.preventDefault(); ok.click(); }
    }

    Object.keys(inputs).forEach(function (k) {
      inputs[k].addEventListener('input', function () { errEl.hidden = true; });
    });

    cancel.addEventListener('click', close);
    ok.addEventListener('click', function () {
      var out = {};
      Object.keys(inputs).forEach(function (k) { out[k] = inputs[k].value.trim(); });
      if (validate) {
        var err = validate(out);
        if (err) {
          errEl.textContent = err;
          errEl.hidden = false;
          var first = inputs[fields[0].key];
          if (first) { first.focus(); }
          return;                       /* 校验不通过就留在弹窗里 */
        }
      }
      close();
      onOk(out);
    });
    wrap.addEventListener('pointerdown', function (e) { if (e.target === wrap) { close(); } });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(wrap);
    dialogOpen = true;
    hideMenu();

    var first = inputs[fields[0].key];
    if (first) { first.focus(); first.select(); }
  }

  /* 添加与编辑走同一个弹窗，校验不过就不产生任何方块/改动 */
  function openLinkDialog(item) {
    var isNew = !item;
    openDialog(isNew ? '添加站点' : '编辑主页', [
      {
        key: 'title', label: '名称', icon: 'type',
        value: isNew ? '' : item.title, placeholder: '留空自动用域名'
      },
      {
        key: 'url', label: '网址', icon: 'link',
        value: isNew ? '' : item.url, placeholder: 'example.com 或 https://example.com'
      }
    ], function (v) {
      var url = normalizeUrl(v.url);
      var title = (v.title || '').slice(0, 40) || hostOf(url);

      if (isNew) {
        var m = metrics();
        var spot = findSpot(UNIT_W, UNIT_H, m) || { x: 0, y: 0 };
        var ni = {
          id: uid(), type: 'link', title: title, url: url,
          x: spot.x, y: spot.y, w: UNIT_W, h: UNIT_H
        };
        state.items.push(ni);
        mountItem(ni);
        if (!reduced()) {
          ni.el.classList.add('tile-in');
          window.setTimeout(function () { ni.el.classList.remove('tile-in'); }, 300);
        }
        layoutAll();
        renderRows();
        scheduleSave();
        showTip('已添加「' + title + '」，右键它可改图标和尺寸', 3400);
      } else {
        item.title = title;
        item.url = url;
        refreshLink(item);
        renderRows();
        scheduleSave();
      }
    }, function (v) {
      if (!v.url) { return '请填写网址'; }
      if (!normalizeUrl(v.url)) { return '网址无效，请填 example.com 或 https://example.com'; }
      return '';
    });
  }

  function editLink(item) { openLinkDialog(item); }

  function editQuote(item) {
    openDialog('编辑文字', [
      { key: 'text', label: '文字', icon: 'type', value: item.text, placeholder: '写点什么' }
    ], function (v) {
      item.text = (v.text || '').slice(0, 120) || DEFAULT_QUOTE;
      item.txt.textContent = item.text;
      scheduleSave();
    });
  }

  function exportBackup() {
    var payload = {
      format: 'sudatab-backup',
      version: 1,
      app: 'SudaTab',
      exportedAt: new Date().toISOString(),
      state: serializeState()
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'sudatab-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);   /* 部分浏览器要求链接在文档里才触发下载 */
    a.click();
    if (a.parentNode) { a.parentNode.removeChild(a); }
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    showTip('已导出备份文件（含全部自定义图标）', 2600);
  }

  /* 导入：先完整校验、再确认、最后整体替换；任何一步失败都不碰现有布局 */
  function importBackup(file) {
    if (!file) { return; }
    if (file.size > 5 * 1024 * 1024) { showTip('备份文件过大（上限 5MB）', 4000); return; }

    var reader = new FileReader();
    reader.onerror = function () { showTip('备份文件读取失败', 3600); };
    reader.onload = function () {
      var payload;
      try { payload = JSON.parse(String(reader.result)); }
      catch (e) { showTip('这不是有效的 JSON 备份文件', 4000); return; }

      var raw = payload;
      if (payload && payload.format === 'sudatab-backup') {
        if (payload.version !== 1) {
          showTip('备份版本不兼容（version ' + payload.version + '）', 4000);
          return;
        }
        raw = payload.state;
      }
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || !raw.items.length) {
        showTip('备份内容无法识别：缺少 items', 4000);
        return;
      }

      var next;
      try { next = normalizeState(raw); }
      catch (e) { showTip('备份内容无法解析', 4000); return; }

      var n = next.items.filter(function (o) { return o.type === 'link'; }).length;
      openConfirm(
        '导入备份',
        '将用备份里的 ' + n + ' 个站点覆盖当前布局，自定义图标会一并恢复。导入后可点提示条「撤销」还原。',
        function () {
          pushUndo('导入备份', serializeState());
          applyState(next);
          undoTip('已导入备份（' + n + ' 个站点）');
        },
        '覆盖导入'
      );
    };
    reader.readAsText(file);
  }

  /* ---------------- 提示条 ---------------- */

  var tipTimer = 0;

  function showTip(msg, ms, action) {
    if (tipTimer) { clearTimeout(tipTimer); }
    hintEl.textContent = '';

    var span = document.createElement('span');
    span.textContent = msg;
    hintEl.appendChild(span);

    var hasAction = !!(action && action.label && action.fn);
    if (hasAction) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hint-action';
      b.textContent = action.label;
      b.addEventListener('click', function () {
        hintEl.classList.remove('show');
        action.fn();
      });
      hintEl.appendChild(b);
    }

    hintEl.classList.toggle('has-action', hasAction);
    hintEl.classList.add('show');
    tipTimer = window.setTimeout(function () {
      hintEl.classList.remove('show');
      tipTimer = 0;
    }, ms || 4200);
  }

  /* ---------------- 撤销 ---------------- */

  var undoEntry = null;   /* 只保留最近一次，够覆盖误删/误重置 */

  function pushUndo(label, snapshot) {
    undoEntry = { label: label, data: snapshot || serializeState() };
  }

  function doUndo() {
    if (!undoEntry) { showTip('没有可撤销的操作', 1800); return; }
    var label = undoEntry.label;
    var data = undoEntry.data;
    undoEntry = null;
    applyState(data);
    showTip('已撤销：' + label, 2600);
  }

  function undoTip(label) {
    showTip(label, 7000, { label: '撤销', fn: doUndo });
  }

  /* 用一份完整状态重建界面：导入 / 撤销 / 重置共用 */
  function applyState(s) {
    state = normalizeState(s);
    clearCanvas();
    COLS = state.cols || 24;

    var mx = 18;
    state.items.forEach(function (o) { mx = Math.max(mx, o.y + o.h); });
    BASE_ROWS = mx;

    state.items.forEach(mountItem);
    document.body.dataset.bg = state.bg;
    syncLockUI();
    layoutAll();
    renderRows();
    renderSwatches();
    renderEngines();
    renderDensity();
    paintClock();
    scheduleSave();
  }

  /* ---------------- 时钟 ---------------- */

  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function paintClock() {
    var now = new Date();
    var h24 = now.getHours();
    var mm = pad2(now.getMinutes());
    var t24 = pad2(h24) + ':' + mm;
    var h12 = h24 % 12;
    if (h12 === 0) { h12 = 12; }
    var t12 = (h24 < 12 ? '上午 ' : '下午 ') + h12 + ':' + mm;
    var d = (now.getMonth() + 1) + '月' + now.getDate() + '日　星期' + WEEK[now.getDay()];

    state.items.forEach(function (it) {
      if (it.type !== 'clock') { return; }
      var t = it.hour12 ? t12 : t24;
      if (it.time.textContent !== t) { it.time.textContent = t; }
      var showDate = (it.showDate !== false);
      it.date.style.display = showDate ? '' : 'none';
      if (showDate && it.date.textContent !== d) { it.date.textContent = d; }
    });

    var wait = 1000 - now.getMilliseconds();
    window.setTimeout(paintClock, wait < 60 ? wait + 1000 : wait);
  }

  /* ---------------- 搜索 ---------------- */

  function looksLikeUrl(v) {
    if (/^https?:\/\//i.test(v)) { return true; }
    if (/\s/.test(v)) { return false; }
    return /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(v) || /^localhost(:\d+)?/.test(v);
  }

  function currentEngine() {
    for (var i = 0; i < ENGINES.length; i++) {
      if (ENGINES[i].id === state.engine) { return ENGINES[i]; }
    }
    return ENGINES[0];
  }

  /* ---------------- 设置面板 ---------------- */

  function openDrawer() {
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.hidden = false;
    requestAnimationFrame(function () { scrim.classList.add('is-open'); });
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    scrim.classList.remove('is-open');
    window.setTimeout(function () {
      if (!drawer.classList.contains('is-open')) { scrim.hidden = true; }
    }, 280);
  }

  function renderSwatches() {
    elSwatches.textContent = '';
    BACKGROUNDS.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch' + (state.bg === b.id ? ' is-active' : '');
      btn.dataset.bg = b.id;
      btn.setAttribute('aria-label', b.name);
      var sp = document.createElement('span');
      sp.textContent = b.name;
      btn.appendChild(sp);
      btn.addEventListener('click', function () { setBg(b.id); });
      elSwatches.appendChild(btn);
    });
  }

  function renderEngines() {
    elSeg.textContent = '';
    ENGINES.forEach(function (e) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seg' + (state.engine === e.id ? ' is-active' : '');
      btn.textContent = e.name;
      btn.addEventListener('click', function () {
        state.engine = e.id;
        scheduleSave();
        renderEngines();
      });
      elSeg.appendChild(btn);
    });
  }

  /* ---- 网格密度 ---- */

  function renderDensity() {
    elDensity.textContent = '';
    DENSITIES.forEach(function (n) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seg' + (COLS === n ? ' is-active' : '');
      btn.textContent = n + ' 列';
      btn.setAttribute('aria-label', n + ' 列');
      btn.addEventListener('click', function () { setDensity(n); });
      elDensity.appendChild(btn);
    });

    var m = metrics();
    var unit = UNIT_W * m.colW + (UNIT_W - 1) * GAP;
    elDensityHint.textContent = '方块约 ' + Math.round(unit) + ' px';
  }

  /* 把站点方块按行重新打包，每行居中；返回打包结束后的下一行 */
  function repackLinks(startY) {
    var links = state.items.filter(function (o) { return o.type === 'link'; });
    if (!links.length) { return startY; }

    var rowsArr = [], cur = [], curW = 0;
    links.forEach(function (it) {
      if (curW + it.w > COLS && cur.length) {
        rowsArr.push(cur);
        cur = [];
        curW = 0;
      }
      cur.push(it);
      curW += it.w;
    });
    if (cur.length) { rowsArr.push(cur); }

    var y = startY;
    rowsArr.forEach(function (row) {
      var total = 0;
      row.forEach(function (it) { total += it.w; });
      var x = Math.max(0, Math.round((COLS - total) / 2));
      var rowH = 0;
      row.forEach(function (it) {
        it.x = x;
        it.y = y;
        x += it.w;
        rowH = Math.max(rowH, it.h);
      });
      y += rowH;
    });
    return y;
  }

  function setDensity(newCols) {
    if (newCols === COLS) { return; }

    var k = newCols / COLS;

    /* 时钟 / 搜索 / 引语 按比例缩放横向位置和宽度 */
    state.items.forEach(function (it) {
      if (it.type === 'link') { return; }
      var min = MIN_SIZE[it.type] || { w: 1, h: 1 };
      it.w = Math.max(min.w, Math.round(it.w * k));
      it.x = Math.round(it.x * k);
      if (it.x + it.w > newCols) { it.x = Math.max(0, newCols - it.w); }
    });

    COLS = newCols;
    state.cols = newCols;

    /* 站点方块必然重叠，重新打包 */
    var startY = 1;
    state.items.forEach(function (o) {
      if (o.type === 'clock' || o.type === 'search') {
        startY = Math.max(startY, o.y + o.h + 1);
      }
    });

    var endY = repackLinks(startY);

    var quote = null;
    state.items.forEach(function (o) { if (o.type === 'quote') { quote = o; } });
    if (quote) { quote.y = Math.min(endY + 1, 200); }

    var maxBottom = 18;
    state.items.forEach(function (o) { maxBottom = Math.max(maxBottom, o.y + o.h); });
    BASE_ROWS = maxBottom;

    layoutAll();
    renderDensity();
    scheduleSave();
  }

  function renderRows() {
    elRows.textContent = '';
    state.items.forEach(function (item) {
      if (item.type !== 'link') { return; }

      var row = document.createElement('div');
      row.className = 'link-row';

      var t = document.createElement('input');
      t.type = 'text';
      t.value = item.title;
      t.placeholder = '名称';
      t.addEventListener('change', function () {
        item.title = t.value.trim().slice(0, 40) || hostOf(item.url);
        t.value = item.title;
        refreshLink(item);
        scheduleSave();
      });

      var u = document.createElement('input');
      u.type = 'text';
      u.value = item.url;
      u.placeholder = 'https://';
      u.spellcheck = false;
      u.addEventListener('change', function () {
        var v = normalizeUrl(u.value);
        if (!v) {
          u.value = item.url;
          showTip('网址无效，已保留原来的地址', 2800);
          return;
        }
        item.url = v;
        u.value = v;
        refreshLink(item);       /* 换网址后图标要跟着换 */
        scheduleSave();
      });

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rm';
      rm.textContent = '×';
      rm.title = '删除';
      rm.addEventListener('click', function () { removeItem(item.id); });

      row.appendChild(t);
      row.appendChild(u);
      row.appendChild(rm);
      elRows.appendChild(row);
    });
  }

  function addLink() { openLinkDialog(null); }

  /* ---------------- 事件 ---------------- */

  document.getElementById('btnSettings').addEventListener('click', openDrawer);
  document.getElementById('btnLock').addEventListener('click', toggleLock);
  document.getElementById('btnClose').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.getElementById('btnAddLink').addEventListener('click', addLink);

  /* 只重排坐标，不删用户添加的站点、不丢自定义图标 */
  document.getElementById('btnResetLayout').addEventListener('click', function () {
    openConfirm(
      '重置位置',
      '把所有方块放回默认位置和尺寸。你添加的站点、名称和自定义图标都会保留。',
      function () {
        pushUndo('重置位置', serializeState());
        var next = serializeState();
        var perRow = Math.max(1, Math.min(PER_ROW, Math.floor(COLS / UNIT_W)));
        var li = 0;
        next.items.forEach(function (o) {
          if (o.type === 'clock')  { o.x = 8;  o.y = 1;  o.w = 8;  o.h = 4; }
          if (o.type === 'search') { o.x = 6;  o.y = 6;  o.w = 12; o.h = 2; }
          if (o.type === 'quote')  { o.x = 6;  o.y = 17; o.w = 12; o.h = 1; }
          if (o.type === 'link') {
            var c = li % perRow, r = Math.floor(li / perRow);
            o.x = Math.round((COLS - perRow * UNIT_W) / 2) + c * UNIT_W;
            o.y = ROW_START + r * UNIT_H;
            o.w = UNIT_W; o.h = UNIT_H;
            li++;
          }
        });
        var quoteY = ROW_START + Math.ceil(li / perRow) * UNIT_H;
        next.items.forEach(function (o) { if (o.type === 'quote') { o.y = quoteY; } });
        applyState(next);
        undoTip('已重置所有方块的位置和大小');
      },
      '重置位置'
    );
  });

  document.getElementById('btnExport').addEventListener('click', exportBackup);

  var fileImport = document.getElementById('fileImport');
  document.getElementById('btnImport').addEventListener('click', function () { fileImport.click(); });
  fileImport.addEventListener('change', function () {
    var f = fileImport.files && fileImport.files[0];
    fileImport.value = '';        /* 允许连续导入同一个文件 */
    importBackup(f);
  });

  document.getElementById('btnReset').addEventListener('click', function () {
    openConfirm(
      '恢复全部默认',
      '会清掉自定义站点、图标、布局和设置，回到初始状态。此操作可以撤销。',
      function () {
        pushUndo('恢复全部默认', serializeState());
        applyState(defaultState());
        undoTip('已恢复全部默认');
      },
      '恢复默认'
    );
  });

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      openFinder();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) { return; }
      if (!dialogOpen && undoEntry) { e.preventDefault(); doUndo(); return; }
    }
    if (e.key !== 'Escape') { return; }
    if (dialogOpen) { return; }
    if (!menu.hidden) { hideMenu(); return; }
    if (drawer.classList.contains('is-open')) { closeDrawer(); }
  });

  /* 空白处右键：环境菜单 */
  canvas.addEventListener('contextmenu', function (e) {
    if (e.target !== canvas && e.target !== overlay) { return; }
    e.preventDefault();
    showCanvasMenu(e.clientX, e.clientY);
  });

  var rafId = 0;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(layoutAll);
  });

  /* ---------------- 启动 ---------------- */

  function boot() {
    COLS = state.cols || 24;

    var mx = 18;
    state.items.forEach(function (o) { mx = Math.max(mx, o.y + o.h); });
    BASE_ROWS = mx;

    canvas.textContent = '';
    canvas.appendChild(overlay);
    state.items.forEach(mountItem);
    document.body.dataset.bg = state.bg;
    syncLockUI();
    layoutAll();
    renderRows();
    renderSwatches();
    renderEngines();
    renderDensity();
    paintClock();
  }

  store.load(function (saved, notice) {
    state = normalizeState(saved);
    boot();
    if (!saved) { store.save(serializeState()); }

    if (notice) {
      showTip(notice + '，已临时载入默认布局；原数据已另存一份，请先导出备份再排查。', 9000);
    }

    /* 出过读取错误时不要弹首次引导，否则会把「数据损坏」提示顶掉 */
    if (!state.tipShown && !notice) {
      state.tipShown = true;
      window.setTimeout(function () { showTip('直接拖动方块换位置 · 右键调大小', 4600); }, 900);
      scheduleSave();
    }
  });
})();
