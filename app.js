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

  /* 外观默认值。这些都能在设置面板里调，并随 state 持久化：
       gapX / gapY  方块之间的横向、纵向间距（px）
       radius       图标圆角（占方块边长的百分比，0 = 直角）
       labelScale   名称字号倍数 */
  var TUNE = { gapX: 12, gapY: 18, radius: 24, iconScale: 1, labelScale: 1 };

  var TUNE_KEYS = [
    { key: 'gapX',       name: '横向间距', min: 6,    max: 32,  step: 1,    unit: 'px', def: 12 },
    { key: 'gapY',       name: '纵向间距', min: 8,    max: 56,  step: 1,    unit: 'px', def: 18 },
    { key: 'radius',     name: '图标圆角', min: 0,    max: 50,  step: 1,    unit: '%',  def: 24 },
    /* 1×1 的图标不一定要把图案铺满整格：抓来的 favicon 常常自带留白，
       缩一点反而更整齐。缩的是图里那层图案，底板和格子始终不动。
       100% = 图案铺满（默认）。 */
    { key: 'iconScale',  name: 'Logo 大小', min: 0.6,  max: 1,   step: 0.02, unit: '%',  def: 1 },
    { key: 'labelScale', name: '图标字号', min: 0.75, max: 1.6, step: 0.05, unit: '×',  def: 1 }
  ];

  var DENSITIES = [16, 24, 32, 40];

  var UNIT_W = 2;   /* 一个方块宽 = 2 列 */
  var UNIT_H = 3;   /* 一个方块高 = 3 行（行高由列宽推导，保证正方） */

  /* 视口再矮也至少保留这么多行，多出来的部分纵向滚动 */
  var BASE_ROWS = 18;

  /* 搜索引擎：tpl 里的 %s 换成编码后的关键词（自定义引擎也遵守这条）。
     home 只用来取品牌图标，color 是取不到图标时的字母底色。 */
  var ENGINES = [
    { id: 'bing',   name: '必应',       short: '必', color: '#0A7CFF',
      home: 'https://www.bing.com',   tpl: 'https://www.bing.com/search?q=%s' },
    { id: 'baidu',  name: '百度',       short: '百', color: '#2932E1',
      home: 'https://www.baidu.com',  tpl: 'https://www.baidu.com/s?wd=%s' },
    { id: 'google', name: 'Google',     short: 'G',  color: '#4285F4',
      home: 'https://www.google.com', tpl: 'https://www.google.com/search?q=%s' },
    { id: 'github', name: 'GitHub',     short: 'G',  color: '#24292F',
      home: 'https://github.com',     tpl: 'https://github.com/search?q=%s' },
    { id: 'zhihu',  name: '知乎',       short: '知', color: '#0084FF',
      home: 'https://www.zhihu.com',  tpl: 'https://www.zhihu.com/search?q=%s' },
    { id: 'ddg',    name: 'DuckDuckGo', short: 'D',  color: '#DE5833',
      home: 'https://duckduckgo.com', tpl: 'https://duckduckgo.com/?q=%s' }
  ];

  /* 自定义引擎最多留 12 个：再多引擎行就挤成一排小点了 */
  var MY_ENGINE_MAX = 12;

  function allEngines() {
    return ENGINES.concat(Array.isArray(state.myEngines) ? state.myEngines : []);
  }

  function engineById(id) {
    var list = allEngines();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { return list[i]; }
    }
    return null;
  }

  function currentEngine() {
    return engineById(state.engine) || ENGINES[0];
  }

  /* 搜索地址：%s 处换成编码后的关键词；自定义引擎漏写 %s 的就补在末尾 */
  function engineUrl(e, q) {
    var t = (e && e.tpl) || ENGINES[0].tpl;
    return t.indexOf('%s') >= 0 ? t.replace('%s', encodeURIComponent(q)) : t + encodeURIComponent(q);
  }

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

  /* 外观参数统一入口：非法/缺失回落到默认值，再夹进合法区间 */
  function tuneNum(v, def, lo, hi) {
    var n = Number(v);
    if (!isFinite(n)) { n = def; }
    return clamp(n, lo, hi);
  }

  function tuneOf(key) {
    for (var i = 0; i < TUNE_KEYS.length; i++) {
      if (TUNE_KEYS[i].key === key) { return TUNE_KEYS[i]; }
    }
    return null;
  }

  /* 全局字号统一出口（滑杆上下限都从 TUNE_KEYS 取，避免两处写死不一致） */
  function labelScaleValue() {
    var t = tuneOf('labelScale');
    return tuneNum(state.labelScale, t.def, t.min, t.max);
  }

  /* 1×1 图标相对整格的比例；1 = 铺满 */
  function iconScaleValue() {
    var t = tuneOf('iconScale');
    return tuneNum(state.iconScale, t.def, t.min, t.max);
  }

  /* 纵向间距的下限：3 个行距之间的空隙里要能放下「名称行 + 一点呼吸位」 */
  function gapYFloor(gapX) {
    var ls = labelScaleValue();
    return Math.ceil((2 * gapX + 21 * ls + 8) / 3);
  }

  /* ---- 单块外观覆盖 ----
       bgColor   底色 / 1×1 的图标垫色，'' = 跟随壁纸
       fgColor   名称颜色，'' = 自动（有底色时按底色明暗取黑/白）
       fontScale 名称字号倍数，1 = 跟随设置里的全局字号
       iconZoom  这一块里图案的缩放，1 = 铺满；只缩图里的图案，底板不动 */
  var TONE_FS = { min: 0.7, max: 1.8, def: 1 };
  /* 只开放缩小：图案已经铺满底线，再放大会溢出到相邻格子里 */
  var TONE_ZOOM = { min: 0.5, max: 1, step: 0.02, def: 1 };

  function itemFontScale(it) {
    return tuneNum(it && it.fontScale, TONE_FS.def, TONE_FS.min, TONE_FS.max);
  }

  function itemZoom(it) {
    return tuneNum(it && it.iconZoom, TONE_ZOOM.def, TONE_ZOOM.min, TONE_ZOOM.max);
  }

  function itemUnits(it) {
    return (it.w / UNIT_W) * (it.h / UNIT_H);
  }

  /* 只收 #rrggbb：颜色选择器、备份导入、手改 localStorage 都走这里 */
  function safeHexColor(v) {
    return (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()))
      ? v.trim().toLowerCase() : '';
  }

  function hexLum(hex) {
    var c = hex.replace('#', '');
    var lin = [0, 2, 4].map(function (i) {
      var n = parseInt(c.slice(i, i + 2), 16) / 255;
      return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  /* 底色定了以后，名称颜色自动挑对比度更高的那一头 */
  function contrastOn(hex) { return hexLum(hex) > 0.5 ? '#101418' : '#ffffff'; }

  function hexOf(r, g, b) {
    var h = function (n) {
      var s = Math.round(clamp(n, 0, 255)).toString(16);
      return s.length < 2 ? '0' + s : s;
    };
    return '#' + h(r) + h(g) + h(b);
  }

  /* 两个颜色「看起来差不多」：取色板时用来合并相邻色格 */
  function nearColor(a, b, tol) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.slice(i, i + 2), 16); });
    var pb = [1, 3, 5].map(function (i) { return parseInt(b.slice(i, i + 2), 16); });
    return Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2])) <= tol;
  }

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

    items.push({ id: 'clock',  type: 'clock',  x: 8, y: 1, w: 8,  h: 4 });
    items.push({ id: 'search', type: 'search', x: 6, y: 6, w: 12, h: 3 });

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

    return {
      bg: 'aurora', engine: 'bing', myEngines: [], cols: 24, locked: false, tipShown: false,
      gapX: TUNE.gapX, gapY: TUNE.gapY,
      radius: TUNE.radius, iconScale: TUNE.iconScale, labelScale: TUNE.labelScale,
      items: items
    };
  }

  /* ---------------- 状态归一化 ---------------- */

  function cleanItem(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') { return null; }
    var t = raw.type;
    if (['clock', 'search', 'quote', 'link'].indexOf(t) < 0 && !widgetSpec(t)) { return null; }

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

      /* 单块外观覆盖：非法值直接丢弃，回到「跟随全局」 */
      it.bgColor = safeHexColor(raw.bgColor);
      it.fgColor = safeHexColor(raw.fgColor);
      it.fontScale = tuneNum(raw.fontScale, TONE_FS.def, TONE_FS.min, TONE_FS.max);
      it.iconZoom = tuneNum(raw.iconZoom, TONE_ZOOM.def, TONE_ZOOM.min, TONE_ZOOM.max);
    }
    if (t === 'quote') {
      it.text = typeof raw.text === 'string' ? raw.text.slice(0, 120) : DEFAULT_QUOTE;
    }
    if (t === 'clock') {
      /* 老数据把 hour12 / showDate 挂在顶层，这里一并迁进 look */
      it.look = cleanClockLook(raw.look, raw);
    }
    if (t === 'search') {
      /* 没有 look 的是老数据，留 null 好让迁移认出来 */
      it.look = cleanSearchLook(raw.look);
    }
    if (widgetSpec(t)) {
      it.data = cleanWidgetData(t, raw.data);
      it.look = cleanCardLook(raw.look);
    }
    return it;
  }

  function cleanMyEngines(raw) {
    if (!Array.isArray(raw)) { return []; }
    var out = [];
    raw.forEach(function (e) {
      if (!e || typeof e !== 'object') { return; }
      var name = (typeof e.name === 'string' ? e.name : '').trim().slice(0, 12);
      var tpl = typeof e.tpl === 'string' ? normalizeUrl(e.tpl.trim()) : '';
      if (!name || !tpl) { return; }
      if (tpl.indexOf('%s') < 0) {
        tpl += (tpl.indexOf('?') >= 0 ? '' : '?q=') + '%s';
      }
      out.push({
        id: 'my-' + (out.length + 1),
        name: name,
        short: name.charAt(0),
        color: safeHexColor(e.color) || MY_ENGINE_COLORS[out.length % MY_ENGINE_COLORS.length],
        home: '',
        tpl: tpl,
        my: true
      });
    });
    return out.slice(0, MY_ENGINE_MAX);
  }

  /* 老数据的搜索框只有 2 个行高（≈62px），放不下引擎行。
     一次性加高到 3 行；会撞到别的东西就不动，交给用户自己拉高 */
  function growSearchForDock(items) {
    items.forEach(function (it) {
      if (it.type !== 'search' || it.look || it.h >= 3) { return; }
      var box = { x: it.x, y: it.y, w: it.w, h: 3 };
      var hit = items.some(function (o) {
        return o.id !== it.id && intersect(box, o);
      });
      if (!hit) { it.h = 3; }
    });
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

    /* 旧布局里停在半格位置的图标，载入时拉回格点 */
    alignLinksToCell(items);
    /* 老数据的搜索框加高一行，给引擎行腾地方 */
    growSearchForDock(items);

    var my = cleanMyEngines(s.myEngines);
    var engIds = ENGINES.concat(my).map(function (e) { return e.id; });

    return {
      bg: BACKGROUNDS.some(function (b) { return b.id === s.bg; }) ? s.bg : d.bg,
      engine: engIds.indexOf(s.engine) >= 0 ? s.engine : d.engine,
      myEngines: my,
      cols: DENSITIES.indexOf(s.cols) >= 0 ? s.cols : d.cols,
      locked: !!s.locked,
      tipShown: !!s.tipShown,
      gapX: tuneNum(s.gapX, TUNE.gapX, 6, 32),
      gapY: tuneNum(s.gapY, TUNE.gapY, 8, 56),
      radius: tuneNum(s.radius, TUNE.radius, 0, 50),
      iconScale: tuneNum(s.iconScale, TUNE.iconScale, 0.6, 1),
      labelScale: tuneNum(s.labelScale, TUNE.labelScale, 0.75, 1.6),
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
      c.bgColor = o.bgColor || '';
      c.fgColor = o.fgColor || '';
      c.fontScale = o.fontScale || TONE_FS.def;
      c.iconZoom = o.iconZoom || TONE_ZOOM.def;
    } else if (o.type === 'quote') {
      c.text = o.text || DEFAULT_QUOTE;
    } else if (o.type === 'clock') {
      c.look = clockLookPatch(clockLook(o));
    } else if (o.type === 'search') {
      /* 只存改过的项：默认值不写进存储，备份文件干净也方便以后调默认 */
      var lk = o.look || {};
      var out = {};
      Object.keys(SEARCH_LOOK).forEach(function (k) {
        if (lk[k] != null && lk[k] !== SEARCH_LOOK[k]) { out[k] = lk[k]; }
      });
      c.look = out;
    }
    var spec = widgetSpec(o.type);
    if (spec) {
      c.data = spec.clean ? spec.clean(o.data || {}) : (o.data || {});
      var ck = cardPatch(cardLook(o));
      if (Object.keys(ck).length) { c.look = ck; }
    }
    return c;
  }

  function serializeState() {
    return {
      bg: state.bg,
      engine: state.engine,
      myEngines: (state.myEngines || []).map(function (e) {
        return { name: e.name, tpl: e.tpl, color: e.color };
      }),
      cols: state.cols,
      locked: !!state.locked,
      tipShown: !!state.tipShown,
      gapX: state.gapX,
      gapY: state.gapY,
      radius: state.radius,
      iconScale: state.iconScale,
      labelScale: state.labelScale,
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
  var elTune = document.getElementById('tuneList');
  var tuneInputs = {};   /* key -> { input, out } 当前渲染的滑杆 */

  /* ---------------- 几何 ---------------- */

  function metrics() {
    var W = canvas.clientWidth;
    var H = canvas.clientHeight;

    var gapX = tuneNum(state.gapX, TUNE.gapX, 6, 32);
    /* 纵向间距有个下限：行间空隙必须放得下挂在方块下方的名称，
       否则把间距拉到最小的时候名字会压到下一行的图标上 */
    var gapY = Math.max(tuneNum(state.gapY, TUNE.gapY, 8, 56), gapYFloor(gapX));

    var colW = (W - gapX * (COLS - 1)) / COLS;

    /* 极端密度下（40 列 + 大间距）间距会把格子本身吃光：
       按「1×1 必须还是正方」解出间距上限，回收一次再算 */
    var rowH = (2 * colW - gapX) / 3;
    if (rowH < 6 && COLS > 1) {
      var cap = (2 * W / COLS - 18) * COLS / (3 * COLS - 2);
      gapX = Math.max(3, Math.min(gapX, cap));
      colW = (W - gapX * (COLS - 1)) / COLS;
      rowH = Math.max(6, (2 * colW - gapX) / 3);
    }
    if (rowH < 6) { rowH = 6; }

    var stepX = colW + gapX;

    /* 纵向必须和「方块永远是正方」自洽：
         一个方块 = 2 列 × 3 行 = 3rowH + 2gapX，
         行与行之间的真实空隙 rowGap 由 gapY 换算（滑杆手感不变），
         再把 rowGap 平摊进这 3 行得到纵向步长。
       于是任意 h 行的方块高度 = h*stepY - rowGap：
       底边一定落在下一行的顶线上，2 格高的方块也不再「缩」在两个行距之间。 */
    var unit = UNIT_W * colW + (UNIT_W - 1) * gapX;
    var rowGap = Math.max(rowH * 0.5, UNIT_H * gapY - (UNIT_H - 1) * gapX);
    var stepY = (unit + rowGap) / UNIT_H;
    var viewRows = Math.floor((H + rowGap) / stepY);
    var rows = Math.max(4, viewRows, BASE_ROWS);

    return {
      W: W, H: H, colW: colW, rowH: rowH, unit: unit,
      rows: rows, viewRows: viewRows,
      stepX: stepX, stepY: stepY, rowGap: rowGap,
      gapX: gapX, gapY: gapY
    };
  }

  function rectOf(b, m) {
    /* 站点方块按「占几行」算高：h 是 3 的倍数，h*stepY - rowGap 正好是
       若干个整方块叠起来，底边一定落在下一行的顶线上。
       部件（时钟 / 搜索 / 引语）只占 1~2 个细行，这个值会小于
       「行高 + 间距」的直观高度，所以取两者的大者，绝不把内容压小。 */
    var fill = b.h * m.stepY - m.rowGap;
    var byRows = b.h * m.rowH + (b.h - 1) * m.gapX;
    return {
      left: b.x * m.stepX,
      top: b.y * m.stepY,
      width: b.w * m.colW + (b.w - 1) * m.gapX,
      height: b.type === 'link' ? Math.max(fill, m.rowH) : Math.max(byRows, fill)
    };
  }

  /* ---------------- 格点对齐 ----------------
     图标方块只能站在「格」上：横向 2 列、纵向 3 行（= 一个方块的大小）。
     不然拖完会停在半格位置，和旁边同一排的图标错开半条，看着就是没对齐。
     横向的奇偶取自现有图标的多数（默认布局是 5/7/9… 奇数），
     这样吸附只把跑偏的拉回来，不会把已经摆好的一整排整体挪位。 */
  function cellOriginX(list) {
    var odd = 0, even = 0;
    (list || state.items).forEach(function (o) {
      if (o.type !== 'link') { return; }
      if (Math.abs(o.x % UNIT_W) < 0.001) { even++; } else { odd++; }
    });
    return odd > even ? 1 : 0;
  }

  function snapCellX(x, w, origin, cols) {
    origin = origin || 0;
    var maxX = (cols || COLS) - w;
    var v = origin + Math.round((x - origin) / UNIT_W) * UNIT_W;
    if (v > maxX) { v = origin + Math.floor((maxX - origin) / UNIT_W) * UNIT_W; }
    return Math.max(0, v);
  }

  function snapCellY(y, h, limit) {
    var maxY = (typeof limit === 'number' ? limit : 4096) - h;
    var v = Math.round(y / UNIT_H) * UNIT_H;
    if (v > maxY) { v = Math.floor(maxY / UNIT_H) * UNIT_H; }
    return Math.max(0, v);
  }

  /* 旧数据里停在半格位置的图标，载入时拉回格点。
     目标位置被占就换一个候选，全被占就留在原处——宁可它自己歪着，
     也不能为了对齐把别人的布局整块拆散。 */
  function alignLinksToCell(items) {
    var origin = cellOriginX(items);
    items.forEach(function (o) {
      if (o.type !== 'link') { return; }
      var xOk = (Math.abs(o.x % UNIT_W) < 0.001) === (origin === 0);
      var yOk = Math.abs(o.y % UNIT_H) < 0.001;
      if (xOk && yOk) { return; }

      /* 载入时 COLS 还是上一次的值，这里不按列数收边界（4096 = 不限制） */
      var nx = snapCellX(o.x, o.w, origin, 4096);
      var ny = snapCellY(o.y, o.h);
      var cands = [[nx, ny], [nx, ny + UNIT_H], [nx, ny - UNIT_H],
                   [nx + UNIT_W * (o.x >= nx ? 1 : -1), ny],
                   [nx + UNIT_W * (o.x >= nx ? -1 : 1), ny]];

      for (var i = 0; i < cands.length; i++) {
        var cx = cands[i][0], cy = cands[i][1];
        if (cx < 0 || cy < 0) { continue; }
        var box = { x: cx, y: cy, w: o.w, h: o.h };
        var hit = items.some(function (p) {
          return p !== o && intersect(box, p);
        });
        if (hit) { continue; }
        o.x = cx;
        o.y = cy;
        break;
      }
    });
  }

  /* ---------------- 占位推挤 ---------------- */

  /* iOS 式就近挤入排布（替代原来的整列下推）：
     把目标格让给拖动块，被挡住的方块从原位置向外一圈圈找最近的空位挪开。
     返回完整坐标表；实在放不下返回 null，调用方据此弹回。
     只算坐标，不改 state 也不改 DOM。 */
  function plan(it, box, m) {
    /* 必须和 layoutAll 的可视行数一致：排到屏幕外再被拉回来，就会压住下面的人 */
    var rowsLimit = m.rows;
    var cols = COLS;

    var all = state.items.map(function (o) {
      var b = o.id === it.id
        ? { x: box.x, y: box.y, w: box.w, h: box.h }
        : { x: o.x, y: o.y, w: o.w, h: o.h };
      /* 图标方块按「整格」挪（2 列 / 3 行），被挤开之后也还站在格点上；
         时钟/搜索/引语这些按 1 列 1 行微调，保留原来的灵活度 */
      return { id: o.id, x: b.x, y: b.y, w: b.w, h: b.h, ox: o.x, oy: o.y,
               cell: o.type === 'link' };
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
      var sx = o.cell ? UNIT_W : 1;
      var sy = o.cell ? UNIT_H : 1;
      for (var r = 0; r <= maxR; r++) {
        var best = null, bestCost = Infinity;
        for (var dy = -r; dy <= r; dy++) {
          for (var dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) { continue; }
            var x = o.ox + dx * sx, y = o.oy + dy * sy;
            if (x < 0 || y < 0 || x + o.w > cols || y + o.h > rowsLimit) { continue; }
            var b = { x: x, y: y, w: o.w, h: o.h };
            if (blocked(b, o.id)) { continue; }
            var cost = Math.abs(dx) * sx + Math.abs(dy) * sy * 1.35;
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

  function findSpot(w, h, m, cell) {
    /* cell=true 时只沿格点走，新增的图标一落地就和已有的一排对齐 */
    var sx = cell ? UNIT_W : 1;
    var sy = cell ? UNIT_H : 1;
    var x0 = cell ? cellOriginX() : 0;
    for (var y = 0; y + h <= m.rows; y += sy) {
      for (var x = x0; x + w <= COLS; x += sx) {
        var box = { x: x, y: y, w: w, h: h };
        var hit = state.items.some(function (o) { return intersect(box, o); });
        if (!hit) { return box; }
      }
    }
    return null;
  }

  /* 就近找一个空位（改尺寸实在推不开时用）：按到原位置的距离取最小，
     不能直接用 findSpot —— 它从左上角开始扫，会把方块弹到屏幕另一头 */
  function findSpotNear(w, h, m, cell, originX, originY, ignoreId) {
    var sx = cell ? UNIT_W : 1;
    var sy = cell ? UNIT_H : 1;
    var x0 = cell ? cellOriginX() : 0;
    var best = null;
    var bestCost = Infinity;

    for (var y = 0; y + h <= m.rows; y += sy) {
      for (var x = x0; x + w <= COLS; x += sx) {
        var box = { x: x, y: y, w: w, h: h };
        var hit = state.items.some(function (o) {
          return o.id !== ignoreId && intersect(box, o);
        });
        if (hit) { continue; }
        var cost = Math.abs(x - originX) * sx + Math.abs(y - originY) * sy * 1.35;
        if (cost < bestCost) { bestCost = cost; best = box; }
      }
    }
    return best;
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

  /* ---------------- 图标缓存 ----------------
     图标只该抓一次。之前每次打开新标签页，所有方块都从候选链第一个重新试一遍，
     被墙的候选还要各等 3 秒，图标就一直「不显示」。这里把抓成功的地址按域名记下来，
     下次直接用；确认过「一个源都抓不到」的也记一笔，半小时内不再让用户干等。 */
  var ICON_CACHE_KEY = 'sudatab.icons.v1';
  var ICON_CACHE_MAX = 400;
  var ICON_FAIL_TTL = 30 * 60 * 1000;

  var iconCache = readIconCache();
  var iconSaveTimer = 0;

  function readIconCache() {
    var out = {};
    try {
      var raw = window.localStorage.getItem(ICON_CACHE_KEY);
      var j = raw ? JSON.parse(raw) : null;
      if (!j || typeof j !== 'object') { return out; }
      Object.keys(j).forEach(function (k) {
        var v = j[k];
        /* 兼容最早期「直接存地址字符串」的写法 */
        if (typeof v === 'string') { out[k] = { s: v, t: 0 }; return; }
        if (v && typeof v === 'object' && typeof v.s === 'string') {
          out[k] = { s: v.s, t: Number(v.t) || 0 };
        }
      });
    } catch (e) {}
    return out;
  }

  function persistIconCache() {
    window.clearTimeout(iconSaveTimer);
    iconSaveTimer = window.setTimeout(function () {
      iconSaveTimer = 0;
      try {
        var keys = Object.keys(iconCache);
        if (keys.length > ICON_CACHE_MAX) {
          keys.sort(function (a, b) { return (iconCache[a].t || 0) - (iconCache[b].t || 0); });
          keys.forEach(function (k, i) { if (i < keys.length - ICON_CACHE_MAX) { delete iconCache[k]; } });
        }
        var o = {};
        Object.keys(iconCache).forEach(function (k) { o[k] = iconCache[k]; });
        window.localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(o));
      } catch (e) {}
    }, 240);
  }

  function iconKeyOf(url) {
    var h = hostOf(url);
    return h ? 'h:' + h : 'u:' + String(url || '').slice(0, 200);
  }

  /* 命中返回 { s, t }；s 为空串表示「最近一轮全挂」，t 过期就不再拦 */
  function iconMemoOf(url) {
    var k = iconKeyOf(url);
    var e = iconCache[k];
    if (!e) { return null; }
    if (e.s) { return e; }
    if (Date.now() - (e.t || 0) < ICON_FAIL_TTL) { return e; }
    delete iconCache[k];
    return null;
  }

  function iconRemember(url, src) {
    var k = iconKeyOf(url);
    var val = src || '';
    var old = iconCache[k];
    if (old && old.s === val) { return; }
    iconCache[k] = { s: val, t: Date.now() };
    persistIconCache();
  }

  function iconForget(url) {
    var k = iconKeyOf(url);
    if (!iconCache[k]) { return; }
    delete iconCache[k];
    persistIconCache();
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
      /* 手动抓到的也进缓存，之后自动模式直接用它 */
      iconRemember(url, hits[0].src);
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

  /* ---- 图片自带的留白 → 自动撑满 ----
     抓来的 favicon 常常把 logo 画在中间、四周留一圈透明边；上传的应用图标
     也常带 10% 的透明边距。整张图缩放到格子时，这些留白就变成了「没铺满」。
     这里按像素量一次内容边界（透明底看 alpha，纯色底看与四角的色差），
     再用 transform 把内容放大到贴满容器；容器 overflow 裁掉多出来的部分。
     读不到像素（跨域图）就原样不动 —— 这是浏览器的同源策略，不是没做。 */
  var fitMemo = new Map();

  function contentBox(im) {
    var key = im.currentSrc || im.src || '';
    if (!key) { return null; }
    if (fitMemo.has(key)) { return fitMemo.get(key); }

    var out = null;
    try {
      var S = 96;
      var cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      var cx = cv.getContext('2d', { willReadFrequently: true });
      cx.clearRect(0, 0, S, S);
      cx.drawImage(im, 0, 0, S, S);
      var px = cx.getImageData(0, 0, S, S).data;

      function at(x, y) {
        var i = (y * S + x) * 4;
        return [px[i], px[i + 1], px[i + 2], px[i + 3]];
      }

      /* 只认「透明留白」这一种。四角都是不透明色的图，说明图自己就是一整块
         底板（白卡 / 整块色块），放大只会把这块板裁掉一圈，所以一律不动 */
      var cn = [at(0, 0), at(S - 1, 0), at(0, S - 1), at(S - 1, S - 1)];
      var bg = cn[0];
      var solid = cn.every(function (c) {
        return c[3] > 240 &&
          Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) < 40;
      });
      if (solid) {
        fitMemo.set(key, null);
        return null;
      }

      var x0 = S, y0 = S, x1 = -1, y1 = -1;
      for (var y = 0; y < S; y++) {
        for (var x = 0; x < S; x++) {
          var p = at(x, y);
          if (p[3] <= 12) { continue; }
          if (x < x0) { x0 = x; }
          if (x > x1) { x1 = x; }
          if (y < y0) { y0 = y; }
          if (y > y1) { y1 = y; }
        }
      }

      if (x1 >= x0) {
        var bw = (x1 - x0 + 1) / S, bh = (y1 - y0 + 1) / S;
        /* 内容太小可能是误判（比如整张纯色），太满则没必要动 */
        if (bw > 0.25 && bh > 0.25 && (bw < 0.985 || bh < 0.985)) {
          out = {
            bw: bw, bh: bh,
            cx: (x0 + x1 + 1) / 2 / S,
            cy: (y0 + y1 + 1) / 2 / S
          };
        }
      }
    } catch (e) {
      /* 跨域图被 canvas 判污染：不是「没有留白」，而是「量不了」。
         交给后台把字节取回来再量一次 */
      out = false;
    }

    if (fitMemo.size > 400) { fitMemo.clear(); }
    fitMemo.set(key, out);
    return out;
  }

  /* ---- 图片自带的浅色描边 ----
     有些站点把 logo 做成「一圈浅色描边 + 品牌色图形」，那圈描边铺在壁纸上就是
     刺眼的白框（图里带的，不是我们画的）。以前一刀切裁掉最外 5%，可满幅的 logo
     也被啃掉一圈，看起来就是「抓到的图是完整的、显示出来缺一块」。
     现在只认一种情况：四条边都有浅色窄边、宽度还基本一致（差 ≤2px）、都不超过 6%。
     对不上就一点不裁。 */
  var trimMemo = new Map();

  function edgeTrim(im) {
    var key = im.currentSrc || im.src || '';
    if (!key) { return null; }
    if (trimMemo.has(key)) { return trimMemo.get(key); }

    var out = null;
    try {
      var S = 96, LIM = Math.max(3, Math.round(S * 0.06));
      var cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      var cx = cv.getContext('2d', { willReadFrequently: true });
      cx.clearRect(0, 0, S, S);
      cx.drawImage(im, 0, 0, S, S);
      var px = cx.getImageData(0, 0, S, S).data;

      function at(x, y) {
        var i = (y * S + x) * 4;
        return [px[i], px[i + 1], px[i + 2], px[i + 3]];
      }
      function luma(c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
      function near(a, b) {
        return a[3] > 200 && b[3] > 200 &&
          Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 42;
      }
      /* 每条边沿法线走：先看最外一圈是不是浅色，再数这段浅色有多厚 */
      var sides = [];
      for (var side = 0; side < 4; side++) {
        var ring = [];
        for (var t = Math.round(S * 0.25); t < Math.round(S * 0.75); t++) {
          ring.push(side === 0 ? at(t, 0)
            : side === 1 ? at(S - 1, t)
            : side === 2 ? at(t, S - 1)
            : at(0, t));
        }
        var light = 0;
        for (var i = 0; i < ring.length; i++) {
          if (ring[i][3] > 200 && luma(ring[i]) > 205) { light++; }
        }
        if (light < ring.length * 0.8) { sides.push(-1); continue; }

        var ref = ring[Math.floor(ring.length / 2)];
        var th = 0;
        for (var d = 1; d <= LIM; d++) {
          var c2 = side === 0 ? at(Math.round(S / 2), d)
            : side === 1 ? at(S - 1 - d, Math.round(S / 2))
            : side === 2 ? at(Math.round(S / 2), S - 1 - d)
            : at(d, Math.round(S / 2));
          if (!near(c2, ref)) { break; }
          th = d + 1;
        }
        sides.push(th);
      }

      if (Math.min.apply(null, sides) >= 2) {
        var mx = Math.max.apply(null, sides);
        var mn = Math.min.apply(null, sides);
        if (mx <= LIM && mx - mn <= 2) {
          out = (mx / S * 100).toFixed(1) + '%';
        }
      }
    } catch (e) {
      out = null;      /* 跨域图读不到像素：交给后台那一路再量 */
    }

    if (trimMemo.size > 400) { trimMemo.clear(); }
    trimMemo.set(key, out);
    return out;
  }

  function paintTrim(im) {
    var t = edgeTrim(im);
    if (t) { im.style.setProperty('--icon-trim', t); }
  }

  function paintFit(im, f) {
    /* 只按「较长的那条边」把内容放大到贴满，比例不变 —— 也就是只把留白挤掉，
       绝不裁切。按短边 cover 会把宽一点的图标（DeepSeek 的白卡、微博的圆）
       左右切掉一块，看起来就是「图标被切了、还压到名字上」。
       上限 1.35 倍：32px 的 favicon 再放就成马赛克了 */
    var k = Math.min(1.35, 0.985 / Math.max(f.bw, f.bh));
    if (k < 1.03) { return; }
    /* translate 写在 scale 左边：位移不被缩放放大，所以按未缩放尺寸算百分比 */
    im.style.setProperty('--fit', k.toFixed(3));
    im.style.setProperty('--fit-dx', ((0.5 - f.cx) * k * 100).toFixed(2) + '%');
    im.style.setProperty('--fit-dy', ((0.5 - f.cy) * k * 100).toFixed(2) + '%');
  }

  /* 跨域图：让后台把同一张图 fetch 回来转成 data URL，再量一次。
     没有这个权限 / 取不到就静默放弃，图标照常显示，只是不裁留白。 */
  var fitAsked = new Set();

  function applyContentFit(im) {
    var f = contentBox(im);

    if (f !== false) {
      paintTrim(im);
      if (f) { paintFit(im, f); }
      return;
    }

    var src = im.currentSrc || im.src || '';
    if (!/^https?:/i.test(src)) { return; }
    if (fitAsked.has(src)) { return; }
    if (!hasExt || !chrome.runtime || !chrome.runtime.sendMessage) { return; }
    fitAsked.add(src);

    chrome.runtime.sendMessage({ type: 'icon-bytes', url: src }, function (data) {
      if (chrome.runtime.lastError || !data) { return; }
      var probe = new Image();
      probe.onload = function () {
        var g = contentBox(probe);   /* data URL，同源，量得出来 */
        if (g && g !== false) { paintFit(im, g); }
        var t = edgeTrim(probe);
        if (t) { im.style.setProperty('--icon-trim', t); }
      };
      probe.src = data;
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
      up.onload = function () {
        if (up.parentNode) { applyContentFit(up); }
      };
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

    function stopTimer() {
      window.clearTimeout(stageTimer);
      stageTimer = null;
    }

    function tryNext() {
      stopTimer();
      if (idx >= cands.length) {
        /* 整条链都试完了：记一笔，半小时内直接出字母，不再重来一遍 */
        iconRemember(item.url, '');
        letter();
        return;
      }
      var src = cands[idx++];
      img.src = src;
      /* 被墙的候选可能一直挂着，3 秒不走就换下一个 */
      stageTimer = window.setTimeout(tryNext, 3000);
    }

    var memo = iconMemoOf(item.url);
    var droppedMemo = false;

    /* 图真的解码出来了才算数：太小的是占位图 / 空白图，换下一个源 */
    function onLoaded() {
      stopTimer();
      /* 已经退成字母兜底了，晚到的图不再参与，也别写进缓存 */
      if (!img.parentNode) { return; }
      if (img.naturalWidth >= 16 && img.naturalHeight >= 16) {
        iconRemember(item.url, img.currentSrc || img.src || '');
        applyContentFit(img);
        return;
      }
      onBroken();
    }

    function onBroken() {
      if (!img.parentNode) { return; }
      /* 缓存里那条地址挂了（站点换图标 / 图床挂）：丢掉，从候选链重来一遍 */
      if (memo && memo.s && !droppedMemo) {
        droppedMemo = true;
        iconForget(item.url);
        idx = 0;
        tryNext();
        return;
      }
      tryNext();
    }

    img.onload = onLoaded;
    img.onerror = onBroken;

    /* 缓存命中：直接上图，连候选链都不进 */
    if (memo && memo.s) {
      box.appendChild(img);
      img.src = memo.s;
      return box;
    }

    /* 记过「这一轮全挂」的，半小时内直接出字母，不再让用户干等 */
    if (!cands.length || memo) { letter(); return box; }

    box.appendChild(img);
    tryNext();
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

  /* 时钟外观存在 item.look 上；缺哪个键就用这里的默认值。
     老数据把 hour12 / showDate 挂在 item 顶层，cleanItem 里迁过来。 */
  var CLOCK_LOOK = {
    face: 'sans',    /* 字体：sans 无衬线 / serif 衬线 / mono 等宽 */
    weight: 200,     /* 字重 */
    hour12: false,   /* 12 小时制（带 上午 / 下午） */
    seconds: false,  /* 显示秒 */
    lead: true,      /* 24 小时制补零：09:05 / 9:05 */
    date: 'mdw',     /* none | md | mdw | ymd | wd */
    scale: 1,        /* 字号占「自动铺满」的百分比：1 = 正好填满占位，只能往下缩 */
    align: 'center'  /* left | center | right */
  };

  var CLOCK_FACES = {
    sans: '"Segoe UI Variable Display", "Segoe UI", -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    serif: 'Georgia, "Times New Roman", "Songti SC", "Source Han Serif SC", "SimSun", serif',
    mono: '"Cascadia Mono", ui-monospace, "SF Mono", Consolas, "DejaVu Sans Mono", monospace'
  };
  var CLOCK_WEIGHTS = [200, 300, 400, 500, 700];
  var CLOCK_DATES = ['none', 'md', 'mdw', 'ymd', 'wd'];
  var CLOCK_ALIGNS = ['left', 'center', 'right'];

  /* 只留显式写过的键（和搜索的 look 一样），序列化时再和默认值比一次 */
  function cleanClockLook(raw, legacy) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    var o = {};
    if (CLOCK_FACES[src.face] !== undefined) { o.face = src.face; }
    if (CLOCK_WEIGHTS.indexOf(Number(src.weight)) >= 0) { o.weight = Number(src.weight); }
    if (typeof src.hour12 === 'boolean') { o.hour12 = src.hour12; }
    if (typeof src.seconds === 'boolean') { o.seconds = src.seconds; }
    if (typeof src.lead === 'boolean') { o.lead = src.lead; }
    if (CLOCK_DATES.indexOf(src.date) >= 0) { o.date = src.date; }
    if (src.scale != null) { o.scale = tuneNum(src.scale, CLOCK_LOOK.scale, 0.6, 1); }
    if (CLOCK_ALIGNS.indexOf(src.align) >= 0) { o.align = src.align; }

    if (legacy && typeof legacy === 'object') {
      if (legacy.hour12 != null && o.hour12 == null) { o.hour12 = !!legacy.hour12; }
      if (legacy.showDate === false && o.date == null) { o.date = 'none'; }
    }
    return o;
  }

  function clockLook(it) {
    var r = (it && it.look) || {};
    var d = CLOCK_LOOK;
    return {
      face: CLOCK_FACES[r.face] !== undefined ? r.face : d.face,
      weight: CLOCK_WEIGHTS.indexOf(r.weight) >= 0 ? r.weight : d.weight,
      hour12: r.hour12 === true,
      seconds: r.seconds === true,
      lead: r.lead !== false,
      date: CLOCK_DATES.indexOf(r.date) >= 0 ? r.date : d.date,
      scale: tuneNum(r.scale, d.scale, 0.6, 1),
      align: CLOCK_ALIGNS.indexOf(r.align) >= 0 ? r.align : d.align
    };
  }

  function clockLookPatch(lk) {
    var out = {};
    Object.keys(CLOCK_LOOK).forEach(function (k) {
      if (lk[k] !== CLOCK_LOOK[k]) { out[k] = lk[k]; }
    });
    return out;
  }

  function clockCustom(it) {
    var lk = clockLook(it);
    return Object.keys(CLOCK_LOOK).some(function (k) { return lk[k] !== CLOCK_LOOK[k]; });
  }

  /* 右键里的小改动：只盖几个键，其余保持 */
  function setClockLook(item, patch) {
    var lk = clockLook(item);
    Object.keys(patch).forEach(function (k) { lk[k] = patch[k]; });
    item.look = clockLookPatch(lk);
    layoutAll();
    paintClock();
    scheduleSave();
  }

  function clockText(now, lk) {
    var h24 = now.getHours();
    var m = pad2(now.getMinutes());
    var s = pad2(now.getSeconds());
    var t;
    if (lk.hour12) {
      var h12 = h24 % 12;
      if (h12 === 0) { h12 = 12; }
      t = (h24 < 12 ? '上午 ' : '下午 ') + h12 + ':' + m;
    } else {
      t = (lk.lead ? pad2(h24) : String(h24)) + ':' + m;
    }
    if (lk.seconds) { t += ':' + s; }

    var date = '';
    var md = (now.getMonth() + 1) + '月' + now.getDate() + '日';
    var wk = '星期' + WEEK[now.getDay()];
    if (lk.date === 'md') { date = md; }
    else if (lk.date === 'mdw') { date = md + '　' + wk; }
    else if (lk.date === 'ymd') { date = now.getFullYear() + '年' + md + '　' + wk; }
    else if (lk.date === 'wd') { date = wk; }
    return { time: t, date: date };
  }

  /* 拿「最宽的那一帧」量字号：9:05 → 10:05、24 小时制不补零都不会溢出 */
  function clockSample(lk) {
    var base = lk.hour12 ? '下午 12:59' : (lk.lead ? '00:00' : '23:59');
    return lk.seconds ? base + ':59' : base;
  }

  /* 按占位反算字号：先摆一个 100px 的基准，连日期一起量出整块尺寸，
     再等比缩到占位里。offsetWidth 不受 transform 影响 —— 弹窗预览是整体 scale 过的 */
  function fitClock(el, W, H, lk) {
    var wrap = el.querySelector('.clock-wrap');
    var timeEl = el.querySelector('.time');
    var dateEl = el.querySelector('.date');
    if (!wrap || !timeEl || !dateEl || !W || !H) { return; }

    var real = timeEl.textContent;
    timeEl.textContent = clockSample(lk);
    timeEl.style.fontSize = '100px';
    dateEl.style.fontSize = '16px';
    var tw = timeEl.offsetWidth || 1;
    var bh = wrap.offsetHeight || 1;
    timeEl.textContent = real;

    var k = Math.min(W * 0.90 / tw, H * 0.92 / bh);
    var size = clamp(100 * k, 12, 320) * lk.scale;

    function apply(sz) {
      timeEl.style.fontSize = sz.toFixed(1) + 'px';
      if (lk.date === 'none') { return; }
      var dsize = clamp(sz * 0.16, 9, 20);
      dateEl.style.fontSize = dsize.toFixed(1) + 'px';
      var dw = dateEl.offsetWidth || 0;
      if (dw > W * 0.92) {
        dateEl.style.fontSize = Math.max(8, dsize * (W * 0.92 / dw)).toFixed(1) + 'px';
      }
    }
    apply(size);

    /* 兜底：日期换行 / 字体度量差异导致整块超出时，再按比例收一次 */
    var over = wrap.offsetHeight;
    if (over > H) { apply(size * (H / over)); }
  }

  /* 外观只在这里落地：画布和弹窗预览共用同一个函数，两边不可能跑偏 */
  function applyClockLook(el, box, lk) {
    var W = box.width != null ? box.width : box.w;
    var H = box.height != null ? box.height : box.h;
    var timeEl = el.querySelector('.time');
    var dateEl = el.querySelector('.date');
    if (!timeEl || !dateEl) { return; }

    el.style.setProperty('--clk-face', CLOCK_FACES[lk.face] || CLOCK_FACES.sans);
    el.style.setProperty('--clk-weight', String(lk.weight));
    el.classList.toggle('is-left', lk.align === 'left');
    el.classList.toggle('is-right', lk.align === 'right');
    el.classList.toggle('has-date', lk.date !== 'none');

    var t = clockText(new Date(), lk);
    if (timeEl.textContent !== t.time) { timeEl.textContent = t.time; }
    dateEl.style.display = t.date ? '' : 'none';
    if (dateEl.textContent !== t.date) { dateEl.textContent = t.date; }

    fitClock(el, W, H, lk);
  }

  /* ---------------- 时钟设置 ---------------- */

  function openClockSettings(item) {
    if (dialogOpen) { return; }

    var draft = { w: item.w, h: item.h, look: clockLook(item) };
    var min = MIN_SIZE.clock;

    function pctText(v) {
      return Math.round(v * 100) + '%' + (v >= 1 ? '（铺满）' : '');
    }

    var card = document.createElement('div');
    card.className = 'dlg-icon clk-dlg';

    var head = document.createElement('div');
    head.className = 'dlg-head';
    var h3 = document.createElement('h3');
    h3.textContent = '时钟设置';
    var xBtn = document.createElement('button');
    xBtn.type = 'button';
    xBtn.className = 'dlg-x';
    xBtn.setAttribute('aria-label', '关闭');
    xBtn.appendChild(iconEl('x'));
    head.appendChild(h3);
    head.appendChild(xBtn);
    card.appendChild(head);

    var body = document.createElement('div');
    body.className = 'dlg-body';
    card.appendChild(body);

    var stage = document.createElement('div');
    stage.className = 'sp-stage';
    body.appendChild(stage);

    var pv = null;

    function boxPx() {
      var m = metrics();
      return { w: draft.w * m.stepX - m.gapX, h: draft.h * m.stepY - m.rowGap };
    }

    function fitPreview() {
      var b = boxPx();
      /* 除了宽度，也压一下高度：4 行的时钟本身就有 200 多像素高 */
      var k = Math.min(560 / b.w, 150 / b.h, 2);
      stage.style.width = Math.round(b.w * k) + 'px';
      stage.style.height = Math.round(b.h * k) + 'px';
      if (!pv) { return; }
      pv.style.width = b.w + 'px';
      pv.style.height = b.h + 'px';
      pv.style.transform = 'scale(' + k + ')';
      applyClockLook(pv, { width: b.w, height: b.h }, draft.look);
    }

    function rebuildPreview() {
      stage.textContent = '';
      pv = item.el.cloneNode(true);
      pv.className = 'widget w-clock sp-pv';
      pv.style.left = '0px';
      pv.style.top = '0px';
      stage.appendChild(pv);
      fitPreview();
    }

    /* ---- 占位 ---- */
    var boxSize = document.createElement('div');
    boxSize.className = 'dlg-box';
    boxSize.appendChild(secTitle('占位'));

    var wTune = tuneRow({
      key: 'width', name: '宽度', min: min.w, max: COLS, step: 1, val: draft.w,
      onInput: function (v) {
        draft.w = Math.round(v);
        var b = boxPx();
        wTune.val(draft.w + ' 格 · ' + Math.round(b.w) + ' px');
        fitPreview();
      }
    });
    wTune.val(draft.w + ' 格 · ' + Math.round(boxPx().w) + ' px');
    boxSize.appendChild(wTune.root);

    var hTune = tuneRow({
      key: 'height', name: '高度', min: min.h, max: 10, step: 1, val: draft.h,
      onInput: function (v) {
        draft.h = Math.round(v);
        var b = boxPx();
        hTune.val(draft.h + ' 行 · ' + Math.round(b.h) + ' px');
        fitPreview();
      }
    });
    hTune.val(draft.h + ' 行 · ' + Math.round(boxPx().h) + ' px');
    boxSize.appendChild(hTune.root);

    var sizeHint = document.createElement('p');
    sizeHint.className = 'dlg-hint';
    sizeHint.textContent = '改的是这一块实际占几格，周围的方块会让位；只缩放文字用右边的「字号」。';
    boxSize.appendChild(sizeHint);

    /* 字号也算「尺寸」，和宽高放一起；外形卡专心放字体那几样 */
    var scaleTune = tuneRow({
      key: 'scale', name: '字号', min: 0.6, max: 1, step: 0.02, val: draft.look.scale,
      onInput: function (v) {
        draft.look.scale = Math.round(v * 50) / 50;
        scaleTune.val(pctText(draft.look.scale));
        fitPreview();
      }
    });
    scaleTune.val(pctText(draft.look.scale));
    boxSize.appendChild(scaleTune.root);
    boxSize.appendChild(sizeHint);   /* appendChild 会把它从原位置挪下来，提示落到最底 */

    /* ---- 外形 ---- */
    var boxLook = document.createElement('div');
    boxLook.className = 'dlg-box';
    boxLook.appendChild(secTitle('外形'));

    var faceSeg = segField('字体', [
      { label: '默认', v: 'sans' },
      { label: '衬线', v: 'serif' },
      { label: '等宽', v: 'mono' }
    ], draft.look.face, function (v) {
      draft.look.face = v;
      fitPreview();
    });
    boxLook.appendChild(faceSeg.root);

    var weightSeg = segField('字重', [
      { label: '极细', v: 200 },
      { label: '常规', v: 400 },
      { label: '中粗', v: 500 },
      { label: '粗', v: 700 }
    ], draft.look.weight, function (v) {
      draft.look.weight = v;
      fitPreview();
    });
    boxLook.appendChild(weightSeg.root);

    var alignSeg = segField('对齐', [
      { label: '左', v: 'left' },
      { label: '居中', v: 'center' },
      { label: '右', v: 'right' }
    ], draft.look.align, function (v) {
      draft.look.align = v;
      fitPreview();
    });
    boxLook.appendChild(alignSeg.root);

    var lookHint = document.createElement('p');
    lookHint.className = 'dlg-hint';
    lookHint.textContent = '100% = 自动铺满这一块，只能往下缩；想更大就把占位调大。';
    boxLook.appendChild(lookHint);

    var cols = document.createElement('div');
    cols.className = 'sp-cols';
    cols.appendChild(boxSize);
    cols.appendChild(boxLook);
    body.appendChild(cols);

    /* ---- 时间显示 ---- */
    var boxTime = document.createElement('div');
    boxTime.className = 'dlg-box';
    boxTime.appendChild(secTitle('时间显示'));

    var hourSeg = segField('制式', [
      { label: '24 小时', v: false },
      { label: '12 小时', v: true }
    ], draft.look.hour12, function (v) {
      draft.look.hour12 = v;
      fitPreview();
    });

    var secSeg = segField('秒', [
      { label: '不显示', v: false },
      { label: '显示', v: true }
    ], draft.look.seconds, function (v) {
      draft.look.seconds = v;
      fitPreview();
    });

    var leadSeg = segField('补零', [
      { label: '09:05', v: true },
      { label: '9:05', v: false }
    ], draft.look.lead, function (v) {
      draft.look.lead = v;
      fitPreview();
    });

    var dateSeg = segField('日期', [
      { label: '不显示', v: 'none' },
      { label: '11月6日', v: 'md' },
      { label: '11月6日 周五', v: 'mdw' },
      { label: '年月日+周', v: 'ymd' },
      { label: '只看周几', v: 'wd' }
    ], draft.look.date, function (v) {
      draft.look.date = v;
      fitPreview();
    });

    /* 四组排成 2×2：弹窗矮一截，四组都在首屏，不用滚 */
    var grid = document.createElement('div');
    grid.className = 'clk-grid3';
    dateSeg.root.classList.add('clk-span');
    [hourSeg, secSeg, leadSeg, dateSeg].forEach(function (f) { grid.appendChild(f.root); });
    boxTime.appendChild(grid);

    body.appendChild(boxTime);

    /* ---- 底部 ---- */
    var foot = document.createElement('div');
    foot.className = 'dlg-foot';

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'text-btn tone-reset';
    reset.textContent = '外形恢复默认';
    reset.addEventListener('click', function () {
      draft.look = {
        face: CLOCK_LOOK.face, weight: CLOCK_LOOK.weight, hour12: CLOCK_LOOK.hour12,
        seconds: CLOCK_LOOK.seconds, lead: CLOCK_LOOK.lead, date: CLOCK_LOOK.date,
        scale: CLOCK_LOOK.scale, align: CLOCK_LOOK.align
      };
      scaleTune.set(draft.look.scale); scaleTune.val(pctText(draft.look.scale));
      faceSeg.set(draft.look.face);
      weightSeg.set(draft.look.weight);
      alignSeg.set(draft.look.align);
      hourSeg.set(draft.look.hour12);
      secSeg.set(draft.look.seconds);
      leadSeg.set(draft.look.lead);
      dateSeg.set(draft.look.date);
      fitPreview();
    });
    foot.appendChild(reset);

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dlg-btn';
    cancel.textContent = '取消';
    foot.appendChild(cancel);

    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'dlg-primary';
    save.textContent = '保存';
    foot.appendChild(save);
    card.appendChild(foot);

    var wrap = buildScrim(card);

    function close() {
      closeScrim(wrap);
      document.removeEventListener('keydown', onKey, true);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
    }

    xBtn.addEventListener('click', close);
    cancel.addEventListener('click', close);
    save.addEventListener('click', function () {
      item.look = clockLookPatch(draft.look);
      close();
      if (draft.w !== item.w || draft.h !== item.h) {
        applySize(item, draft.w, draft.h);
      } else {
        layoutAll();
      }
      paintClock();
      scheduleSave();
    });

    wrap.addEventListener('pointerdown', function (e) { if (e.target === wrap) { close(); } });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(wrap);
    dialogOpen = true;
    hideMenu();
    rebuildPreview();
  }

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
      applyClockLook(item.el, { width: r.width, height: r.height }, clockLook(item));
    };
  }

  /* ---------------- 搜索部件 ---------------- */

  /* 搜索框外观存在 item.look 上；缺哪个键就用这里的默认值 */
  var SEARCH_LOOK = {
    barW: 100,     /* 搜索条宽度，占槽位的百分比 */
    radius: 50,    /* 圆角，占搜索条高度的百分比；50 = 胶囊 */
    font: 14,      /* 输入框字号 px */
    dim: 40,       /* 底色浓度 0–100（0 = 只剩模糊和描边） */
    dockScale: 1,  /* 引擎图标倍数 */
    dock: true     /* 引擎行是否内嵌显示 */
  };

  function cleanSearchLook(raw) {
    if (!raw || typeof raw !== 'object') { return null; }
    var o = {};
    if (raw.barW != null)      { o.barW = tuneNum(raw.barW, SEARCH_LOOK.barW, 40, 100); }
    if (raw.radius != null)    { o.radius = Math.round(tuneNum(raw.radius, SEARCH_LOOK.radius, 0, 50)); }
    if (raw.font != null)      { o.font = Math.round(tuneNum(raw.font, SEARCH_LOOK.font, 11, 22)); }
    if (raw.dim != null)       { o.dim = Math.round(tuneNum(raw.dim, SEARCH_LOOK.dim, 0, 100)); }
    if (raw.dockScale != null) { o.dockScale = tuneNum(raw.dockScale, SEARCH_LOOK.dockScale, 0.8, 1.4); }
    if (typeof raw.dock === 'boolean') { o.dock = raw.dock; }
    return o;
  }

  function searchLook(it) {
    var r = (it && it.look) || {};
    var d = SEARCH_LOOK;
    return {
      barW: tuneNum(r.barW, d.barW, 40, 100),
      radius: Math.round(tuneNum(r.radius, d.radius, 0, 50)),
      font: Math.round(tuneNum(r.font, d.font, 11, 22)),
      dim: Math.round(tuneNum(r.dim, d.dim, 0, 100)),
      dockScale: tuneNum(r.dockScale, d.dockScale, 0.8, 1.4),
      dock: r.dock !== false
    };
  }

  /* 外观只在这里落地：真实方块和弹窗里的预览共用，两边不可能跑偏。
     返回是否把引擎行内嵌了（不够高的时候引擎行改成点图标弹出） */
  function applySearchLook(el, box, lk) {
    var H = box.height != null ? box.height : box.h;
    var barH, dockH = 0, inline = false;

    /* 引擎行要 38px 才放得下图标 + 名字；连它都塞不进就转成浮层 */
    if (lk.dock && H >= 96) {
      barH = clamp(H * 0.50, 42, 58);
      dockH = Math.min(H - barH - 10, 56);
      if (dockH >= 38) { inline = true; }
    }
    if (!inline) {
      barH = Math.min(52, Math.max(28, H - 4));
      /* 浮层跑在组件外面，高度不受槽位限制，固定给一个够点的高度 */
      dockH = 52;
    }

    barH = Math.round(barH);
    dockH = Math.round(dockH);

    el.style.setProperty('--bar-h', barH + 'px');
    el.style.setProperty('--bar-w', lk.barW + '%');
    el.style.setProperty('--bar-r', (barH * lk.radius / 50).toFixed(1) + 'px');
    el.style.setProperty('--bar-font', lk.font + 'px');
    el.style.setProperty('--bar-dim', (lk.dim / 100 * 0.42).toFixed(3));
    el.style.setProperty('--dock-h', dockH + 'px');
    el.style.setProperty('--dock-r', (dockH * lk.radius / 50).toFixed(1) + 'px');
    el.style.setProperty('--dock-ico', Math.round(clamp(dockH * 0.44 * lk.dockScale, 15, 32)) + 'px');
    el.style.setProperty('--bar-ico', Math.round(clamp(barH * 0.50, 15, 26)) + 'px');

    el.classList.toggle('has-dock', inline);
    el.classList.toggle('is-float', !inline);
    if (!inline) { el.classList.remove('is-picking'); }
    return inline;
  }

  /* 引擎图标：先站点自己的 apple-touch-icon，退到 favicon、第三方服务，
     全都拿不到就画一个品牌色字母块 —— 断网也不会开天窗 */
  var engSrcMemo = {};

  function engineSrcs(e) {
    var host = hostOf(e.home || '');
    if (!host) { return []; }
    return [
      'https://' + host + '/apple-touch-icon.png',
      'https://' + host + '/favicon.ico',
      'https://icons.duckduckgo.com/ip3/' + host + '.ico',
      'https://www.google.com/s2/favicons?sz=128&domain=' + host
    ];
  }

  function engineIconEl(e) {
    var box = document.createElement('span');
    /* 先摆字母块：图没回来之前也不会开一块空白，回来再换成真图 */
    box.className = 'eng is-letter';
    box.dataset.letter = (e.short || e.name || '?').charAt(0);
    box.style.setProperty('--eng', e.color || '#5b6472');

    var srcs = engSrcMemo[e.id] ? [engSrcMemo[e.id]] : engineSrcs(e);
    if (!srcs.length) { return box; }

    var im = document.createElement('img');
    im.alt = '';
    im.draggable = false;
    im.referrerPolicy = 'no-referrer';

    var i = 0;
    var timer = 0;

    function next() {
      window.clearTimeout(timer);
      if (i >= srcs.length) { return; }
      im.src = srcs[i++];
      /* 被墙/挂住的候选不能一直等，1.6 秒换下一个 */
      timer = window.setTimeout(next, 1600);
    }

    im.onload = function () {
      window.clearTimeout(timer);
      if (im.naturalWidth < 8) { next(); return; }
      engSrcMemo[e.id] = im.currentSrc || im.src;
      box.classList.remove('is-letter');
      box.classList.add('is-img');
    };
    im.onerror = next;

    box.appendChild(im);
    next();
    return box;
  }

  /* 换引擎：所有搜索框一起换，设置面板的选中态也跟着走 */
  function setEngine(id) {
    if (!engineById(id) || state.engine === id) { return; }
    state.engine = id;
    scheduleSave();
    refreshSearchWidgets();
  }

  function refreshSearchWidgets() {
    state.items.forEach(function (it) {
      if (it.type === 'search' && it.paintEngines) { it.paintEngines(); }
    });
    renderEngines();
  }

  /* 自定义引擎的配色：按添加顺序取，避免每台机器算出不同的 HSL 字符串 */
  var MY_ENGINE_COLORS = ['#1E80FF', '#00A67E', '#F2994A', '#9B51E0', '#EB5757', '#2D9CDB'];

  function openEngineDialog() {
    if (dialogOpen) { return; }

    openDialog('添加搜索引擎', [
      { key: 'name', label: '名称', icon: 'type', value: '', placeholder: '比如 掘金' },
      {
        key: 'tpl', label: '搜索地址（%s 代表关键词）', icon: 'link', value: '',
        placeholder: 'https://juejin.cn/search?query=%s'
      }
    ], function (v) {
      var name = v.name.trim().slice(0, 12);
      var tpl = normalizeUrl(v.tpl.trim());
      /* 漏写 %s 就补在末尾：有查询串接在后面，没有就补 ?q= */
      if (tpl.indexOf('%s') < 0) {
        tpl += (tpl.indexOf('?') >= 0 ? '' : '?q=') + '%s';
      }

      var list = (state.myEngines || []).slice();
      var engine = {
        id: 'my-' + Date.now().toString(36),
        name: name,
        short: name.charAt(0),
        color: MY_ENGINE_COLORS[list.length % MY_ENGINE_COLORS.length],
        home: '',
        tpl: tpl,
        my: true
      };
      list.push(engine);
      state.myEngines = list.slice(0, MY_ENGINE_MAX);
      state.engine = engine.id;

      scheduleSave();
      refreshSearchWidgets();
      showTip('已添加「' + name + '」，以后就能在引擎行里点它', 2800);
    }, function (v) {
      if (!v.name.trim()) { return '给这个引擎起个名字'; }
      if (!v.tpl.trim()) { return '填一下搜索地址'; }
      var probe = v.tpl.trim();
      if (probe.indexOf('%s') < 0 && /[?&][^=]+=$/.test(probe)) { probe += '%s'; }
      if (!normalizeUrl(probe)) { return '这个地址看起来不对，需要是 http(s) 开头的网址'; }
      if ((state.myEngines || []).length >= MY_ENGINE_MAX) {
        return '自定义引擎最多 ' + MY_ENGINE_MAX + ' 个';
      }
      return '';
    });
  }

  /* 搜索框设置：尺寸（占几列几行）与外形（宽 / 高 / 弧度 / 字号 / 浓度）
     分开给，预览按真实尺寸等比缩小 —— 保存前看到的就是保存后的样子 */
  function openSearchSettings(item) {
    if (dialogOpen) { return; }

    var draft = { w: item.w, h: item.h, look: searchLook(item) };

    var card = document.createElement('div');
    card.className = 'dlg-icon sp-dlg';

    var head = document.createElement('div');
    head.className = 'dlg-head';
    var h3 = document.createElement('h3');
    h3.textContent = '搜索框设置';
    var xBtn = document.createElement('button');
    xBtn.type = 'button';
    xBtn.className = 'dlg-x';
    xBtn.setAttribute('aria-label', '关闭');
    xBtn.appendChild(iconEl('x'));
    head.appendChild(h3);
    head.appendChild(xBtn);
    card.appendChild(head);

    var body = document.createElement('div');
    body.className = 'dlg-body';
    card.appendChild(body);

    var stage = document.createElement('div');
    stage.className = 'sp-stage';
    body.appendChild(stage);

    var pv = null;

    function boxPx() {
      var m = metrics();
      return { w: draft.w * m.stepX - m.gapX, h: draft.h * m.stepY - m.rowGap };
    }

    function fitPreview() {
      var b = boxPx();
      var k = Math.min(1, 480 / b.w);
      stage.style.width = Math.round(b.w * k) + 'px';
      stage.style.height = Math.round(b.h * k) + 'px';
      if (!pv) { return; }
      pv.style.width = b.w + 'px';
      pv.style.height = b.h + 'px';
      pv.style.transform = 'scale(' + k + ')';
      /* applySearchLook 收的是 rectOf 那种 { width, height }，这里换算一次 */
      applySearchLook(pv, { width: b.w, height: b.h }, draft.look);
    }

    function rebuildPreview() {
      stage.textContent = '';
      pv = item.el.cloneNode(true);
      pv.className = 'widget w-search sp-pv';
      pv.style.left = '0px';
      pv.style.top = '0px';
      stage.appendChild(pv);
      fitPreview();
    }

    /* ---- 尺寸 ---- */
    var boxSize = document.createElement('div');
    boxSize.className = 'dlg-box';
    boxSize.appendChild(secTitle('占位'));

    var wTune = tuneRow({
      key: 'width', name: '宽度', min: 6, max: COLS, step: 1, val: draft.w,
      onInput: function (v) {
        draft.w = Math.round(v);
        var b = boxPx();
        wTune.val(draft.w + ' 格 · ' + Math.round(b.w) + ' px');
        fitPreview();
      }
    });
    wTune.val(draft.w + ' 格 · ' + Math.round(boxPx().w) + ' px');
    boxSize.appendChild(wTune.root);

    var hTune = tuneRow({
      key: 'height', name: '高度', min: 1, max: 12, step: 1, val: draft.h,
      onInput: function (v) {
        draft.h = Math.round(v);
        var b = boxPx();
        hTune.val(draft.h + ' 行 · ' + Math.round(b.h) + ' px');
        fitPreview();
      }
    });
    hTune.val(draft.h + ' 行 · ' + Math.round(boxPx().h) + ' px');
    boxSize.appendChild(hTune.root);

    var sizeHint = document.createElement('p');
    sizeHint.className = 'dlg-hint';
    sizeHint.textContent = '这两条改的是这一块实际占几格，周围的方块会让位。高度到 96 px 以上，引擎行会直接排在搜索条下面；不够高时收成浮层，点搜索条左边的引擎图标再弹出。';
    boxSize.appendChild(sizeHint);

    /* ---- 外形 ---- */
    var boxLook = document.createElement('div');
    boxLook.className = 'dlg-box';
    boxLook.appendChild(secTitle('外形'));

    var barWTune = tuneRow({
      key: 'barW', name: '搜索条宽度', min: 40, max: 100, step: 1, val: draft.look.barW,
      onInput: function (v) {
        draft.look.barW = Math.round(v);
        barWTune.val(draft.look.barW + '%');
        fitPreview();
      }
    });
    barWTune.val(draft.look.barW + '%');
    boxLook.appendChild(barWTune.root);

    var rTune = tuneRow({
      key: 'radius', name: '弧度', min: 0, max: 50, step: 1, val: draft.look.radius,
      onInput: function (v) {
        draft.look.radius = Math.round(v);
        rTune.val(draft.look.radius === 50 ? '胶囊' : draft.look.radius + '%');
        fitPreview();
      }
    });
    rTune.val(draft.look.radius === 50 ? '胶囊' : draft.look.radius + '%');
    boxLook.appendChild(rTune.root);

    var fTune = tuneRow({
      key: 'font', name: '字号', min: 11, max: 22, step: 1, val: draft.look.font,
      onInput: function (v) {
        draft.look.font = Math.round(v);
        fTune.val(draft.look.font + ' px');
        fitPreview();
      }
    });
    fTune.val(draft.look.font + ' px');
    boxLook.appendChild(fTune.root);

    var dTune = tuneRow({
      key: 'dim', name: '底色浓度', min: 0, max: 100, step: 1, val: draft.look.dim,
      onInput: function (v) {
        draft.look.dim = Math.round(v);
        dTune.val(draft.look.dim + '%');
        fitPreview();
      }
    });
    dTune.val(draft.look.dim + '%');
    boxLook.appendChild(dTune.root);

    var sTune = tuneRow({
      key: 'dockScale', name: '引擎图标', min: 0.8, max: 1.4, step: 0.05, val: draft.look.dockScale,
      onInput: function (v) {
        draft.look.dockScale = Math.round(v * 20) / 20;
        sTune.val(draft.look.dockScale.toFixed(2).replace(/0$/, '') + '×');
        fitPreview();
      }
    });
    sTune.val(draft.look.dockScale.toFixed(2).replace(/0$/, '') + '×');
    boxLook.appendChild(sTune.root);

    /* 引擎行开关 */
    var dockField = document.createElement('div');
    dockField.className = 'dlg-field';
    var dockHead = document.createElement('div');
    dockHead.className = 'tune-head';
    var dockName = document.createElement('span');
    dockName.className = 'tune-name';
    dockName.textContent = '引擎行';
    dockHead.appendChild(dockName);
    dockField.appendChild(dockHead);

    var dockSeg = document.createElement('div');
    dockSeg.className = 'dlg-seg';
    var dockBtns = [];
    [{ label: '显示', v: true }, { label: '隐藏', v: false }].forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg' + (draft.look.dock === o.v ? ' is-active' : '');
      b.textContent = o.label;
      b.dataset.val = o.v ? '1' : '0';
      b.addEventListener('click', function () {
        draft.look.dock = o.v;
        dockBtns.forEach(function (x) { x.classList.toggle('is-active', x === b); });
        fitPreview();
      });
      dockSeg.appendChild(b);
      dockBtns.push(b);
    });
    dockField.appendChild(dockSeg);
    boxLook.appendChild(dockField);

    /* 尺寸和外形并排：弹窗矮一半，底部按钮不用滚就能看见 */
    var cols = document.createElement('div');
    cols.className = 'sp-cols';
    cols.appendChild(boxSize);
    cols.appendChild(boxLook);
    body.appendChild(cols);

    /* ---- 引擎列表 ---- */
    var boxEng = document.createElement('div');
    boxEng.className = 'dlg-box';
    boxEng.appendChild(secTitle('搜索引擎'));

    var list = document.createElement('div');
    list.className = 'sp-engines';
    boxEng.appendChild(list);

    function renderList() {
      list.textContent = '';
      allEngines().forEach(function (e) {
        var row = document.createElement('div');
        row.className = 'sp-eng' + (state.engine === e.id ? ' is-active' : '');
        row.appendChild(engineIconEl(e));

        var nm = document.createElement('span');
        nm.className = 'sp-eng-name';
        nm.textContent = e.name;
        row.appendChild(nm);

        var use = document.createElement('button');
        use.type = 'button';
        use.className = 'sp-eng-use';
        use.textContent = state.engine === e.id ? '使用中' : '使用';
        use.addEventListener('click', function () {
          setEngine(e.id);
          renderList();
          rebuildPreview();
        });
        row.appendChild(use);

        if (e.my) {
          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'sp-eng-del';
          del.setAttribute('aria-label', '删除' + e.name);
          del.appendChild(iconEl('x'));
          del.addEventListener('click', function () {
            state.myEngines = (state.myEngines || []).filter(function (o) { return o.id !== e.id; });
            if (state.engine === e.id) { state.engine = ENGINES[0].id; }
            scheduleSave();
            refreshSearchWidgets();
            renderList();
            rebuildPreview();
          });
          row.appendChild(del);
        }

        list.appendChild(row);
      });
    }
    renderList();

    var addHint = document.createElement('p');
    addHint.className = 'dlg-hint';
    addHint.textContent = '引擎行最右边的「+ 添加」可以填自己的搜索地址（用 %s 代表关键词）。';
    boxEng.appendChild(addHint);
    body.appendChild(boxEng);

    /* ---- 底部 ---- */
    var foot = document.createElement('div');
    foot.className = 'dlg-foot';

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'text-btn tone-reset';
    reset.textContent = '外形恢复默认';
    reset.addEventListener('click', function () {
      draft.look = {
        barW: SEARCH_LOOK.barW, radius: SEARCH_LOOK.radius, font: SEARCH_LOOK.font,
        dim: SEARCH_LOOK.dim, dockScale: SEARCH_LOOK.dockScale, dock: SEARCH_LOOK.dock
      };
      barWTune.set(draft.look.barW); barWTune.val(draft.look.barW + '%');
      rTune.set(draft.look.radius); rTune.val('胶囊');
      fTune.set(draft.look.font); fTune.val(draft.look.font + ' px');
      dTune.set(draft.look.dim); dTune.val(draft.look.dim + '%');
      sTune.set(draft.look.dockScale); sTune.val('1×');
      dockBtns.forEach(function (x) { x.classList.toggle('is-active', x.dataset.val === '1'); });
      fitPreview();
    });
    foot.appendChild(reset);

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dlg-btn';
    cancel.textContent = '取消';
    foot.appendChild(cancel);

    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'dlg-primary';
    save.textContent = '保存';
    foot.appendChild(save);
    card.appendChild(foot);

    var wrap = buildScrim(card);

    function close() {
      closeScrim(wrap);
      document.removeEventListener('keydown', onKey, true);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
    }

    xBtn.addEventListener('click', close);
    cancel.addEventListener('click', close);
    save.addEventListener('click', function () {
      item.look = {
        barW: draft.look.barW, radius: draft.look.radius, font: draft.look.font,
        dim: draft.look.dim, dockScale: draft.look.dockScale, dock: draft.look.dock
      };
      close();
      if (draft.w !== item.w || draft.h !== item.h) {
        applySize(item, draft.w, draft.h);
      } else {
        layoutAll();
      }
      scheduleSave();
    });

    wrap.addEventListener('pointerdown', function (e) { if (e.target === wrap) { close(); } });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(wrap);
    dialogOpen = true;
    hideMenu();
    rebuildPreview();
  }

  function mountSearch(item) {
    makeShell(item);

    var form = document.createElement('form');
    form.className = 'search';
    form.autocomplete = 'off';
    form.setAttribute('role', 'search');

    var engBtn = document.createElement('button');
    engBtn.type = 'button';
    engBtn.className = 'search-eng';
    engBtn.setAttribute('aria-label', '切换搜索引擎');

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '输入搜索内容';
    input.spellcheck = false;
    input.setAttribute('aria-label', '搜索');

    var go = document.createElement('button');
    go.type = 'submit';
    go.className = 'search-go';
    go.setAttribute('aria-label', '搜索');
    go.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6L20 20"/></svg>';

    form.appendChild(engBtn);
    form.appendChild(input);
    form.appendChild(go);

    var dock = document.createElement('div');
    dock.className = 'search-dock';
    dock.setAttribute('role', 'group');
    dock.setAttribute('aria-label', '搜索引擎');

    item.body.appendChild(form);
    item.body.appendChild(dock);
    item.input = input;

    var dockBtns = [];

    function syncActive() {
      dockBtns.forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.engine === state.engine);
      });
    }

    function paintBar() {
      var e = currentEngine();
      engBtn.textContent = '';
      engBtn.appendChild(engineIconEl(e));
      engBtn.title = '当前搜索引擎：' + e.name;
    }

    function buildDock() {
      dock.textContent = '';
      dockBtns = [];

      allEngines().forEach(function (e) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dock-item';
        b.dataset.engine = e.id;
        b.title = e.name;
        b.appendChild(engineIconEl(e));

        var nm = document.createElement('span');
        nm.className = 'dock-name';
        nm.textContent = e.name;
        b.appendChild(nm);

        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          item.el.classList.remove('is-picking');
          setEngine(e.id);
        });
        dock.appendChild(b);
        dockBtns.push(b);
      });

      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'dock-item is-add';
      add.title = '添加搜索引擎';
      var plus = document.createElement('span');
      plus.className = 'eng eng-plus';
      plus.textContent = '+';
      add.appendChild(plus);
      var an = document.createElement('span');
      an.className = 'dock-name';
      an.textContent = '添加';
      add.appendChild(an);
      add.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openEngineDialog();
      });
      dock.appendChild(add);

      syncActive();
    }

    item.paintEngines = function () { paintBar(); buildDock(); };

    item.fit = function (r) {
      var inline = applySearchLook(item.el, r, searchLook(item));
      /* 浮层默认往下弹；底下放不下就改成往上翻 */
      if (!inline) {
        var below = canvas.clientHeight - (r.top - canvas.scrollTop + r.height);
        item.el.classList.toggle('is-up', below < 76);
      } else {
        item.el.classList.remove('is-up');
      }
    };

    /* 内嵌时图标只是个身份标识；放不下引擎行时才当作「弹出引擎列表」的开关 */
    engBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!item.el.classList.contains('is-float')) { return; }
      item.el.classList.toggle('is-picking');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) { return; }
      if (looksLikeUrl(v)) {
        window.location.assign(/^https?:\/\//i.test(v) ? v : 'https://' + v);
        return;
      }
      window.location.assign(engineUrl(currentEngine(), v));
    });

    paintBar();
    buildDock();
  }

  /* 把单块自定义底色/字色写到元素上；没自定义时清掉，交回壁纸的 token */
  function paintTone(item, plate) {
    var el = item.el;
    if (!el) { return; }
    /* 1×1 的图标本身就是方块，底色垫在图标下面（半透明图标需要它） */
    var bg = item.bgColor || '';
    /* 展开后的方块整块是底板，底色上自动反色才看得清；
       1×1 的名称挂在方块外面的壁纸上，自动反色反而会看不见，只认用户显式选的颜色 */
    var fg = item.fgColor || (plate && bg ? contrastOn(bg) : '');

    el.classList.toggle('has-tone', !!bg);
    if (bg) { el.style.setProperty('--tone-bg', bg); }
    else { el.style.removeProperty('--tone-bg'); }

    if (fg) {
      el.style.setProperty('--label-fg', fg);
      el.style.setProperty('--label-shadow', 'none');
    } else {
      el.style.removeProperty('--label-fg');
      el.style.removeProperty('--label-shadow');
    }
  }

  /* ---- 一个方块最终长什么样，只在这里算一遍 ----
     画布和外观预览都调它，预览因此不可能和实际漂开。
     （以前预览另写一套固定数值：圆角写死 22%、间距写死 10px、没底色也画方盒阴影，
       和真实渲染差得肉眼可见。） */
  function solveFit(it, r, opt) {
    opt = opt || {};
    var ls = labelScaleValue();
    var ratio = r.width / r.height;

    /* 「是不是正方块」看它占了几格，不看像素长宽比：
       纵向间距拉大后 2×2 底板会比宽的略高，按像素算会被误判成非正方，
       布局就退化成「小图标 + 挤在一起的名称」 */
    var square = Math.abs(it.w / UNIT_W - it.h / UNIT_H) < 0.5;
    var horiz = !square && ratio > 1.65;   /* 2x1 / 4x2：图标在左，文字在右 */
    var vert = !square && ratio < 1 / 1.65;/* 1x2：图标在上，文字在下 */

    var s = Math.min(r.width, r.height);

    /* 1×1 的图标本身就是方块；更大的块需要一层同形状的底板把范围画出来 */
    var units = (it.w / UNIT_W) * (it.h / UNIT_H);
    var plate = units > 1.001;
    var unit = square && units <= 1.001;   /* 单格：图标铺满整块，名称独立挂在下面 */

    /* 单块字号只对底板方块开放：1×1 的名称挂在方块外面、正好住在行与行的空隙里，
       单独放大会直接压到下一行（实测 1.8× 会压 6px），所以它跟着全局「图标字号」走 */
    var fs = unit ? 1 : (opt.fs == null ? itemFontScale(it) : opt.fs);
    /* 这一块里图案的缩放（弹窗里的「Logo 大小」），再叠上全局那个 */
    var zoom = opt.zoom == null ? itemZoom(it) : opt.zoom;

    var ico, labelSize;
    var logoBase = 0;   /* 没被单块缩放时，图里那层图案的边长 */
    var pad = 0, gap = 0, labelH = 0;

    if (square) {
      if (unit) {
        /* 1×1：底板永远占满整格，只有里面的图案按「Logo 大小」缩；
           名称交给 CSS 定位到方块外面，不和图标抢高度，也就不会被裁掉 */
        ico = s;
        logoBase = s * iconScaleValue();
        labelSize = clamp(s * 0.15, 11, 16) * ls;
      } else {
        /* 2×2：图标坐在底板里，下面留出名称的完整行高 */
        labelSize = clamp(s * 0.125, 11.5, 15) * ls * fs;
        labelH = Math.ceil(labelSize * 1.15) + 1;
        pad = Math.round(s * 0.085);
        gap = Math.round(s * 0.035);
        ico = Math.max(16, Math.min(s - pad * 2 - gap - labelH - 1, s * 0.66));
        logoBase = ico;
      }
    } else if (horiz) {
      /* 宽扁方块：按高度取图标，否则 4x2 里图标会缩成一个小点 */
      ico = clamp(r.height * 0.72, 24, 150);
      logoBase = ico;
      labelSize = clamp(r.height * 0.15, 11, 20) * ls * fs;
    } else if (vert) {
      ico = clamp(r.width * 0.72, 24, 150);
      logoBase = ico;
      labelSize = clamp(r.width * 0.135, 11, 18) * ls * fs;
    } else {
      ico = clamp(s * 0.55, 22, 96);
      logoBase = ico;
      labelSize = clamp(ico * 0.22, 9.5, 15) * ls * fs;
    }

    return {
      square: square, horiz: horiz, vert: vert, plate: plate, unit: unit,
      s: s, fs: fs, zoom: zoom, r: r,
      ico: ico,
      /* 容器（底板）尺寸不吃 zoom：滑块调的是「里面的那张图案」，
         底板该多大还是多大，否则看起来就是整块图标在缩放 */
      icoPx: Math.max(8, Math.round(ico)),
      logoPx: Math.max(6, Math.round(logoBase * zoom)),
      labelSize: labelSize,
      pad: pad, gap: gap, labelH: labelH,
      /* 底板圆角和图标圆角同源：24% ≈ 原来的 0.17s */
      plateR: plate
        ? Math.round(clamp(s * (tuneNum(state.radius, TUNE.radius, 0, 50) / 100 * 0.72), 0, s * 0.5))
        : 0,
      /* 1×1 的名称挂在方块下面：只有全局「Logo 大小」把图案缩小时才往上收一点，
         单块 Logo 缩放不动底板，名称也就不跟着跳 */
      drop: unit ? Math.round((s - logoBase) / 2) : 0,
      maxW: unit
        ? 'calc(100% + 20px)'
        : (horiz ? Math.max(40, r.width - ico - 40) + 'px' : '100%')
    };
  }

  function applyFit(el, nm, p) {
    el.classList.toggle('h-layout', p.horiz);
    el.classList.toggle('is-square', p.square);
    el.classList.toggle('is-plate', p.plate);
    el.classList.toggle('is-unit', p.unit);

    if (p.plate) { el.style.setProperty('--plate-r', p.plateR + 'px'); }
    if (p.plate && p.square) {
      el.style.setProperty('--pad', p.pad + 'px');
      el.style.setProperty('--gap', p.gap + 'px');
      el.style.setProperty('--label', p.labelH + 'px');
    }
    el.style.setProperty('--ico', p.icoPx + 'px');
    /* 图片层比容器小多少，就是「Logo 大小」压了多少 */
    el.style.setProperty('--logo', p.logoPx + 'px');
    el.style.setProperty('--label-drop', p.drop + 'px');

    if (nm) {
      nm.style.fontSize = p.labelSize.toFixed(1) + 'px';
      nm.style.maxWidth = p.maxW;
    }
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
      var p = solveFit(item, r);
      paintTone(item, p.plate);
      applyFit(item.el, nm, p);
      /* 外观弹窗要用真实像素做读数与预览：labelPx 是最终值，
         baseLabelPx 只含全局字号，弹窗再乘单块倍数才不会重复相乘 */
      item.labelPx = p.labelSize;
      item.baseLabelPx = p.labelSize / p.fs;
      item.icoBase = p.ico;        /* 没乘单块缩放时的大小 */
      item.rectS = p.s;
      item.rect = r;
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

  /* ---------------- 通用组件注册表 ----------------

     新组件只要 registerWidget 一次，就会自动获得：出现在「添加组件」里、
     落位与尺寸下限、右键菜单（含布局档位）、序列化、删除、拖动/重排。

     每个 spec 可以提供：
       name     显示名            desc   一句话说明（子菜单里当提示）
       icon     ICONS 里的图标名   size   默认占位 {w,h}   min 最小占位
       sizes    右键「布局」里给的档位 [[w,h], ...]
       create() 新实例的初始 data
       clean(d) 从存储读回时洗一遍 data
       mount(it) 往 it.body 画东西，并挂 it.fit(rect)
       menu(it) 返回右键菜单节点数组（可选，删除项由外面统一加） */

  /* ---------- 卡面 ----------
     组件的底色不是画在组件里，而是铺在 .w-body 上：一层半透明底 + 模糊。
     颜色 / 浓度 / 圆角存在 item.look 里，和时钟、搜索框一个路数。 */
  var CARD_LOOK = {
    cardBg: '#ffffff',   /* '' = 不加底色 */
    cardAlpha: 14,       /* 0–100 */
    cardR: 20,           /* 0–32 px */
    cardBlur: true       /* 底下的模糊 */
  };
  var CARD_PRESETS = [
    ['', '无'], ['#ffffff', '白'], ['#000000', '黑'], ['#5b8cff', '蓝'],
    ['#4fd1c5', '青'], ['#a78bfa', '紫'], ['#f472b6', '粉'],
    ['#fb923c', '橙'], ['#4ade80', '绿'], ['#94a3b8', '灰']
  ];

  function cleanCardLook(raw) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    var o = {};
    if (typeof src.cardBg === 'string') {
      o.cardBg = (src.cardBg === '' || /^#[0-9a-f]{3,8}$/i.test(src.cardBg)) ? src.cardBg : CARD_LOOK.cardBg;
    }
    if (src.cardAlpha != null) { o.cardAlpha = Math.round(tuneNum(src.cardAlpha, CARD_LOOK.cardAlpha, 0, 100)); }
    if (src.cardR != null) { o.cardR = Math.round(tuneNum(src.cardR, CARD_LOOK.cardR, 0, 32)); }
    if (typeof src.cardBlur === 'boolean') { o.cardBlur = src.cardBlur; }
    return o;
  }

  function cardLook(it) {
    var r = (it && it.look) || {};
    var d = CARD_LOOK;
    return {
      cardBg: (typeof r.cardBg === 'string' &&
               (r.cardBg === '' || /^#[0-9a-f]{3,8}$/i.test(r.cardBg))) ? r.cardBg : d.cardBg,
      cardAlpha: Math.round(tuneNum(r.cardAlpha, d.cardAlpha, 0, 100)),
      cardR: Math.round(tuneNum(r.cardR, d.cardR, 0, 32)),
      cardBlur: r.cardBlur !== false
    };
  }

  function cardPatch(lk) {
    var out = {};
    Object.keys(CARD_LOOK).forEach(function (k) {
      if (lk[k] !== CARD_LOOK[k]) { out[k] = lk[k]; }
    });
    return out;
  }

  function cardCustom(it) {
    var lk = cardLook(it);
    return Object.keys(CARD_LOOK).some(function (k) { return lk[k] !== CARD_LOOK[k]; });
  }

  function hexRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    if (h.length !== 6) { return [255, 255, 255]; }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  /* 卡面唯一的落地处：画布和弹窗预览共用 */
  function applyCardLook(el, W, H, lk) {
    if (!el) { return; }
    var on = !!lk.cardBg && lk.cardAlpha > 0;
    el.classList.toggle('has-card', on);
    if (!on) { return; }
    var c = hexRgb(lk.cardBg);
    el.style.setProperty('--card-bg', 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' +
      (lk.cardAlpha / 100).toFixed(3) + ')');
    el.style.setProperty('--card-r', lk.cardR + 'px');
    el.classList.toggle('no-blur', !lk.cardBlur);
  }

  /* ---------------- 卡面设置 ---------------- */

  function openCardSettings(item) {
    if (dialogOpen) { return; }
    var draft = cardLook(item);

    var card = document.createElement('div');
    card.className = 'dlg-icon card-dlg';

    var head = document.createElement('div');
    head.className = 'dlg-head';
    var h3 = document.createElement('h3');
    h3.textContent = '卡面';
    var xBtn = document.createElement('button');
    xBtn.type = 'button';
    xBtn.className = 'dlg-x';
    xBtn.setAttribute('aria-label', '关闭');
    xBtn.appendChild(iconEl('x'));
    head.appendChild(h3);
    head.appendChild(xBtn);
    card.appendChild(head);

    var body = document.createElement('div');
    body.className = 'dlg-body';
    card.appendChild(body);

    var stage = document.createElement('div');
    stage.className = 'sp-stage';
    body.appendChild(stage);

    var pv = null;
    var box = { w: 400, h: 220 };

    function paint() {
      if (!pv) { return; }
      var k = Math.min(1, 420 / box.w, 250 / box.h);
      stage.style.width = Math.round(box.w * k) + 'px';
      stage.style.height = Math.round(box.h * k) + 'px';
      pv.style.width = box.w + 'px';
      pv.style.height = box.h + 'px';
      pv.style.transform = 'scale(' + k + ')';
      applyCardLook(pv, box.w, box.h, draft);
    }

    function rebuild() {
      var r = item.el.getBoundingClientRect();
      box = { w: Math.round(r.width), h: Math.round(r.height) };
      stage.textContent = '';
      pv = item.el.cloneNode(true);
      pv.className = 'widget sp-pv has-card';
      pv.style.left = '0px';
      pv.style.top = '0px';
      stage.appendChild(pv);
      paint();
    }

    /* ---- 颜色 ---- */
    var boxCol = document.createElement('div');
    boxCol.className = 'dlg-box';
    boxCol.appendChild(secTitle('底色'));

    var sw = document.createElement('div');
    sw.className = 'card-swatches';
    var swBtns = [];
    CARD_PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card-swat' + (draft.cardBg === p[0] ? ' is-active' : '');
      b.dataset.bg = p[0];
      b.title = p[1];
      b.setAttribute('aria-label', p[1]);
      if (p[0]) {
        b.style.background = p[0];
      } else {
        b.classList.add('is-none');
      }
      b.addEventListener('click', function () {
        draft.cardBg = p[0];
        swBtns.forEach(function (x) { x.classList.toggle('is-active', x === b); });
        paint();
      });
      sw.appendChild(b);
      swBtns.push(b);
    });
    boxCol.appendChild(sw);

    var alphaTune = tuneRow({
      key: 'cardAlpha', name: '浓度', min: 0, max: 100, step: 1, val: draft.cardAlpha,
      onInput: function (v) {
        draft.cardAlpha = Math.round(v);
        alphaTune.val(draft.cardAlpha + '%');
        paint();
      }
    });
    alphaTune.val(draft.cardAlpha + '%');
    boxCol.appendChild(alphaTune.root);

    var rTune = tuneRow({
      key: 'cardR', name: '圆角', min: 0, max: 32, step: 1, val: draft.cardR,
      onInput: function (v) {
        draft.cardR = Math.round(v);
        rTune.val(draft.cardR + ' px');
        paint();
      }
    });
    rTune.val(draft.cardR + ' px');
    boxCol.appendChild(rTune.root);

    var blurSeg = segField('模糊', [
      { label: '开', v: true },
      { label: '关', v: false }
    ], draft.cardBlur, function (v) {
      draft.cardBlur = v;
      paint();
    });
    boxCol.appendChild(blurSeg.root);
    body.appendChild(boxCol);

    var hint = document.createElement('p');
    hint.className = 'dlg-hint';
    hint.textContent = '底色铺在这一块下面，组件本身的内容不受影响；浓度 0 等于不要卡面。';
    body.appendChild(hint);

    /* ---- 底部 ---- */
    var foot = document.createElement('div');
    foot.className = 'dlg-foot';

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'text-btn tone-reset';
    reset.textContent = '恢复默认';
    reset.addEventListener('click', function () {
      draft = {
        cardBg: CARD_LOOK.cardBg, cardAlpha: CARD_LOOK.cardAlpha,
        cardR: CARD_LOOK.cardR, cardBlur: CARD_LOOK.cardBlur
      };
      swBtns.forEach(function (x) { x.classList.toggle('is-active', x.dataset.bg === draft.cardBg); });
      alphaTune.set(draft.cardAlpha); alphaTune.val(draft.cardAlpha + '%');
      rTune.set(draft.cardR); rTune.val(draft.cardR + ' px');
      blurSeg.set(true);
      paint();
    });
    foot.appendChild(reset);

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dlg-btn';
    cancel.textContent = '取消';
    foot.appendChild(cancel);

    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'dlg-primary';
    save.textContent = '保存';
    foot.appendChild(save);
    card.appendChild(foot);

    var wrap = buildScrim(card);

    function close() {
      closeScrim(wrap);
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
    }

    xBtn.addEventListener('click', close);
    cancel.addEventListener('click', close);
    save.addEventListener('click', function () {
      item.look = cardPatch(draft);
      close();
      layoutAll();
      scheduleSave();
    });
    wrap.addEventListener('pointerdown', function (e) { if (e.target === wrap) { close(); } });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(wrap);
    dialogOpen = true;
    hideMenu();
    rebuild();
  }

  var widgets = [];
  var widgetMap = {};

  function registerWidget(type, spec) {
    if (widgetMap[type]) { return widgetMap[type]; }
    spec.type = type;
    spec.min = spec.min || { w: 4, h: 2 };
    spec.size = spec.size || spec.min;
    widgetMap[type] = spec;
    widgets.push(spec);
    MIN_SIZE[type] = { w: spec.min.w, h: spec.min.h };
    return spec;
  }

  function widgetSpec(t) { return widgetMap[t] || null; }

  /* 组件的数据统一放 item.data，读回来先过各自的 clean */
  function cleanWidgetData(type, raw) {
    var sp = widgetSpec(type);
    if (!sp) { return {}; }
    if (sp.clean) { return sp.clean(raw && typeof raw === 'object' ? raw : {}); }
    return (raw && typeof raw === 'object') ? raw : {};
  }

  /* ---------- 天气 ---------- */

  var WX_DEFAULT = { city: '北京', lat: 39.9042, lon: 116.4074 };

  function wxKind(code) {
    if (code === 0) { return 'sun'; }
    if (code <= 2) { return 'part'; }
    if (code === 3) { return 'cloud'; }
    if (code === 45 || code === 48) { return 'fog'; }
    if (code >= 51 && code <= 67) { return 'rain'; }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) { return 'snow'; }
    if (code >= 80 && code <= 82) { return 'rain'; }
    if (code >= 95) { return 'storm'; }
    return 'cloud';
  }

  var WX_NAME = {
    sun: '晴', part: '多云', cloud: '阴', fog: '雾',
    rain: '雨', snow: '雪', storm: '雷阵雨'
  };

  var WX_PATHS = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/>',
    part: '<circle cx="9.2" cy="9" r="3"/><path d="M9.2 3.6v1.5M4.4 9H2.9M5.5 5.3L4.4 4.2"/>' +
      '<path d="M9 19h8.6a3.1 3.1 0 0 0 .2-6.2 4.4 4.4 0 0 0-8.4 1.2A2.6 2.6 0 0 0 9 19z"/>',
    cloud: '<path d="M7 18.4h10a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 7 18.4z"/>',
    rain: '<path d="M7 15.4h10a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 7 15.4z"/>' +
      '<path d="M9 18l-.9 2.2M13 18l-.9 2.2M17 18l-.9 2.2"/>',
    snow: '<path d="M7 15.4h10a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 7 15.4z"/>' +
      '<path d="M9.3 18.4v2.4M8.3 19l2 1.2M10.3 19l-2 1.2M15 18.4v2.4M14 19l2 1.2M16 19l-2 1.2"/>',
    storm: '<path d="M7 14.4h10a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 7 14.4z"/>' +
      '<path d="M12.7 16.2l-2.3 3.4h2.4l-1 3.4 3.3-4.2h-2.4z"/>',
    fog: '<path d="M5 9.4h14M4 13h13M6 16.6h13M8 20.2h9"/>'
  };

  function wxIcon(kind) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (WX_PATHS[kind] || WX_PATHS.cloud) + '</svg>';
  }

  function wxData(item) {
    var d = item.data || {};
    var city = typeof d.city === 'string' && d.city.trim() ? d.city.trim().slice(0, 16) : WX_DEFAULT.city;
    var lat = Number(d.lat);
    var lon = Number(d.lon);
    if (!isFinite(lat) || !isFinite(lon) || (!lat && !lon)) {
      lat = WX_DEFAULT.lat; lon = WX_DEFAULT.lon;
    }
    return {
      city: city, lat: lat, lon: lon,
      cache: (d.cache && typeof d.cache === 'object' &&
              isFinite(Number(d.cache.temp))) ? d.cache : null
    };
  }

  var WX_DAY_MAX = 7;
  var WX_HOUR_MAX = 24;

  /* 显示哪些块：设置弹窗里勾，存在 data.show 上；layout 决定"多大算大" */
  var WX_SHOW = { detail: true, days: true, hours: true, stats: true };
  var WX_LAYOUTS = ['auto', 'compact', 'full'];

  function wxOpts(item) {
    var d = (item && item.data) || {};
    var s = (d.show && typeof d.show === 'object') ? d.show : {};
    return {
      layout: WX_LAYOUTS.indexOf(d.layout) >= 0 ? d.layout : 'auto',
      show: {
        detail: s.detail !== false,
        days: s.days !== false,
        hours: s.hours !== false,
        stats: s.stats !== false
      }
    };
  }

  function wxOptsPatch(o) {
    var out = { layout: o.layout, show: {} };
    Object.keys(WX_SHOW).forEach(function (k) {
      if (o.show[k] !== WX_SHOW[k]) { out.show[k] = o.show[k]; }
    });
    if (!Object.keys(out.show).length) { delete out.show; }
    return out;
  }

  function wxClean(raw) {
    var out = {};
    var d = raw || {};
    if (WX_LAYOUTS.indexOf(d.layout) >= 0) { out.layout = d.layout; }
    if (d.show && typeof d.show === 'object') {
      var sh = {};
      Object.keys(WX_SHOW).forEach(function (k) {
        if (typeof d.show[k] === 'boolean') { sh[k] = d.show[k]; }
      });
      if (Object.keys(sh).length) { out.show = sh; }
    }
    if (typeof d.city === 'string') { out.city = d.city.trim().slice(0, 16); }
    if (isFinite(Number(d.lat))) { out.lat = Number(d.lat); }
    if (isFinite(Number(d.lon))) { out.lon = Number(d.lon); }
    var c = d.cache;
    if (c && typeof c === 'object' && isFinite(Number(c.temp))) {
      var num = function (v) { return isFinite(Number(v)) ? Math.round(Number(v)) : null; };
      var days = Array.isArray(c.days) ? c.days.slice(0, WX_DAY_MAX).map(function (o) {
        return (o && typeof o === 'object') ? {
          d: (typeof o.d === 'string' && o.d ? o.d.slice(0, 2) : ''),
          hi: num(o.hi), lo: num(o.lo),
          k: WX_NAME[o.k] ? o.k : 'cloud'
        } : null;
      }).filter(function (o) { return o && o.hi != null && o.lo != null; }) : [];
      var hours = Array.isArray(c.hours) ? c.hours.slice(0, WX_HOUR_MAX).map(function (o) {
        return (o && isFinite(Number(o.t)) && isFinite(Number(o.h))) ? {
          h: Math.round(Number(o.h)) % 24, t: Math.round(Number(o.t))
        } : null;
      }).filter(Boolean) : [];

      out.cache = {
        at: isFinite(Number(c.at)) ? Number(c.at) : Date.now(),
        temp: Math.round(Number(c.temp)),
        hi: num(c.hi),
        lo: num(c.lo),
        feel: num(c.feel),
        hum: num(c.hum),
        wind: num(c.wind),
        press: num(c.press),
        pop: num(c.pop),
        sunr: (typeof c.sunr === 'string' ? c.sunr.slice(0, 5) : ''),
        suns: (typeof c.suns === 'string' ? c.suns.slice(0, 5) : ''),
        kind: WX_NAME[c.kind] ? c.kind : 'cloud',
        days: days,
        hours: hours
      };
    }
    return out;
  }

  /* 8 秒超时；连不上就 reject，由调用方决定怎么显示 */
  function wxFetch(url) {
    return new Promise(function (resolve, reject) {
      var ctl = null;
      var timer = window.setTimeout(function () {
        try { if (ctl) { ctl.abort(); } } catch (e) {}
        reject(new Error('timeout'));
      }, 8000);
      function done(fn, v) {
        window.clearTimeout(timer);
        fn(v);
      }
      try {
        ctl = new AbortController();
        fetch(url, { cache: 'no-store', signal: ctl.signal }).then(function (r) {
          if (!r.ok) { throw new Error('http ' + r.status); }
          return r.json();
        }).then(function (j) { done(resolve, j); },
                function (e) { done(reject, e); });
      } catch (e) {
        done(reject, e);
      }
    });
  }

  var wxBusy = {};

  /* 按实际像素分档：块越小越只剩「一眼」的信息，越大越往里填内容。
     用像素而不是格数，是因为格子的实际大小会随屏幕和密度变 */
  function wxTier(w, h, opt) {
    var layout = (opt && opt.layout) || 'auto';
    if (layout === 'compact') {
      /* 只看当前天气：再大也不往预报上分地方 */
      return (h < 120 || w < 190) ? 'mini' : 'mid';
    }
    var full = layout === 'full';
    if (h < (full ? 92 : 120) || w < (full ? 168 : 190)) { return 'mini'; }
    if (h < (full ? 168 : 250) || w < (full ? 300 : 360)) { return 'mid'; }
    if (h < (full ? 248 : 360)) { return 'big'; }
    return 'huge';
  }

  function wxWeekChar(iso) {
    /* Open-Meteo 的 daily.time 是 YYYY-MM-DD（当地日期） */
    var p = String(iso || '').split('-');
    if (p.length !== 3) { return ''; }
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? '' : WEEK[d.getDay()];
  }

  function paintWeather(item) {
    if (!item.wxTemp) { return; }
    var d = wxData(item);
    var c = d.cache;

    if (!c) {
      item.wxTemp.innerHTML = '<span class="wx-num">--</span>';
      item.wxIco.innerHTML = wxIcon('cloud');
      item.wxCity.textContent = item.wxErr ? '连不上天气' : d.city;
      item.wxHl.textContent = item.wxErr ? '右键重试' : '获取中…';
      item.wxDetail.textContent = '';
      item.wxDays.textContent = '';
      item.wxHours.textContent = '';
      item.el.title = d.city;
      return;
    }

    item.wxTemp.innerHTML = '<span class="wx-num">' + c.temp + '</span>' +
      '<span class="wx-deg">°</span>';
    item.wxIco.innerHTML = wxIcon(c.kind);
    item.wxCity.textContent = d.city;
    item.wxHl.textContent = (c.hi != null && c.lo != null)
      ? c.hi + '° / ' + c.lo + '°'
      : (WX_NAME[c.kind] || '');
    item.el.title = d.city + '　' + (WX_NAME[c.kind] || '') + '　更新于 ' +
      new Date(c.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    /* 第二行小字只放「一眼信息」：天气名 + 体感。
       湿度 / 风 / 气压那些归下面的指标行 —— 曾经两行都写，重复得很傻 */
    var bits = [WX_NAME[c.kind] || ''];
    if (c.feel != null) { bits.push('体感 ' + c.feel + '°'); }
    item.wxDetail.textContent = bits.filter(Boolean).join(' · ');

    /* 未来几天：低温 — 温度条 — 高温，条的位置按整周的跨度算 */
    item.wxDays.textContent = '';
    var ds = (c.days || []).slice(0, item.wxDayCols || 5);
    var lo0 = Math.min.apply(null, ds.map(function (o) { return o.lo; }));
    var hi0 = Math.max.apply(null, ds.map(function (o) { return o.hi; }));
    var span = Math.max(1, hi0 - lo0);

    ds.forEach(function (o) {
      var col = document.createElement('div');
      col.className = 'wx-day';

      var w = document.createElement('span');
      w.className = 'wx-dw';
      w.textContent = o.d ? '周' + o.d : '';

      var ic = document.createElement('span');
      ic.className = 'wx-dico';
      ic.innerHTML = wxIcon(o.k);

      var row = document.createElement('span');
      row.className = 'wx-dtemps';
      var lo = document.createElement('b');
      lo.className = 'wx-dlo';
      lo.textContent = o.lo + '°';
      var bar = document.createElement('i');
      bar.className = 'wx-dbar';
      var fill = document.createElement('u');
      var a = (o.lo - lo0) / span;
      var b = (o.hi - lo0) / span;
      fill.style.left = (a * 100).toFixed(1) + '%';
      fill.style.width = Math.max(12, (b - a) * 100).toFixed(1) + '%';
      bar.appendChild(fill);
      var hi = document.createElement('b');
      hi.className = 'wx-dhi';
      hi.textContent = o.hi + '°';
      row.appendChild(lo);
      row.appendChild(bar);
      row.appendChild(hi);

      col.appendChild(w);
      col.appendChild(ic);
      col.appendChild(row);
      item.wxDays.appendChild(col);
    });

    /* 逐小时：竖条高度按这 12 小时的跨度 */
    item.wxHours.textContent = '';
    var hs = (c.hours || []).slice(0, item.wxHourCols || 12);
    var t0 = Math.min.apply(null, hs.map(function (o) { return o.t; }));
    var t1 = Math.max.apply(null, hs.map(function (o) { return o.t; }));
    var tspan = Math.max(1, t1 - t0);

    hs.forEach(function (o) {
      var col = document.createElement('div');
      col.className = 'wx-hour';
      var v = document.createElement('span');
      v.className = 'wx-ht';
      v.textContent = o.t + '°';
      var bar = document.createElement('i');
      bar.className = 'wx-hbar';
      var fill = document.createElement('u');
      fill.style.height = (28 + 72 * (o.t - t0) / tspan).toFixed(0) + '%';
      bar.appendChild(fill);
      var h = document.createElement('span');
      h.className = 'wx-hh';
      h.textContent = pad2(o.h) + ':00';
      col.appendChild(v);
      col.appendChild(bar);
      col.appendChild(h);
      item.wxHours.appendChild(col);
    });

    /* 指标行：气压 / 降水概率 / 日出日落，有什么填什么 */
    item.wxStats.textContent = '';
    [['湿度', c.hum != null ? c.hum + '%' : ''],
     ['风', c.wind != null ? c.wind + ' km/h' : ''],
     ['气压', c.press != null ? c.press + ' hPa' : ''],
     ['降水', c.pop != null ? c.pop + '%' : ''],
     ['日出', c.sunr || ''],
     ['日落', c.suns || '']].forEach(function (p) {
      if (!p[1]) { return; }
      var box = document.createElement('span');
      box.className = 'wx-stat';
      var k = document.createElement('i');
      k.textContent = p[0];
      var v = document.createElement('b');
      v.textContent = p[1];
      box.appendChild(k);
      box.appendChild(v);
      item.wxStats.appendChild(box);
    });

    wxRelayout(item);
  }

  /* 分档：切 class + 按档位重算字号。DOM 只建一次，这里只改显示 */
  var wxLastTier = {};

  function wxRelayout(item) {
    var r = item.el ? item.el.getBoundingClientRect() : null;
    if (!r) { return; }
    wxLayout(item, r.width, r.height);
  }

  function wxLayout(item, W, H) {
    /* 分档按「这一块占了几格」算，不读 getBoundingClientRect：
       方块有尺寸过渡，改大小那一帧量到的是动画中间值（曾经因此一直停在 mid） */
    if (item.w && item.h) {
      var mm = metrics();
      W = item.w * mm.stepX - mm.gapX;
      H = item.h * mm.stepY - mm.rowGap;
    }
    var opt = wxOpts(item);
    var tier = wxTier(W, H, opt);
    item.el.classList.remove('is-mini', 'is-mid', 'is-big', 'is-huge');
    item.el.classList.add('is-' + tier);
    item.el.dataset.wxTier = tier + ' ' + Math.round(W) + 'x' + Math.round(H);

    /* 设置里没勾的块直接关掉，跟尺寸无关 */
    item.el.classList.toggle('no-days', !opt.show.days);
    item.el.classList.toggle('no-hours', !opt.show.hours);
    item.el.classList.toggle('no-detail', !opt.show.detail);
    item.el.classList.toggle('show-stats', opt.show.stats);
    /* 体感那一行要宽度，窄块只留温度和城市 */
    item.el.classList.toggle('show-detail',
      opt.show.detail && tier !== 'mini' && W >= 300);

    /* 够宽就多排几格：天数最多 7，小时最多 24 */
    var dCols = clamp(Math.floor((W - 16) / 92), 3, 7);
    var hCols = clamp(Math.floor((W - 16) / 44), 6, 24);
    if (item.wxDayCols !== dCols || item.wxHourCols !== hCols) {
      item.wxDayCols = dCols;
      item.wxHourCols = hCols;
      paintWeather(item);      /* 重绘一次，里面会再回调这里；列数已相等，不会无限递归 */
    }

    var t;
    if (tier === 'mini') {
      t = clamp(Math.min(H * 0.62, W * 0.34), 16, 90);
    } else if (tier === 'mid') {
      t = clamp(Math.min(H * 0.46, W * 0.26), 16, 120);
    } else {
      /* 大块里上半部分是当前天气，下半部分留给预报 */
      t = clamp(Math.min(H * (tier === 'huge' ? 0.22 : 0.28), W * 0.20), 24, 140);
    }
    item.wxTemp.style.fontSize = t.toFixed(1) + 'px';
    var ic = Math.round(clamp(t * 0.74, 14, 64));
    item.wxIco.style.width = ic + 'px';
    item.wxIco.style.height = ic + 'px';
    var s = clamp(t * 0.20, 9.5, 16);
    item.wxCity.style.fontSize = s.toFixed(1) + 'px';
    item.wxHl.style.fontSize = s.toFixed(1) + 'px';
    if (item.wxDetail) {
      item.wxDetail.style.fontSize = clamp(s * 0.92, 9, 14).toFixed(1) + 'px';
    }

    /* 预报卡片跟着块大小走 */
    item.el.style.setProperty('--wx-day-fs', clamp(W / 26, 10, 16).toFixed(1) + 'px');
    item.el.style.setProperty('--wx-hour-fs', clamp(W / 30, 9, 14).toFixed(1) + 'px');
    item.el.style.setProperty('--wx-stat-fs', clamp(W / 44, 9.5, 13).toFixed(1) + 'px');
  }

  function wxRefresh(item) {
    if (!item || wxBusy[item.id]) { return; }
    var d = wxData(item);
    wxBusy[item.id] = true;
    item.wxErr = '';
    if (!d.cache) { paintWeather(item); }

    /* forecast_days 只能写一次：写两次时后一个会盖掉前一个（曾经只回了 1 天） */
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + d.lat +
      '&longitude=' + d.lon +
      '&current=temperature_2m,weather_code,apparent_temperature,' +
      'relative_humidity_2m,wind_speed_10m,surface_pressure' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,' +
      'precipitation_probability_max,sunrise,sunset' +
      '&hourly=temperature_2m&forecast_days=7&timezone=auto';

    wxFetch(url).then(function (j) {
      var cur = j && j.current;
      if (!cur || !isFinite(Number(cur.temperature_2m))) { throw new Error('bad json'); }

      var day = j.daily || {};
      var days = [];
      var codes = day.weather_code || [];
      var his = day.temperature_2m_max || [];
      var los = day.temperature_2m_min || [];
      /* 第 0 天是今天，预报从明天开始 */
      for (var i = 1; i < (day.time || []).length && days.length < 6; i++) {
        if (his[i] == null || los[i] == null) { continue; }
        days.push({
          d: wxWeekChar(day.time[i]),
          hi: Math.round(Number(his[i])),
          lo: Math.round(Number(los[i])),
          k: wxKind(Number(codes[i]))
        });
      }

      /* 逐小时：从「当前这一小时」起取 12 条 */
      var hourly = j.hourly || {};
      var hours = [];
      var hts = hourly.temperature_2m || [];
      if (hourly.time && hts.length) {
        var nowH = new Date();
        var from = 0;
        for (var k = 0; k < hourly.time.length; k++) {
          var dt = new Date(hourly.time[k]);
          if (dt.getTime() >= nowH.getTime() - 30 * 60 * 1000) { from = k; break; }
        }
        for (var m2 = from; m2 < hourly.time.length && hours.length < 12; m2++) {
          if (hts[m2] == null) { continue; }
          hours.push({
            h: new Date(hourly.time[m2]).getHours(),
            t: Math.round(Number(hts[m2]))
          });
        }
      }

      item.data = item.data || {};
      item.data.city = d.city;
      item.data.lat = d.lat;
      item.data.lon = d.lon;
      item.data.cache = wxClean({
        city: d.city, lat: d.lat, lon: d.lon,
        cache: {
          at: Date.now(),
          temp: Math.round(Number(cur.temperature_2m)),
          hi: his[0] == null ? null : Math.round(Number(his[0])),
          lo: los[0] == null ? null : Math.round(Number(los[0])),
          kind: wxKind(Number(cur.weather_code)),
          feel: cur.apparent_temperature == null ? null : Math.round(Number(cur.apparent_temperature)),
          hum: cur.relative_humidity_2m == null ? null : Math.round(Number(cur.relative_humidity_2m)),
          wind: cur.wind_speed_10m == null ? null : Math.round(Number(cur.wind_speed_10m)),
          press: cur.surface_pressure == null ? null : Math.round(Number(cur.surface_pressure)),
          pop: (day.precipitation_probability_max && day.precipitation_probability_max[0] != null)
            ? Math.round(Number(day.precipitation_probability_max[0])) : null,
          sunr: (day.sunrise && day.sunrise[0]) ? String(day.sunrise[0]).slice(11, 16) : '',
          suns: (day.sunset && day.sunset[0]) ? String(day.sunset[0]).slice(11, 16) : '',
          days: days,
          hours: hours
        }
      }).cache;
      paintWeather(item);
      scheduleSave();
    }).catch(function () {
      item.wxErr = '1';
      paintWeather(item);
    }).then(function () { wxBusy[item.id] = false; });
  }

  function wxMaybeRefresh(item) {
    var c = wxData(item).cache;
    if (!c || Date.now() - Number(c.at) > 15 * 60 * 1000) { wxRefresh(item); return; }
    /* 老版本的缓存里没有 days / hours，光看时间戳不会刷新 —— 升级后天气会一直「只有温度」 */
    if (!c.days || !c.days.length || !c.hours || !c.hours.length) { wxRefresh(item); }
  }

  function wxAskCity(item) {
    openDialog('城市', [{
      key: 'city', label: '城市 / 地区', icon: 'search',
      value: wxData(item).city, placeholder: '例如 杭州、Tokyo'
    }], function (v) {
      var q = (v.city || '').trim();
      if (!q) { return; }
      showTip('正在查「' + q + '」', 1400);
      wxFetch('https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&language=zh&name=' +
              encodeURIComponent(q)).then(function (j) {
        var r = j && j.results && j.results[0];
        if (!r) { throw new Error('not found'); }
        item.data = item.data || {};
        item.data.city = String(r.name || q).slice(0, 16);
        item.data.lat = Number(r.latitude);
        item.data.lon = Number(r.longitude);
        item.data.cache = null;
        item.wxErr = '';
        paintWeather(item);
        wxRefresh(item);
        scheduleSave();
      }).catch(function () {
        showTip('查不到「' + q + '」，换个说法再试（英文名更准）', 3600);
      });
    });
  }

  /* ---------------- 天气设置 ---------------- */

  function openWeatherSettings(item) {
    if (dialogOpen) { return; }
    var draft = wxOpts(item);

    var card = document.createElement('div');
    card.className = 'dlg-icon card-dlg';

    var head = document.createElement('div');
    head.className = 'dlg-head';
    var h3 = document.createElement('h3');
    h3.textContent = '天气显示';
    var xBtn = document.createElement('button');
    xBtn.type = 'button';
    xBtn.className = 'dlg-x';
    xBtn.setAttribute('aria-label', '关闭');
    xBtn.appendChild(iconEl('x'));
    head.appendChild(h3);
    head.appendChild(xBtn);
    card.appendChild(head);

    var body = document.createElement('div');
    body.className = 'dlg-body';
    card.appendChild(body);

    var boxL = document.createElement('div');
    boxL.className = 'dlg-box';
    boxL.appendChild(secTitle('版式'));

    var layoutSeg = segField('', [
      { label: '自动', v: 'auto' },
      { label: '紧凑', v: 'compact' },
      { label: '详细', v: 'full' }
    ], draft.layout, function (v) {
      draft.layout = v;
      rebuild();
    });
    layoutSeg.root.querySelector('.tune-head').remove();
    boxL.appendChild(layoutSeg.root);

    var boxS = document.createElement('div');
    boxS.className = 'dlg-box';
    boxS.appendChild(secTitle('显示内容'));

    var toggles = document.createElement('div');
    toggles.className = 'wx-toggles';
    var tgBtns = {};
    [['detail', '天气名 · 体感'], ['days', '未来几天'],
     ['hours', '逐小时'], ['stats', '湿度 · 风 · 气压 · 降水 · 日出日落']].forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wx-tg' + (draft.show[p[0]] ? ' is-on' : '');
      b.textContent = p[1];
      b.dataset.k = p[0];
      b.addEventListener('click', function () {
        draft.show[p[0]] = !draft.show[p[0]];
        b.classList.toggle('is-on', draft.show[p[0]]);
        rebuild();
      });
      toggles.appendChild(b);
      tgBtns[p[0]] = b;
    });
    boxS.appendChild(toggles);

    var hint = document.createElement('p');
    hint.className = 'dlg-hint';
    hint.textContent = '「自动」按这一块的实际大小决定放多少内容；「紧凑」只留当前天气；' +
      '「详细」把阈值放低，同样大小能塞下更多。勾上的项在放不下时仍会自动省略。';
    boxS.appendChild(hint);

    body.appendChild(boxL);
    body.appendChild(boxS);

    /* ---- 预览 ---- */
    var stage = document.createElement('div');
    stage.className = 'sp-stage';
    body.insertBefore(stage, body.firstChild);

    var pv = null;
    var box = { w: 400, h: 220 };

    function rebuild() {
      var r = item.el.getBoundingClientRect();
      box = { w: Math.round(r.width), h: Math.round(r.height) };
      stage.textContent = '';
      pv = item.el.cloneNode(true);
      pv.className = 'widget sp-pv';
      pv.style.left = '0px';
      pv.style.top = '0px';
      stage.appendChild(pv);
      paint();
    }

    function paint() {
      if (!pv) { return; }
      var k = Math.min(1, 460 / box.w, 260 / box.h);
      stage.style.width = Math.round(box.w * k) + 'px';
      stage.style.height = Math.round(box.h * k) + 'px';
      pv.style.width = box.w + 'px';
      pv.style.height = box.h + 'px';
      pv.style.transform = 'scale(' + k + ')';
      /* 预览用的是同一套分档逻辑：把 draft 临时挂上去算一次 */
      var backup = item.data;
      item.data = { layout: draft.layout, show: draft.show };
      applyCardLook(pv, box.w, box.h, cardLook(item));
      wxPreviewLayout(pv, item, box.w, box.h);
      item.data = backup;
    }

    /* ---- 底部 ---- */
    var foot = document.createElement('div');
    foot.className = 'dlg-foot';

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'text-btn tone-reset';
    reset.textContent = '恢复默认';
    reset.addEventListener('click', function () {
      draft = {
        layout: 'auto',
        show: {
          detail: WX_SHOW.detail, days: WX_SHOW.days,
          hours: WX_SHOW.hours, stats: WX_SHOW.stats
        }
      };
      layoutSeg.set('auto');
      Object.keys(tgBtns).forEach(function (k) {
        tgBtns[k].classList.toggle('is-on', draft.show[k]);
      });
      rebuild();
    });
    foot.appendChild(reset);

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dlg-btn';
    cancel.textContent = '取消';
    foot.appendChild(cancel);

    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'dlg-primary';
    save.textContent = '保存';
    foot.appendChild(save);
    card.appendChild(foot);

    var wrap = buildScrim(card);

    function close() {
      closeScrim(wrap);
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
    }

    xBtn.addEventListener('click', close);
    cancel.addEventListener('click', close);
    save.addEventListener('click', function () {
      var patch = wxOptsPatch(draft);
      item.data = item.data || {};
      item.data.layout = patch.layout;
      item.data.show = patch.show || {};
      close();
      paintWeather(item);
      layoutAll();
      scheduleSave();
    });
    wrap.addEventListener('pointerdown', function (e) { if (e.target === wrap) { close(); } });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(wrap);
    dialogOpen = true;
    hideMenu();
    rebuild();
  }

  /* 预览里的天气：按给定尺寸重新分档并排一遍（不碰真实 item 的数据） */
  function wxPreviewLayout(pv, item, W, H) {
    var opt = wxOpts(item);
    var tier = wxTier(W, H, opt);
    pv.classList.remove('is-mini', 'is-mid', 'is-big', 'is-huge');
    pv.classList.add('is-' + tier);
    pv.classList.toggle('no-days', !opt.show.days);
    pv.classList.toggle('no-hours', !opt.show.hours);
    pv.classList.toggle('no-detail', !opt.show.detail);
    pv.classList.toggle('show-stats', opt.show.stats);
    pv.classList.toggle('show-detail', opt.show.detail && tier !== 'mini' && W >= 300);

    var t = pv.querySelector('.wx-temp');
    var ico = pv.querySelector('.wx-ico');
    var city = pv.querySelector('.wx-city');
    var hl = pv.querySelector('.wx-hl');
    var det = pv.querySelector('.wx-detail');
    if (!t) { return; }

    var size;
    if (tier === 'mini') { size = clamp(Math.min(H * 0.62, W * 0.34), 16, 90); }
    else if (tier === 'mid') { size = clamp(Math.min(H * 0.46, W * 0.26), 16, 120); }
    else { size = clamp(Math.min(H * (tier === 'huge' ? 0.22 : 0.28), W * 0.20), 24, 140); }

    t.style.fontSize = size.toFixed(1) + 'px';
    var ic = Math.round(clamp(size * 0.74, 14, 64));
    if (ico) { ico.style.width = ic + 'px'; ico.style.height = ic + 'px'; }
    var s = clamp(size * 0.20, 9.5, 16);
    if (city) { city.style.fontSize = s.toFixed(1) + 'px'; }
    if (hl) { hl.style.fontSize = s.toFixed(1) + 'px'; }
    if (det) { det.style.fontSize = clamp(s * 0.92, 9, 14).toFixed(1) + 'px'; }
    pv.style.setProperty('--wx-day-fs', clamp(W / 26, 10, 16).toFixed(1) + 'px');
    pv.style.setProperty('--wx-hour-fs', clamp(W / 30, 9, 14).toFixed(1) + 'px');
    pv.style.setProperty('--wx-stat-fs', clamp(W / 44, 9.5, 13).toFixed(1) + 'px');
  }

  registerWidget('weather', {
    name: '天气', desc: '实时气温 / 未来几天 · 逐小时', icon: 'cloud',
    size: { w: 8, h: 4 }, min: { w: 4, h: 3 },
    sizes: [[4, 3], [6, 4], [8, 4], [8, 6], [12, 8], [12, 10]],
    create: function () {
      return { city: WX_DEFAULT.city, lat: WX_DEFAULT.lat, lon: WX_DEFAULT.lon, cache: null };
    },
    clean: wxClean,
    mount: function (item) {
      makeShell(item);
      var root = document.createElement('div');
      root.className = 'wx';
      root.innerHTML =
        '<div class="wx-main">' +
          '<div class="wx-top"><span class="wx-ico"></span><span class="wx-temp">--</span></div>' +
          '<div class="wx-bot"><span class="wx-city"></span><span class="wx-hl"></span></div>' +
          '<div class="wx-detail"></div>' +
        '</div>' +
        '<div class="wx-stats"></div>' +
        '<div class="wx-days"></div>' +
        '<div class="wx-hours"></div>';
      item.body.appendChild(root);
      item.wxIco = root.querySelector('.wx-ico');
      item.wxTemp = root.querySelector('.wx-temp');
      item.wxCity = root.querySelector('.wx-city');
      item.wxHl = root.querySelector('.wx-hl');
      item.wxDetail = root.querySelector('.wx-detail');
      item.wxStats = root.querySelector('.wx-stats');
      item.wxDays = root.querySelector('.wx-days');
      item.wxHours = root.querySelector('.wx-hours');

      item.fit = function (r) {
        wxLayout(item, r.width, r.height);
      };

      paintWeather(item);
      wxMaybeRefresh(item);
    },
    menu: function (item) {
      var o = wxOpts(item);
      return [
        mItem('天气显示…', function () { openWeatherSettings(item); }, {
          icon: 'layout',
          hint: o.layout !== 'auto' ? (o.layout === 'compact' ? '紧凑' : '详细') : ''
        }),
        mItem('换城市', function () { wxAskCity(item); }, { icon: 'search', hint: wxData(item).city }),
        mItem('立即刷新', function () { wxRefresh(item); }, { icon: 'reset' })
      ];
    }
  });

  /* ---------- 待办 ---------- */

  function todoClean(raw) {
    var list = Array.isArray(raw.items) ? raw.items : [];
    var out = [];
    list.slice(0, 60).forEach(function (o) {
      if (!o || typeof o.text !== 'string' || !o.text.trim()) { return; }
      out.push({
        id: typeof o.id === 'string' && o.id ? o.id.slice(0, 24) : uid(),
        text: o.text.trim().slice(0, 80),
        done: !!o.done
      });
    });
    return { items: out };
  }

  function todoList(item) {
    var d = item.data || {};
    return Array.isArray(d.items) ? d.items : [];
  }

  function mountTodo(item) {
    makeShell(item);
    var root = document.createElement('div');
    root.className = 'todo';
    root.innerHTML =
      '<div class="todo-head">' +
        '<span class="todo-name">待办</span>' +
        '<span class="todo-count"></span>' +
        '<button type="button" class="todo-plus" aria-label="添加待办">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round"><path d="M12 5.5v13M5.5 12h13"/></svg>' +
        '</button>' +
      '</div>' +
      '<form class="todo-new" hidden>' +
        '<input type="text" maxlength="80" placeholder="要做什么？回车添加" ' +
        'aria-label="新的待办">' +
      '</form>' +
      '<div class="todo-list"></div>';
    item.body.appendChild(root);
    item.todoList = root.querySelector('.todo-list');
    item.todoCount = root.querySelector('.todo-count');
    item.todoForm = root.querySelector('.todo-new');
    item.todoInput = root.querySelector('.todo-new input');
    item.todoAdd = root.querySelector('.todo-plus');
    item.todoHead = root.querySelector('.todo-head');

    function save() { scheduleSave(); }

    function toggle(id) {
      var list = todoList(item);
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { list[i].done = !list[i].done; break; }
      }
      render();
      save();
    }

    function drop(id) {
      item.data.items = todoList(item).filter(function (o) { return o.id !== id; });
      render();
      save();
    }

    function push(text) {
      var t = String(text || '').trim().slice(0, 80);
      if (!t) { return; }
      item.data = item.data || {};
      item.data.items = todoList(item).concat([{ id: uid(), text: t, done: false }]);
      render();
      save();
    }

    function render() {
      var list = todoList(item);
      var left = list.filter(function (o) { return !o.done; }).length;
      item.todoCount.textContent = list.length ? left + ' / ' + list.length : '';
      item.todoList.textContent = '';

      if (!list.length) {
        var empty = document.createElement('div');
        empty.className = 'todo-empty';
        empty.textContent = '还没有待办，点右上角 + 加一条';
        item.todoList.appendChild(empty);
        return;
      }

      /* 按「这块能放下几行」截断：块小就只留最上面几条，剩下的折成一行提示。
         点那行切成滚动模式，全都能看到 */
      var cap = item.todoExpand ? list.length : (item.todoCap || list.length);
      /* 要截断就得给「还有 N 条」腾出一行，否则它会被底边切一半 */
      if (!item.todoExpand && list.length > cap && cap > 1) { cap -= 1; }
      var sorted = list.slice().sort(function (a, b) {
        return (a.done ? 1 : 0) - (b.done ? 1 : 0);
      });
      var rest = list.length - cap;

      /* 未完成的在上面，完成的沉到底部 */
      sorted.slice(0, cap).forEach(function (o) {
        var row = document.createElement('div');
        row.className = 'todo-row' + (o.done ? ' is-done' : '');
        row.dataset.id = o.id;

        var ck = document.createElement('button');
        ck.type = 'button';
        ck.className = 'todo-ck';
        ck.setAttribute('aria-label', o.done ? '标为未完成' : '标为完成');
        ck.appendChild(iconEl('check'));
        ck.addEventListener('click', function (e) {
          e.stopPropagation();
          toggle(o.id);
        });

        var tx = document.createElement('span');
        tx.className = 'todo-txt';
        tx.textContent = o.text;

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'todo-del';
        del.setAttribute('aria-label', '删除这条');
        del.appendChild(iconEl('x'));
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          drop(o.id);
        });

        row.appendChild(ck);
        row.appendChild(tx);
        row.appendChild(del);
        item.todoList.appendChild(row);
      });

      if (rest > 0 || item.todoExpand) {
        var more = document.createElement('button');
        more.type = 'button';
        more.className = 'todo-more';
        more.textContent = item.todoExpand ? '收起' : '还有 ' + rest + ' 条';
        more.addEventListener('click', function (e) {
          e.stopPropagation();
          item.todoExpand = !item.todoExpand;
          render();
        });
        item.todoList.appendChild(more);
      }
    }

    item.todoAdd.addEventListener('click', function (e) {
      e.stopPropagation();
      item.todoForm.hidden = false;
      item.todoInput.focus();
    });

    item.todoForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = item.todoInput.value;
      item.todoInput.value = '';
      push(t);
      item.todoForm.hidden = true;
    });

    item.todoForm.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        item.todoInput.value = '';
        item.todoForm.hidden = true;
      }
    });

    item.renderTodo = render;
    render();

    item.fit = function (r) {
      var fs = clamp(Math.min(r.width / 26, r.height / 13), 11, 16);
      root.style.setProperty('--todo-fs', fs.toFixed(1) + 'px');
      item.el.classList.toggle('is-mini', r.height < 128 || r.width < 190);

      /* 头上那行 + 上下内边距扣掉，剩下的高度能放几行就显示几行 */
      var head = item.todoHead ? item.todoHead.offsetHeight : fs * 2;
      var rowH = fs * 1.72 + 3;
      var avail = Math.max(rowH, r.height - 20 - head - 6);
      var cap = Math.max(1, Math.floor(avail / rowH));
      if (cap !== item.todoCap) {
        item.todoCap = cap;
        render();
      }
    };
  }

  registerWidget('todo', {
    name: '待办', desc: '勾选式清单，存在本地', icon: 'check',
    size: { w: 8, h: 6 }, min: { w: 6, h: 4 },
    sizes: [[6, 4], [8, 4], [8, 6], [12, 6], [12, 8]],
    create: function () { return { items: [] }; },
    clean: todoClean,
    mount: mountTodo,
    menu: function (item) {
      return [
        mItem('清空已完成的', function () {
          item.data.items = todoList(item).filter(function (o) { return !o.done; });
          if (item.renderTodo) { item.renderTodo(); }
          scheduleSave();
        }, { icon: 'reset' })
      ];
    }
  });

  /* ---------- 月历 ---------- */

  var CAL_WEEK = ['一', '二', '三', '四', '五', '六', '日'];

  /* 小到放不下整月时，改成「今天」大字：日期 + 月份星期 */
  function calTodayMode(W, H) {
    return H < 190 || W < 230;
  }

  function paintCal(item) {
    if (!item.calGrid) { return; }
    var now = new Date();
    var y = now.getFullYear(), mo = now.getMonth();
    var md = (mo + 1) + '月' + now.getDate() + '日';

    item.calHead.textContent = y + '年' + (mo + 1) + '月';
    item.calTnum.textContent = now.getDate();
    item.calTmeta.textContent = md + ' · 星期' + WEEK[now.getDay()];

    var first = new Date(y, mo, 1);
    var lead = (first.getDay() + 6) % 7;           /* 周一为第一列 */
    var days = new Date(y, mo + 1, 0).getDate();
    var rows = Math.ceil((lead + days) / 7);

    var html = CAL_WEEK.map(function (w) {
      return '<span class="cal-wd">' + w + '</span>';
    }).join('');

    for (var i = 0; i < rows * 7; i++) {
      var d = i - lead + 1;
      var cls = 'cal-cell';
      if (d < 1 || d > days) { cls += ' is-out'; }
      if (d === now.getDate()) { cls += ' is-today'; }
      html += '<span class="' + cls + '">' + ((d < 1 || d > days) ? '' : d) + '</span>';
    }
    item.calGrid.innerHTML = html;
    /* 表头一行按内容高，剩下的按周平分 —— 否则星期几个字会被拉到半空里 */
    item.calGrid.style.gridTemplateRows = 'auto repeat(' + rows + ', 1fr)';
    item.calDay = y + '-' + mo + '-' + now.getDate();
  }

  function mountCal(item) {
    makeShell(item);
    var root = document.createElement('div');
    root.className = 'cal';
    root.innerHTML =
      '<div class="cal-head"></div>' +
      '<div class="cal-today">' +
        '<div class="cal-tnum"></div>' +
        '<div class="cal-tmeta"></div>' +
      '</div>' +
      '<div class="cal-grid"></div>';
    item.body.appendChild(root);
    item.calHead = root.querySelector('.cal-head');
    item.calTnum = root.querySelector('.cal-tnum');
    item.calTmeta = root.querySelector('.cal-tmeta');
    item.calGrid = root.querySelector('.cal-grid');

    item.fit = function (r) {
      var today = calTodayMode(r.width, r.height);
      item.el.classList.toggle('is-today', today);
      item.calMode = today ? 'today' : 'month';

      if (today) {
        item.calTnum.style.fontSize =
          clamp(Math.min(r.height * 0.48, r.width * 0.46), 18, 130).toFixed(1) + 'px';
        item.calTmeta.style.fontSize =
          clamp(Math.min(r.height * 0.13, r.width * 0.072), 9, 15).toFixed(1) + 'px';
        return;
      }

      var cellW = (r.width * 0.94) / 7;
      var cellH = (r.height - 26) / 7;
      var fs = clamp(Math.min(cellW * 0.42, cellH * 0.46), 7.5, 20);
      root.style.setProperty('--cal-fs', fs.toFixed(1) + 'px');
      item.calHead.style.fontSize = clamp(fs * 1.18, 9, 22).toFixed(1) + 'px';
    };

    paintCal(item);
  }

  registerWidget('calendar', {
    name: '月历', desc: '当月日历，今天高亮；小尺寸只显示今天', icon: 'calendar',
    size: { w: 8, h: 6 }, min: { w: 4, h: 3 },
    sizes: [[4, 3], [5, 5], [8, 6], [8, 8], [12, 8]],
    create: function () { return {}; },
    mount: mountCal,
    menu: function (item) {
      return [mItem('回到本月', function () { paintCal(item); }, { icon: 'reset' })];
    }
  });

  function paintCalendars() {
    var now = new Date();
    var key = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();
    state.items.forEach(function (it) {
      if (it.type !== 'calendar' || !it.calGrid) { return; }
      if (it.calDay !== key) { paintCal(it); }
    });
  }

  /* 新组件找空位：不看到视口边界，一直扫到现有内容下面 8 行。
     用 findSpotNear 会卡在 m.rows 里，没位置时 layoutAll 再把 y 夹回来 → 压到别人身上 */
  function findFreeSpot(w, h, ox, oy) {
    var bottom = Math.max(18, BASE_ROWS);
    state.items.forEach(function (o) { bottom = Math.max(bottom, o.y + o.h); });
    var maxY = bottom + 8;
    var best = null, bestCost = Infinity;

    for (var y = 0; y + h <= maxY; y++) {
      for (var x = 0; x + w <= COLS; x++) {
        var box = { x: x, y: y, w: w, h: h };
        var hit = false;
        for (var i = 0; i < state.items.length; i++) {
          if (intersect(box, state.items[i])) { hit = true; break; }
        }
        if (hit) { continue; }
        var cost = Math.abs(x - ox) + Math.abs(y - oy) * 1.4;
        if (cost < bestCost) { bestCost = cost; best = box; }
      }
    }
    return best;
  }

  /* 从「添加组件」里点出来的新实例：就近找个空位，找不到就往下加 */
  function addWidget(type, atX, atY) {
    var sp = widgetSpec(type);
    if (!sp) { return null; }
    var m = metrics();
    var w = Math.min(sp.size.w, COLS);
    var h = Math.min(sp.size.h, m.rows);

    var ox = atX != null ? Math.round(atX / m.stepX) - Math.floor(w / 2)
                         : Math.round(COLS / 2 - w / 2);
    var oy = atY != null ? Math.round(atY / m.stepY) - Math.floor(h / 2) : 1;

    var spot = findFreeSpot(w, h, ox, oy);
    if (!spot) {
      var bottom = state.items.reduce(function (a, o) { return Math.max(a, o.y + o.h); }, 0);
      spot = { x: 0, y: bottom, w: w, h: h };
    }

    var it = {
      id: uid(), type: type,
      x: Math.max(0, Math.min(spot.x, COLS - w)), y: Math.max(0, spot.y), w: w, h: h,
      data: sp.create ? sp.create() : {}
    };
    state.items.push(it);
    /* 先把画布行数撑到位，layoutAll 才不会把 y 夹回视口里压到别人 */
    BASE_ROWS = Math.max(BASE_ROWS, it.y + it.h);

    mountItem(it);
    if (!reduced()) {
      it.el.classList.add('tile-in');
      window.setTimeout(function () { it.el.classList.remove('tile-in'); }, 300);
    }
    layoutAll();
    renderRows();
    scheduleSave();

    /* 落在视口外就滚过去，别让用户以为没加上 */
    if (it.el && it.el.scrollIntoView) {
      try {
        it.el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      } catch (e) {}
    }

    showTip('已添加「' + sp.name + '」，右键它可换尺寸或删除', 3000);
    return it;
  }

  function mountItem(item) {
    if (item.type === 'clock') { mountClock(item); }
    else if (item.type === 'search') { mountSearch(item); }
    else if (item.type === 'link') { mountLink(item); }
    else if (item.type === 'quote') { mountQuote(item); }
    else {
      var sp = widgetSpec(item.type);
      if (sp) { sp.mount(item); }
    }
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
    var sp0 = widgetSpec(it.type);
    var name = it.type === 'link'
      ? (it.title || hostOf(it.url) || '站点')
      : (sp0 ? sp0.name : ({ clock: '时钟', search: '搜索框', quote: '引语' }[it.type] || '组件'));
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

    /* 圆角是一个全局观感参数，挂在画布上给所有图标共用 */
    canvas.style.setProperty('--ico-r', tuneNum(state.radius, TUNE.radius, 0, 50) + '%');

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
      if (widgetMap[it.type]) { applyCardLook(it.el, r.width, r.height, cardLook(it)); }
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
    var rows = Math.max(m.rows, Math.ceil((cur + m.rowGap) / m.stepY));
    overlay.style.height = (rows * m.stepY - m.rowGap).toFixed(1) + 'px';
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
    var cellX = cellOriginX();   /* 本次拖动沿用的列奇偶，途中不会变 */

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
        overlay.style.height = (Math.max(m.rows, bottom) * m.stepY - m.rowGap).toFixed(1) + 'px';
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
      var maxY = Math.max(0, Math.max(m.rows, BASE_ROWS + 8) - item.h);
      var x = clamp(Math.round((ev.clientX - grabX) / m.stepX), 0, COLS - item.w);
      var y = clamp(Math.round((ev.clientY - grabY + shift) / m.stepY), 0, maxY);
      /* 图标只落在格点上，不然会和同一排的邻居错开半条 */
      if (item.type === 'link') {
        x = snapCellX(x, item.w, cellX);
        y = snapCellY(y, item.h, maxY);
      }
      return { x: x, y: y };
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
    reset:    'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5V9h4.5',
    cloud:    'M7 18.4h10a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 7 18.4z',
    calendar: 'M5 6.5h14v13H5zM5 10.5h14M9 4.5v4M15 4.5v4'
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
  /* 退场动画这 140ms 里菜单还在 DOM 上（hidden 还是 false），
     但「已经算关掉了」—— 这期间再点别处不能又被当成一次「关菜单」 */
  var menuClosing = false;

  function hideMenu(immediate) {
    if (menuHideTimer) { clearTimeout(menuHideTimer); menuHideTimer = 0; }
    closeSub();
    if (menu.hidden) { return; }
    if (immediate || reduced()) {
      menu.hidden = true;
      menuClosing = false;
      menu.classList.remove('ctx-in', 'ctx-out');
      return;
    }
    menuClosing = true;
    menu.classList.remove('ctx-in');
    menu.classList.add('ctx-out');
    menuHideTimer = window.setTimeout(function () {
      menu.hidden = true;
      menuClosing = false;
      menu.classList.remove('ctx-out');
      menuHideTimer = 0;
    }, 140);
  }

  function placeMenu(x, y) {
    /* 快速连续右键时，取消上一次没播完的退场 */
    if (menuHideTimer) { clearTimeout(menuHideTimer); menuHideTimer = 0; }
    menuClosing = false;
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

    /* 有 sub 的是「展开二级菜单」，点击不关菜单、也不执行主操作 */
    if (opts.sub && opts.sub.length) {
      b.classList.add('is-sub');
      hint.className = 'ctx-chev';
      hint.textContent = '';
      hint.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M9.5 6l6 6-6 6"/></svg>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        openSub(b, opts.sub);
      });
      b.addEventListener('mouseenter', function () { openSub(b, opts.sub); });
      return b;
    }

    /* 二级菜单里的项不能挂「移入就收起父面板」—— 鼠标一进二级菜单就自己把它关掉了。
       只有顶层项悬停时收起别人开的二级菜单 */
    if (!opts.inSub) { b.addEventListener('mouseenter', closeSub); }
    b.addEventListener('click', function () { hideMenu(); fn(); });
    return b;
  }

  /* ---------------- 二级菜单 ---------------- */
  var subEl = null;

  function closeSub() {
    if (subEl && subEl.parentNode) { subEl.parentNode.removeChild(subEl); }
    subEl = null;
    Array.prototype.forEach.call(menu.querySelectorAll('.ctx-item.is-open'), function (n) {
      n.classList.remove('is-open');
    });
  }

  function openSub(anchor, items) {
    if (subEl && subEl._anchor === anchor) { return; }
    closeSub();

    /* 先不要 ctx-in：入场动画带 scale(.93)，量出来的尺寸会小 7%，
       按那个尺寸定位会偏 3~7px（贴着菜单放就会压上去） */
    subEl = document.createElement('div');
    subEl.className = 'ctx-sub';
    subEl._anchor = anchor;
    items.forEach(function (o) {
      subEl.appendChild(mItem(o.label, o.onClick, {
        icon: o.icon, hint: o.hint, inSub: true
      }));
    });
    /* 挂到 body 而不是 menu 里：见 styles.css 里 .ctx-sub 的注释 */
    document.body.appendChild(subEl);
    anchor.classList.add('is-open');

    /* 先摆到 0,0 量出自然尺寸，再按屏幕坐标挪过去 ——
       menu 的 padding / border 偏移都不用自己算 */
    subEl.style.left = '0px';
    subEl.style.top = '0px';
    var sr = subEl.getBoundingClientRect();
    var mr = menu.getBoundingClientRect();
    var ar = anchor.getBoundingClientRect();

    /* 二级面板一律贴在「整个菜单」外侧，不压在菜单上：
       原来贴在某一项右边、放不下时翻到「这一项」左边，正好把这一项盖住，
       鼠标一移上去就以为按钮不见了。翻边要翻到菜单外侧，菜单本身不动。 */
    var left = mr.left + mr.width + 2;
    if (left + sr.width > window.innerWidth - 8) {
      left = mr.left - sr.width - 2;
    }
    left = clamp(left, 8, Math.max(8, window.innerWidth - 8 - sr.width));

    var top = clamp(ar.top - 6, 8, Math.max(8, window.innerHeight - 8 - sr.height));

    subEl.style.left = left + 'px';
    subEl.style.top = top + 'px';
    subEl.classList.add('ctx-in');     /* 定好位再播入场 */
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
    menu.appendChild(mItem('添加组件', null, {
      icon: 'layout',
      hint: widgets.length ? '' : '暂无',
      sub: widgets.map(function (sp) {
        return {
          label: sp.name,
          hint: sp.desc || '',
          icon: sp.icon,
          onClick: function () { addWidget(sp.type, x, y); }
        };
      })
    }));
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

      menu.appendChild(mItem('编辑图标与外观', function () { openIconEditor(item); }, {
        icon: 'pencil',
        hint: (item.bgColor || item.fgColor || itemFontScale(item) !== 1 ||
               itemZoom(item) !== 1) ? '已自定义' : ''
      }));

      /* 缓存是「记住抓到的那个地址」，站点换图标后需要手动丢一次。
         首次启动时 defaultState() 里的方块还没有 iconMode，按 auto 算 */
      if ((item.iconMode || 'auto') === 'auto') {
        menu.appendChild(mItem('重新抓取图标', function () {
          iconForget(item.url);
          refreshLink(item);
          showTip('正在重新获取「' + (item.title || hostOf(item.url)) + '」的图标', 2000);
        }, { icon: 'reset' }));
      }

      menu.appendChild(mItem('编辑主页', function () { editLink(item); }, { icon: 'link' }));
      menu.appendChild(mItem('删除', function () { removeItem(item.id); }, { icon: 'trash', danger: true }));

    } else if (item.type === 'clock') {
      var clk = clockLook(item);
      menu.appendChild(mGroup('时间制式', 'layout', mChips([
        { label: '24 小时', value: 24 },
        { label: '12 小时', value: 12 }
      ], clk.hour12 ? 12 : 24, function (v) {
        setClockLook(item, { hour12: (v === 12) });
      })));

      menu.appendChild(mItem(clk.date === 'none' ? '显示日期' : '隐藏日期', function () {
        setClockLook(item, { date: clk.date === 'none' ? CLOCK_LOOK.date : 'none' });
      }, { icon: 'type' }));

      menu.appendChild(mItem('时钟设置', function () { openClockSettings(item); }, {
        icon: 'gear',
        hint: clockCustom(item) ? '已自定义' : ''
      }));

      menu.appendChild(mSep());
      menu.appendChild(mItem('删除', function () { removeItem(item.id); }, { icon: 'trash', danger: true }));

    } else if (item.type === 'search') {
      menu.appendChild(mGroup('搜索引擎', 'search', mChips(allEngines().map(function (e) {
        return { label: e.name, value: e.id };
      }), state.engine, function (v) {
        setEngine(v);
      })));

      var custom = searchLook(item);
      menu.appendChild(mItem('搜索框设置', function () { openSearchSettings(item); }, {
        icon: 'gear',
        hint: (custom.barW !== SEARCH_LOOK.barW || custom.radius !== SEARCH_LOOK.radius ||
               custom.font !== SEARCH_LOOK.font || custom.dim !== SEARCH_LOOK.dim ||
               custom.dock !== SEARCH_LOOK.dock) ? '已自定义' : ''
      }));

      menu.appendChild(mSep());
      menu.appendChild(mItem('删除', function () { removeItem(item.id); }, { icon: 'trash', danger: true }));

    } else if (item.type === 'quote') {
      menu.appendChild(mItem('编辑文字', function () { editQuote(item); }, { icon: 'pencil' }));
      menu.appendChild(mSep());
      menu.appendChild(mItem('删除', function () { removeItem(item.id); }, { icon: 'trash', danger: true }));

    } else {
      var wsp = widgetSpec(item.type);
      if (!wsp) { placeMenu(x, y); return; }

      var sizes = wsp.sizes || [];
      if (sizes.length) {
        menu.appendChild(mGroup('布局', 'layout', mChips(sizes.map(function (s) {
          return { label: s[0] + 'x' + s[1], value: s[0] + 'x' + s[1] };
        }), item.w + 'x' + item.h, function (v) {
          var p = v.split('x');
          applySize(item, parseInt(p[0], 10), parseInt(p[1], 10));
        })));
      }

      menu.appendChild(mItem('卡面…', function () { openCardSettings(item); }, {
        icon: 'image',
        hint: cardCustom(item) ? '已自定义' : ''
      }));

      (wsp.menu ? wsp.menu(item) : []).forEach(function (n) {
        if (n) { menu.appendChild(n); }
      });

      menu.appendChild(mSep());
      menu.appendChild(mItem('删除', function () { removeItem(item.id); }, { icon: 'trash', danger: true }));
    }

    placeMenu(x, y);
  }

  function applySize(item, w, h) {
    var m = metrics();
    var bx = clamp(item.x, 0, COLS - w);
    /* 放大后可能被右边挤回半格，图标一律再对齐一次 */
    if (item.type === 'link') { bx = snapCellX(bx, w, cellOriginX()); }

    var g = plan(item, { x: bx, y: item.y, w: w, h: h }, m);

    /* 吸附后的位置可能刚好压住邻居，退回原位再试一次 */
    if (!g) {
      g = plan(item, { x: clamp(item.x, 0, COLS - w), y: item.y, w: w, h: h }, m);
    }

    /* 还放不下就另找一个空位；这里必须排除自己，否则永远找不到 */
    if (!g) {
      var spot = findSpotNear(w, h, m, item.type === 'link', item.x, item.y, item.id);
      if (spot) { g = plan(item, spot, m); }
    }

    if (!g) {
      showTip('这个尺寸周围放不下，先挪开一点空位', 2600);
      return;
    }

    applyPlan(g);
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

  var TONE_BG_SWATCH = [
    '#ffffff', '#f4ede4', '#101418', '#2f6fdb',
    '#e5484d', '#f2b93b', '#8aa35a', '#3b2f4a'
  ];
  var TONE_FG_SWATCH = [
    '#ffffff', '#101418', '#2f6fdb', '#e5484d',
    '#f2b93b', '#8aa35a', '#5fbf9f', '#3b2f4a'
  ];

  /* ---------------- 编辑图标与外观 ---------------- */

  /* 一排颜色：左边一个「无 / 自动」胶囊，中间色板，最后是取色器。
     返回 { root, sync }，sync 负责把选中态同步到正在用的颜色上 */
  function toneColorRow(opts) {
    var f = document.createElement('div');
    f.className = 'dlg-field';

    var lab = document.createElement('span');
    lab.className = 'dlg-label';
    lab.textContent = opts.label;
    f.appendChild(lab);

    var row = document.createElement('div');
    row.className = 'tone-colors';

    var auto = document.createElement('button');
    auto.type = 'button';
    auto.className = 'tone-auto';
    auto.dataset.color = '';
    auto.textContent = opts.autoLabel;
    auto.addEventListener('click', function () { opts.set(''); opts.onChange(); });
    row.appendChild(auto);

    opts.list.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'di-color';
      b.dataset.color = c;
      b.title = c;
      b.style.background = c;
      b.addEventListener('click', function () { opts.set(c); opts.onChange(); });
      row.appendChild(b);
    });

    /* 自定义色：label 套原生取色器，点色轮就开系统调色板 */
    var custom = document.createElement('label');
    custom.className = 'di-color tone-custom';
    custom.title = '自定义颜色';
    var inp = document.createElement('input');
    inp.type = 'color';
    inp.value = opts.get() || '#ffffff';
    inp.addEventListener('input', function () {
      opts.set(inp.value.toLowerCase());
      opts.onChange();
    });
    custom.appendChild(inp);
    row.appendChild(custom);

    f.appendChild(row);

    function sync() {
      var cur = (opts.get() || '').toLowerCase();
      /* 取色取出来的那一排也在这块 field 里，一并参与选中态 */
      [].forEach.call(f.querySelectorAll('[data-color]'), function (b) {
        b.classList.toggle('is-active', (b.dataset.color || '').toLowerCase() === cur);
      });
      var inPick = !!cur && !!f.querySelector('.di-pick [data-color="' + cur + '"]');
      if (cur) { inp.value = cur; }
      custom.classList.toggle('is-active', !!cur && opts.list.indexOf(cur) < 0 && !inPick);
    }

    sync();
    return { root: f, sync: sync };
  }

  function secTitle(text) {
    var s = document.createElement('div');
    s.className = 'di-sec';
    s.textContent = text;
    return s;
  }

  /* 一排「要么这个要么那个」的按钮。值可以是布尔、数字或字符串，
     比较一律走 String()，dataset 里存的就是这个字符串 */
  function segField(name, opts, value, onPick) {
    var f = document.createElement('div');
    f.className = 'dlg-field';

    var head = document.createElement('div');
    head.className = 'tune-head';
    var nm = document.createElement('span');
    nm.className = 'tune-name';
    nm.textContent = name;
    head.appendChild(nm);
    f.appendChild(head);

    var seg = document.createElement('div');
    seg.className = 'dlg-seg';
    var btns = [];
    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg' + (String(o.v) === String(value) ? ' is-active' : '');
      b.textContent = o.label;
      b.dataset.val = String(o.v);
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.toggle('is-active', x === b); });
        onPick(o.v);
      });
      seg.appendChild(b);
      btns.push(b);
    });
    f.appendChild(seg);

    return {
      root: f,
      set: function (v) {
        btns.forEach(function (x) { x.classList.toggle('is-active', x.dataset.val === String(v)); });
      }
    };
  }

  /* 弹窗里的小滑杆：head（名字 + 读数）+ range + 可选的重置按钮。
     data-kind 给测试和「外观恢复默认」一个稳定的抓手（一个弹窗里会有两条） */
  function tuneRow(opts) {
    var f = document.createElement('div');
    f.className = 'dlg-field';

    var row = document.createElement('div');
    row.className = 'tune';

    var head = document.createElement('div');
    head.className = 'tune-head';
    var nm = document.createElement('span');
    nm.className = 'tune-name';
    nm.textContent = opts.name;
    var out = document.createElement('span');
    out.className = 'tune-val';
    head.appendChild(nm);
    head.appendChild(out);

    var range = document.createElement('input');
    range.type = 'range';
    range.min = opts.min;
    range.max = opts.max;
    range.step = opts.step;
    range.value = opts.val;
    range.dataset.kind = opts.key;
    range.setAttribute('aria-label', opts.name);
    range.addEventListener('input', function () {
      opts.onInput(Number(range.value));
    });

    row.appendChild(head);
    row.appendChild(range);
    f.appendChild(row);

    var api = {
      root: f,
      range: range,
      set: function (v) { range.value = v; },
      val: function (txt) { out.textContent = txt; }
    };

    if (opts.resetLabel) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'text-btn';
      b.textContent = opts.resetLabel;
      b.addEventListener('click', function () { opts.onReset(); });
      f.appendChild(b);
      api.resetBtn = b;
    }
    return api;
  }

  /* ---------------- 从图标取色 ----------------
     跨域图片画进 canvas 会被 taint（实测 SecurityError），fetch 也过不了 CORS，
     所以「自动算出一排颜色」只对本地上传的图（data: URL）和少数回了 ACAO 的源有效。
     其余图标退回系统吸管：EyeDropper 读的是屏幕像素，不受同源限制，
     图标就在弹窗的预览里，点一下就能取到 —— 这也是唯一对任意图标都成立的办法。

     另外试过 chrome 的 /_favicon/ 接口：headless 下每个站点都返回同一张默认图，
     等于没有，不做。 */

  function paletteOf(img, n) {
    var W = 48;
    var H = 48;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var cx = cv.getContext('2d');
    if (!cx) { return []; }
    cx.drawImage(img, 0, 0, W, H);      /* 跨域图会在这里抛 SecurityError */
    var d = cx.getImageData(0, 0, W, H).data;

    /* 每个通道砍到 4 bit：相邻色自动落进同一个格子。
       门槛取 48 而不是 200：半透明 logo（alpha 常常只有 100 左右）也是有效的品牌色，
       抠掉它等于把用户最想要的那张图判成「没颜色」 */
    var buckets = {};
    var opaque = 0;
    var i, k;
    for (i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 48) { continue; }
      opaque++;
      k = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4);
      var bk = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, b: 0 });
      bk.n++;
      bk.r += d[i]; bk.g += d[i + 1]; bk.b += d[i + 2];
    }
    if (!opaque) { return []; }

    var list = [];
    for (var key in buckets) {
      if (!Object.prototype.hasOwnProperty.call(buckets, key)) { continue; }
      var o = buckets[key];
      var r = o.r / o.n;
      var g = o.g / o.n;
      var b = o.b / o.n;
      var mx = Math.max(r, g, b);
      var mn = Math.min(r, g, b);
      var sat = mx ? (mx - mn) / mx : 0;
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      var share = o.n / opaque;
      if (share < 0.008) { continue; }             /* 抗锯齿、描边的零碎像素不要 */
      if (lum > 0.96 && sat < 0.12) { continue; }  /* 纯白底板没意义，色板里本来就有白 */
      list.push({
        hex: hexOf(r, g, b),
        share: share,
        /* 占比为主，带一点饱和度加权：logo 的品牌色通常面积不大但一眼认得出 */
        score: share * (0.5 + 0.5 * Math.min(1, sat * 2))
      });
    }
    list.sort(function (a, b) { return b.score - a.score; });

    var out = [];
    for (i = 0; i < list.length && out.length < (n || 6); i++) {
      var dup = false;
      for (k = 0; k < out.length; k++) {
        if (nearColor(out[k].hex, list[i].hex, 24)) { dup = true; break; }
      }
      if (!dup) { out.push(list[i]); }
    }
    return out;
  }

  /* 试着从这一块当前用的图标里读颜色。读不到（绝大多数情况）就 resolve([])，
     由调用方退回吸管 —— 不抛错、不假装成功 */
  function iconPalette(item, draft, n) {
    return new Promise(function (resolve) {
      var src = '';
      if (draft.mode === 'custom' && draft.data) {
        src = draft.data;
      } else {
        var live = item.iconEl && item.iconEl.querySelector('img');
        src = (live && (live.currentSrc || live.src)) || '';
      }
      if (!src) { resolve([]); return; }

      var im = new Image();
      /* 只对 data: 之外的可疑源加 crossOrigin 是没用的：源站不回 ACAO 就直接 onerror，
         反而连「画进去抛异常」这条快路都走不到。统一不加，能读就能读 */
      im.onload = function () {
        var cols = [];
        try { cols = paletteOf(im, n) || []; } catch (e) { cols = []; }
        resolve(cols);
      };
      im.onerror = function () { resolve([]); };
      im.src = src;
    });
  }

  /* ---------------- 自定义图片：解码 → 裁剪 → 烘焙 ----------------
     上传 / 粘贴进来的多半是整张截图（三千像素、好几 MB），原样塞进 data URL
     既吃配额、渲染也慢，还经常不是正方形（塞进方格里只占中间一条）。
     所以分三步，任何一步都可回退：
       1) 解码后最长边超过 IMG_SRC_MAX 先缩到 1024 —— 编辑够用、内存不炸
       2) 在「调整图片」页里拖 / 缩放 / 选「裁满」还是「全图」
       3) 确认时按同一套几何烘成 IMG_OUT 见方的 WebP（不支持就 PNG）
     屏幕预览和最终烘焙调的是同一个 drawCrop()，所以看到的就是存下的。 */
  var IMG_SRC_MAX = 1024;
  /* 输出尺寸：4×4 这种大方块里图标最宽能到 ~300 CSS px，2× DPR 就是 600。
     取 512 —— 大块不糊，1×1 也不过才几十 KB。 */
  var IMG_OUT = 512;
  var IMG_MAX_BYTES = 20 * 1024 * 1024;
  var IMG_ZOOM = { min: 1, max: 4, step: 0.02 };

  /* 读一张图进内存：src 可以是 data: / blob: / 扩展内地址。
     revoke 传 objectURL 时，读完立刻释放（不然要等整页卸载才回收） */
  function loadImageSrc(src, revoke) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () {
        var ow = im.naturalWidth || im.width;
        var oh = im.naturalHeight || im.height;
        if (!ow || !oh) {
          if (revoke) { URL.revokeObjectURL(revoke); }
          reject(new Error('empty'));
          return;
        }
        /* 编辑用的底图：>=1024 就缩到 1024，之后所有拖拽 / 缩放都在它上面算 */
        var k = Math.min(1, IMG_SRC_MAX / Math.max(ow, oh));
        var w = Math.max(1, Math.round(ow * k));
        var h = Math.max(1, Math.round(oh * k));
        var cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        var cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(im, 0, 0, w, h);
        if (revoke) { URL.revokeObjectURL(revoke); }
        resolve({ canvas: cv, w: w, h: h, ow: ow, oh: oh, shrunk: k < 0.999 });
      };
      im.onerror = function () {
        if (revoke) { URL.revokeObjectURL(revoke); }
        reject(new Error('decode'));
      };
      im.src = src;
    });
  }

  function loadImageFile(file) {
    var u = URL.createObjectURL(file);
    return loadImageSrc(u, u);
  }

  /* 一张图 + 一个输出尺寸 + 一份裁剪状态 → 图该画在哪儿。
     比例化存盘的：dx / dy 都是「边上尺寸的百分比」，所以 320 的输出和
     屏幕上 300 的预览算出来是同一个构图，不会各算各的。 */
  function cropGeom(size, img, st) {
    var zoom = clamp(Number(st.zoom) || 1, IMG_ZOOM.min, IMG_ZOOM.max);
    /* 裁满 = 铺满方框（多出来的裁掉）；全图 = 整张塞进来（四周留空） */
    var base = st.mode === 'contain'
      ? Math.min(size / img.w, size / img.h)
      : Math.max(size / img.w, size / img.h);
    var k = base * zoom;
    var dw = img.w * k;
    var dh = img.h * k;
    var limX = Math.max(0, (dw - size) / 2);
    var limY = Math.max(0, (dh - size) / 2);
    var dx = clamp((Number(st.dx) || 0) * size, -limX, limX);
    var dy = clamp((Number(st.dy) || 0) * size, -limY, limY);
    return {
      dw: dw,
      dh: dh,
      k: k,
      x: (size - dw) / 2 + dx,
      y: (size - dh) / 2 + dy,
      /* 可拖范围也用比例回传，拖动时直接夹 draft 里的值 */
      maxX: limX / size,
      maxY: limY / size
    };
  }

  function drawCrop(ctx, size, img, st) {
    var g = cropGeom(size, img, st);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.canvas, g.x, g.y, g.dw, g.dh);
    return g;
  }

  /* 输出该多大：裁到的那一块在原图里有多大，就存多大，最多 IMG_OUT。
     256px 的小图存 512 只是无谓放大，192px 的裁切也给不到 512 的细节 */
  function estimateOut(img, st) {
    if (!img) { return IMG_OUT; }
    var g = cropGeom(IMG_OUT, img, st);
    var region = IMG_OUT / (g.k || 1);   /* 换算成原图里的像素 */
    return Math.round(clamp(Math.min(IMG_OUT, region), 64, IMG_OUT));
  }

  /* 烘成正方形图标：先试 WebP（同画质体积小一半），太大就降质量；
     浏览器不支持编码 WebP 时 toDataURL 会原样给回 PNG，靠前缀判断 */
  function bakeIcon(img, st) {
    var out = estimateOut(img, st);
    var cv = document.createElement('canvas');
    cv.width = out;
    cv.height = out;
    var cx = cv.getContext('2d');
    drawCrop(cx, out, img, st);

    var data = '';
    var qs = [0.92, 0.82, 0.7];
    for (var i = 0; i < qs.length; i++) {
      try { data = cv.toDataURL('image/webp', qs[i]); } catch (e) { data = ''; }
      if (data.indexOf('data:image/webp') !== 0) { data = ''; break; }
      if (data.length <= 420000) { break; }
    }
    if (!data) {
      try { data = cv.toDataURL('image/png'); } catch (e2) { data = ''; }
    }
    return { data: data, w: out, h: out, bytes: Math.round(data.length * 0.75) };
  }

  function kbText(n) {
    if (!n) { return ''; }
    return (n >= 10240 ? Math.round(n / 1024) : (n / 1024).toFixed(1)) + ' KB';
  }

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
        : '',
      /* 上传 / 粘贴进来、正在裁剪的那张图：{canvas,w,h,ow,oh,shrunk}
         只有进过「调整图片」页才会有；draft.data 在此之前保持原样，
         不会因为打开弹窗就被重新编码一遍 */
      img: null,
      crop: null,
      bytes: 0,
      /* 这张图是刚传进来、还没点「使用这张图」的 —— 取消时要丢掉 */
      pending: false,
      /* 外观：底色对 1×1 也生效（半透明图标需要它） */
      bg: item.bgColor || '',
      fg: item.fgColor || '',
      fs: itemFontScale(item),
      zoom: itemZoom(item)
    };

    var card = document.createElement('div');
    card.className = 'dlg-icon';

    var head = document.createElement('div');
    head.className = 'dlg-head';
    var h3 = document.createElement('h3');
    h3.textContent = '编辑图标与外观';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'dlg-x';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.appendChild(iconEl('x'));
    head.appendChild(h3);
    head.appendChild(closeBtn);
    card.appendChild(head);

    /* 中间可滚动，底部按钮常驻：弹窗高过屏幕时「保存」也不会被挤出去 */
    var body = document.createElement('div');
    body.className = 'dlg-body';
    card.appendChild(body);

    var box1 = document.createElement('div');
    box1.className = 'dlg-box';
    box1.appendChild(secTitle('站点'));

    var fUrl = dlgField('网址', 'link', draft.url, 'https://');
    var fetchBtn = document.createElement('button');
    fetchBtn.type = 'button';
    fetchBtn.className = 'dlg-inline-btn';
    fetchBtn.textContent = '获取图标';
    fUrl.row.appendChild(fetchBtn);

    var fName = dlgField('名称', 'type', draft.title, '显示的名字');

    /* 网址和名称并排：弹窗本来就不矮，省一行是一行 */
    var rowSite = document.createElement('div');
    rowSite.className = 'dlg-row';
    rowSite.appendChild(fUrl.root);
    rowSite.appendChild(fName.root);
    box1.appendChild(rowSite);

    var urlErr = document.createElement('div');
    urlErr.className = 'dlg-error';
    urlErr.hidden = true;
    box1.appendChild(urlErr);
    fUrl.input.addEventListener('input', function () { urlErr.hidden = true; });
    body.appendChild(box1);

    var box2 = document.createElement('div');
    box2.className = 'dlg-box';
    box2.appendChild(secTitle('图标'));

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

    /* 「调整」只在已经传过图时出现：裁掉哪一块、放大到多少，都在那一页里改 */
    var tEdit = pTile('调整');
    tEdit.box.appendChild(iconEl('image'));
    tEdit.root.hidden = true;
    tEdit.root.title = '裁剪 / 缩放这张图';
    tEdit.root.addEventListener('click', function () { openCrop(); });

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    tAuto.root.addEventListener('click', function () {
      draft.mode = 'auto';
      draft.data = '';
      draft.source = '';
      draft.img = null;
      draft.crop = null;
      syncPreview();
    });
    tText.root.addEventListener('click', function () { draft.mode = 'text'; syncPreview(); });
    tUp.root.addEventListener('click', function () { fileInput.click(); });

    previews.appendChild(tAuto.root);
    previews.appendChild(tText.root);
    previews.appendChild(tUp.root);
    previews.appendChild(tEdit.root);
    previews.appendChild(fileInput);
    box2.appendChild(previews);

    /* 粘贴是隐藏功能，得写出来才有人试 */
    var upHint = document.createElement('p');
    upHint.className = 'dlg-hint di-up-hint';
    upHint.textContent = '选一张图，或直接 Ctrl+V 粘贴；不是正方的会先让你裁，之后点「调整」还能改。';
    box2.appendChild(upHint);

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
    body.appendChild(box2);

    /* ---- 外观：底色 / 名称颜色 / 名称字号 ---- */
    var isPlate = itemUnits(item) > 1.001;

    var box3 = document.createElement('div');
    box3.className = 'dlg-box';
    box3.appendChild(secTitle('外观'));

    var lookBody = document.createElement('div');
    lookBody.className = 'di-look-body';

    var pvCell = document.createElement('div');
    pvCell.className = 'pv-cell';

    /* 预览就是这块方块本人：直接克隆画布上的 DOM，类名 / inline 尺寸 / 圆角 /
       阴影 / 图标文件全是同一份，草稿只覆盖要改的几个变量。
       另画一个「样板」迟早会和真实渲染漂开（之前就漂了）。 */
    var pv = document.createElement('div');
    pv.className = 'pv';

    var pvStage = document.createElement('div');
    pvStage.className = 'pv-stage';

    /* 预览底下铺的是「这块图标背后那一小块壁纸」：整屏渐变按真实视口尺寸画好，
       再按图标在视口里的位置裁出来。透明栏图标在预览里透出的就是画布上同一处的颜色，
       而不是把整屏渐变挤进一个小方块里（那样会左浅右深，看着像另一块底）。 */
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var liveRect = item.el ? item.el.getBoundingClientRect() : null;
    pvStage.style.backgroundSize = vw + 'px ' + vh + 'px';
    pvStage.style.backgroundPosition =
      (liveRect ? -Math.round(liveRect.left) : 0) + 'px ' +
      (liveRect ? -Math.round(liveRect.top) : 0) + 'px';

    var pvScale = document.createElement('div');
    pvScale.className = 'pv-scale';

    var pvClone = item.el ? item.el.cloneNode(true) : null;
    var pvNm = null;
    if (pvClone) {
      var realW = parseFloat(item.el.style.width) || 0;
      var realH = parseFloat(item.el.style.height) || 0;
      /* 画布上的绝对定位不要带进来；尺寸沿用真实占位 */
      pvClone.style.left = '0px';
      pvClone.style.top = '0px';
      pvClone.style.width = realW + 'px';
      pvClone.style.height = realH + 'px';
      /* --ico-r 是挂在画布上的全局变量，克隆体离开了画布就继承不到，手动补上 */
      pvClone.style.setProperty('--ico-r',
        tuneNum(state.radius, TUNE.radius, 0, 50) + '%');

      pvScale.style.width = realW + 'px';
      pvScale.style.height = realH + 'px';
      pvScale.appendChild(pvClone);
      pvNm = pvClone.querySelector('.name');
    }

    pvStage.appendChild(pvScale);
    pv.appendChild(pvStage);

    var pvCap = document.createElement('div');
    pvCap.className = 'pv-cap';

    pvCell.appendChild(pv);
    pvCell.appendChild(pvCap);
    lookBody.appendChild(pvCell);

    var lookFields = document.createElement('div');
    lookFields.className = 'di-look-fields';

    /* 这一块里 logo 的大小：只缩图里的图案，图标这块板子保持原尺寸 */
    var zTune = tuneRow({
      key: 'zoom', name: 'Logo 大小', min: TONE_ZOOM.min, max: TONE_ZOOM.max,
      step: TONE_ZOOM.step, val: draft.zoom,
      onInput: function (v) { draft.zoom = v; render(); }
    });
    lookFields.appendChild(zTune.root);

    var zHint = document.createElement('p');
    zHint.className = 'dlg-hint di-zoom-hint';
    zHint.textContent = '只缩放图标里的图案；底色块和它占的格子不变。';
    lookFields.appendChild(zHint);

    var fBg = toneColorRow({
      label: isPlate ? '底色' : '图标底色', autoLabel: '无', list: TONE_BG_SWATCH,
      get: function () { return draft.bg; },
      set: function (v) { draft.bg = v; },
      onChange: function () { render(); }
    });
    lookFields.appendChild(fBg.root);

    /* 从图标取色：默认收起，点了才去读像素；读不到就退回系统吸管 */
    var pickRow = document.createElement('div');
    pickRow.className = 'di-pick';
    pickRow.hidden = true;

    var pickTip = document.createElement('div');
    pickTip.className = 'di-pick-tip';
    pickTip.hidden = true;

    var pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'tone-pick';
    pickBtn.textContent = '从图标取色';
    fBg.root.querySelector('.tone-colors').appendChild(pickBtn);
    fBg.root.appendChild(pickRow);
    fBg.root.appendChild(pickTip);

    function say(text) {
      pickTip.textContent = text || '';
      pickTip.hidden = !text;
    }

    /* 系统吸管：读的是屏幕像素，不受同源限制；图标就在旁边的预览里，点一下就行 */
    function dropper(btn) {
      if (!window.EyeDropper) {
        say('这个浏览器没有吸管接口，先用上面的色板');
        return;
      }
      var old = btn.textContent;
      btn.disabled = true;
      btn.textContent = '在图标上点一下…';
      var picker = new window.EyeDropper();
      picker.open().then(function (r) {
        btn.disabled = false;
        btn.textContent = old;
        var hex = String((r && r.sRGBHex) || '').toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(hex)) {
          draft.bg = hex;
          render();
          say('吸管取到 ' + hex);
        } else {
          say('没读到颜色，再试一次');
        }
      }, function (e) {
        btn.disabled = false;
        btn.textContent = old;
        say(e && e.name === 'AbortError'
          ? '取消取色了'
          : '吸管没打开（' + ((e && e.name) || '未知原因') + '），先用上面的色板');
      });
    }

    function showPick(nodes) {
      pickRow.textContent = '';
      var cap = document.createElement('span');
      cap.className = 'di-pick-cap';
      /* 没取到颜色时不要顶着「图标里的颜色」这个标题，改成说清下一步 */
      cap.textContent = nodes.length ? '图标里的颜色' : '吸管取色';
      pickRow.appendChild(cap);

      nodes.forEach(function (n) { pickRow.appendChild(n); });

      var d = document.createElement('button');
      d.type = 'button';
      d.className = 'tone-pick tone-pick-sm';
      d.textContent = '吸管';
      d.title = '用系统吸管在图标上点一下';
      d.addEventListener('click', function () { dropper(d); });
      pickRow.appendChild(d);

      pickRow.hidden = false;
    }

    pickBtn.addEventListener('click', function () {
      if (pickBtn.disabled) { return; }
      pickBtn.disabled = true;
      pickBtn.textContent = '取色中…';
      iconPalette(item, draft, 6).then(function (cols) {
        pickBtn.disabled = false;
        pickBtn.textContent = cols.length ? '重新取色' : '从图标取色';
        if (cols.length) {
          say('');
          showPick(cols.map(function (c) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'di-color';
            b.dataset.color = c.hex;
            b.title = c.hex + ' · 占 ' + Math.round(c.share * 100) + '%';
            b.style.background = c.hex;
            b.addEventListener('click', function () { draft.bg = c.hex; render(); });
            return b;
          }));
        } else {
          /* 跨域图读不到像素，这不是失败 —— 换成吸管，图标就在左边预览里 */
          showPick([]);
          say('这张图在别的域名上，浏览器不让读像素 —— 用吸管在图标上点一下');
        }
      });
    });

    var fFg = toneColorRow({
      label: '名称颜色', autoLabel: '自动', list: TONE_FG_SWATCH,
      get: function () { return draft.fg; },
      set: function (v) { draft.fg = v; },
      onChange: function () { render(); }
    });
    lookFields.appendChild(fFg.root);

    /* 1×1 的名称挂在方块外面、正好住在行与行的空隙里：单独放大一定会压到下一行，
       所以只给它看颜色，字号交给设置里的全局「图标字号」 */
    var sTune = null;

    if (isPlate) {
      sTune = tuneRow({
        key: 'font', name: '名称字号', min: TONE_FS.min, max: TONE_FS.max,
        step: 0.05, val: draft.fs, resetLabel: '回到全局字号',
        onInput: function (v) { draft.fs = v; render(); },
        onReset: function () {
          draft.fs = TONE_FS.def;
          sTune.set(TONE_FS.def);
          render();
        }
      });
      lookFields.appendChild(sTune.root);
    } else {
      var hint = document.createElement('p');
      hint.className = 'dlg-hint';
      hint.textContent = '名称字号跟着设置里的「图标字号」走 —— 1×1 的名称挂在方块外面，单独放大就会压到下一行。';
      lookFields.appendChild(hint);
    }

    lookBody.appendChild(lookFields);
    box3.appendChild(lookBody);
    body.appendChild(box3);

    var foot = document.createElement('div');
    foot.className = 'dlg-foot';

    var lookReset = document.createElement('button');
    lookReset.type = 'button';
    lookReset.className = 'text-btn tone-reset';
    lookReset.textContent = '外观恢复默认';
    lookReset.addEventListener('click', function () {
      draft.bg = '';
      draft.fg = '';
      draft.fs = TONE_FS.def;
      draft.zoom = TONE_ZOOM.def;
      zTune.set(TONE_ZOOM.def);
      if (sTune) { sTune.set(TONE_FS.def); }
      render();
    });
    foot.appendChild(lookReset);

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'dlg-btn';
    cancelBtn.textContent = '取消';
    foot.appendChild(cancelBtn);

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'dlg-primary';
    saveBtn.textContent = '保存';
    foot.appendChild(saveBtn);
    card.appendChild(foot);

    var wrap = buildScrim(card);

    /* ---- 「调整图片」页：同一张卡片的位置，翻页而不是再开一个窗口 ----
       一张图要拖、要缩，台面得够大才有准头；塞在主弹窗里挤不下，
       所以做成同一弹窗的第二页。取消就直接退回，draft.data 一个字都不动。 */
    var CROP_S = Math.round(clamp(
      Math.min(320, window.innerWidth * 0.44, window.innerHeight * 0.40), 200, 340));

    var cropDlg = document.createElement('div');
    cropDlg.className = 'dlg-icon crop-dlg';
    cropDlg.hidden = true;

    var cHead = document.createElement('div');
    cHead.className = 'dlg-head';
    var cH3 = document.createElement('h3');
    cH3.textContent = '调整图片';
    var cX = document.createElement('button');
    cX.type = 'button';
    cX.className = 'dlg-x';
    cX.setAttribute('aria-label', '返回');
    cX.appendChild(iconEl('x'));
    cHead.appendChild(cH3);
    cHead.appendChild(cX);
    cropDlg.appendChild(cHead);

    var cBody = document.createElement('div');
    cBody.className = 'crop-body';

    var stage = document.createElement('div');
    stage.className = 'crop-stage';
    stage.style.width = CROP_S + 'px';
    stage.style.height = CROP_S + 'px';

    var cvs = document.createElement('canvas');
    stage.appendChild(cvs);

    var cGrid = document.createElement('div');
    cGrid.className = 'crop-grid';
    stage.appendChild(cGrid);

    var side = document.createElement('div');
    side.className = 'crop-side';

    var chips = document.createElement('div');
    chips.className = 'crop-chips';
    var chipCover = document.createElement('button');
    chipCover.type = 'button';
    chipCover.className = 'crop-chip';
    chipCover.textContent = '裁满';
    var chipContain = document.createElement('button');
    chipContain.type = 'button';
    chipContain.className = 'crop-chip';
    chipContain.textContent = '全图';
    chips.appendChild(chipCover);
    chips.appendChild(chipContain);
    side.appendChild(chips);

    var cZoom = tuneRow({
      key: 'cropzoom', name: '缩放', min: IMG_ZOOM.min, max: IMG_ZOOM.max,
      step: IMG_ZOOM.step, val: 1,
      onInput: function (v) { setZoom(v); }
    });
    side.appendChild(cZoom.root);

    var cRow = document.createElement('div');
    cRow.className = 'crop-row';
    var cCenter = document.createElement('button');
    cCenter.type = 'button';
    cCenter.className = 'text-btn';
    cCenter.textContent = '居中';
    var cReset = document.createElement('button');
    cReset.type = 'button';
    cReset.className = 'text-btn';
    cReset.textContent = '还原';
    cRow.appendChild(cCenter);
    cRow.appendChild(cReset);
    side.appendChild(cRow);

    var cHint = document.createElement('p');
    cHint.className = 'crop-note';
    cHint.textContent = '在图上拖动改位置，滚轮或滑杆缩放。';
    side.appendChild(cHint);

    var cSrc = document.createElement('p');
    cSrc.className = 'crop-src';
    side.appendChild(cSrc);

    cBody.appendChild(stage);
    cBody.appendChild(side);
    cropDlg.appendChild(cBody);

    var cFoot = document.createElement('div');
    cFoot.className = 'dlg-foot';
    var cCancel = document.createElement('button');
    cCancel.type = 'button';
    cCancel.className = 'dlg-btn';
    cCancel.textContent = '取消';
    var cOk = document.createElement('button');
    cOk.type = 'button';
    cOk.className = 'dlg-primary';
    cOk.textContent = '使用这张图';
    cFoot.appendChild(cCancel);
    cFoot.appendChild(cOk);
    cropDlg.appendChild(cFoot);
    wrap.appendChild(cropDlg);

    var cropState = null;
    var cropBusy = false;

    function redraw() {
      if (!draft.img || !cropState) { return; }
      /* 按 devicePixelRatio 铺像素，不然 300px 的台面在 2× 屏上是糊的 */
      var px = Math.round(CROP_S * Math.min(2, window.devicePixelRatio || 1));
      if (cvs.width !== px) { cvs.width = px; cvs.height = px; }
      drawCrop(cvs.getContext('2d'), px, draft.img, cropState);
    }

    function syncCropUI() {
      chipCover.classList.toggle('is-active', cropState.mode === 'cover');
      chipContain.classList.toggle('is-active', cropState.mode === 'contain');
      cZoom.set(Math.round(cropState.zoom * 100) / 100);
      cZoom.val(Math.round(cropState.zoom * 100) + '%');
      var img = draft.img;
      var out = estimateOut(img, cropState);
      cSrc.textContent = '原图 ' + img.ow + '×' + img.oh +
        (img.shrunk ? ' → 编辑用 ' + img.w + '×' + img.h : '') +
        ' · 存为 ' + out + '×' + out;
    }

    function refreshCrop() { syncCropUI(); redraw(); }

    /* 近乎正方时「裁满」和「全图」没区别，直接铺满；
       明显是长方形（截图、横版 logo）先给「全图」，不悄悄裁掉内容 */
    function initCrop(img) {
      var r = Math.max(img.w, img.h) / Math.min(img.w, img.h);
      return { mode: r <= 1.15 ? 'cover' : 'contain', zoom: 1, dx: 0, dy: 0 };
    }

    function setZoom(z) {
      if (!draft.img || !cropState) { return; }
      cropState.zoom = Math.round(clamp(z, IMG_ZOOM.min, IMG_ZOOM.max) * 100) / 100;
      var g = cropGeom(CROP_S, draft.img, cropState);
      cropState.dx = clamp(cropState.dx, -g.maxX, g.maxX);
      cropState.dy = clamp(cropState.dy, -g.maxY, g.maxY);
      refreshCrop();
    }

    function showPage() {
      cropState = draft.crop;
      card.style.display = 'none';
      cropDlg.hidden = false;
      wrap.classList.add('is-crop');
      refreshCrop();
      cOk.focus();
    }

    function hidePage(discard) {
      /* 取消时把「还没确认的那张」丢掉：不然下次点「调整」，看到的会是
         刚被取消的那张图，而画布上明明还是旧的 */
      if (discard && draft.pending) {
        draft.img = null;
        draft.crop = null;
      }
      draft.pending = false;
      cropDlg.hidden = true;
      card.style.display = '';
      wrap.classList.remove('is-crop');
    }

    function openCrop() {
      if (cropBusy) { return; }
      if (!draft.img) {
        /* 老图（之前存下的 data URL）也能再裁：进来时才解码，
           不动它就不会被重新编码一遍 */
        var seed = (draft.mode === 'custom' && draft.source === 'file' &&
          /^data:image\//i.test(draft.data || '')) ? draft.data : '';
        if (!seed) { return; }
        cropBusy = true;
        loadImageSrc(seed).then(function (img) {
          cropBusy = false;
          draft.img = img;
          if (!draft.crop) { draft.crop = initCrop(img); }
          showPage();
        }, function () {
          cropBusy = false;
          showTip('这张图读不出来，重新传一张吧', 2200);
        });
        return;
      }
      if (!draft.crop) { draft.crop = initCrop(draft.img); }
      showPage();
    }

    /* 上传 / 粘贴统一走这里：先降到 1024 再进裁剪页 */
    function importFile(file) {
      if (!file) { return; }
      if (!/^image\//i.test(file.type || '')) {
        showTip('这个文件不是图片', 1800);
        return;
      }
      if (file.size > IMG_MAX_BYTES) {
        showTip('图片超过 20MB，先压一下再传', 2400);
        return;
      }
      showTip('正在读取图片…', 1000);
      loadImageFile(file).then(function (img) {
        draft.img = img;
        draft.crop = initCrop(img);
        draft.pending = true;
        openCrop();
      }, function () {
        showTip('这张图读不出来（格式不支持或文件坏了）', 2600);
      });
    }

    /* 拖：dx / dy 存成「尺寸的百分比」，换台面尺寸不用重算 */
    var grab = null;
    stage.addEventListener('pointerdown', function (e) {
      if (!draft.img || !cropState || e.button !== 0) { return; }
      grab = { x: e.clientX, y: e.clientY, dx: cropState.dx, dy: cropState.dy };
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器 */ }
      stage.classList.add('is-grabbing');
      e.preventDefault();
    });
    stage.addEventListener('pointermove', function (e) {
      if (!grab) { return; }
      var g = cropGeom(CROP_S, draft.img, cropState);
      cropState.dx = clamp(grab.dx + (e.clientX - grab.x) / CROP_S, -g.maxX, g.maxX);
      cropState.dy = clamp(grab.dy + (e.clientY - grab.y) / CROP_S, -g.maxY, g.maxY);
      redraw();
    });
    function dropGrab() {
      if (!grab) { return; }
      grab = null;
      stage.classList.remove('is-grabbing');
    }
    stage.addEventListener('pointerup', dropGrab);
    stage.addEventListener('pointercancel', dropGrab);

    stage.addEventListener('wheel', function (e) {
      if (!draft.img || !cropState) { return; }
      e.preventDefault();
      setZoom(cropState.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    }, { passive: false });

    stage.addEventListener('dblclick', function () {
      if (!cropState) { return; }
      cropState.dx = 0;
      cropState.dy = 0;
      refreshCrop();
    });

    /* 换「裁满 / 全图」等于重新适配一次：缩放回到 100%、位置回到中间。
       不这么做的话，前一档拉到 4× 再点「全图」看到的还是铺满，名不副实 */
    function setMode(m) {
      if (!cropState || cropState.mode === m) { return; }
      cropState.mode = m;
      cropState.zoom = 1;
      cropState.dx = 0;
      cropState.dy = 0;
      refreshCrop();
    }

    chipCover.addEventListener('click', function () { setMode('cover'); });
    chipContain.addEventListener('click', function () { setMode('contain'); });
    cCenter.addEventListener('click', function () {
      if (!cropState) { return; }
      cropState.dx = 0;
      cropState.dy = 0;
      refreshCrop();
    });
    cReset.addEventListener('click', function () {
      if (!draft.img) { return; }
      draft.crop = initCrop(draft.img);
      cropState = draft.crop;
      refreshCrop();
    });

    cCancel.addEventListener('click', function () { hidePage(true); });
    cX.addEventListener('click', function () { hidePage(true); });

    cOk.addEventListener('click', function () {
      if (!draft.img || !cropState) { return; }
      var baked = bakeIcon(draft.img, cropState);
      if (!baked.data) {
        showTip('这张图烘不出来，换一张试试', 2200);
        return;
      }
      draft.data = baked.data;
      draft.source = 'file';
      draft.mode = 'custom';
      draft.bytes = baked.bytes;
      hidePage();
      syncPreview();
      showTip('已换成这张图 · ' + baked.w + '×' + baked.w +
        (baked.bytes ? ' · ' + kbText(baked.bytes) : ''), 2000);
    });

    /* 直接粘贴：剪贴板里的图片（截图、复制来的图）都能用 */
    function onPaste(e) {
      var dt = e.clipboardData;
      if (!dt) { return; }
      var file = null;
      var items = dt.items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//i.test(items[i].type)) {
          file = items[i].getAsFile();
          break;
        }
      }
      if (!file && dt.files) {
        for (var j = 0; j < dt.files.length; j++) {
          if (/^image\//i.test(dt.files[j].type)) { file = dt.files[j]; break; }
        }
      }
      if (!file) {
        /* 只在自家弹窗里抱怨一句，别去打断别处的粘贴 */
        var ae = document.activeElement;
        if (ae && (wrap.contains(ae) || cropDlg.contains(ae))) {
          showTip('剪贴板里没有图片', 1800);
        }
        return;
      }
      e.preventDefault();
      importFile(file);
    }
    document.addEventListener('paste', onPaste);

    /* 预览里的图标跟着草稿走：文字图标看字，自定义看上传/抓到的图，
       auto 直接借页面上已经渲染好的那个，不为一个预览再抓一次 */
    /* 预览里的图标跟着草稿走：文字图标看字，上传 / 抓到看那张图，
       auto 直接留用克隆下来的那张（页面上已经渲染好了，不再抓一次）。
       所以这里动的是克隆体里的 .ico，用的是真实方块的同一套 class。 */
    var pvIcoSeed = '';
    if (pvClone) {
      var pvIcoBox = pvClone.querySelector('.ico');
      if (pvIcoBox) { pvIcoSeed = pvIcoBox.innerHTML; }
    }

    function lookIcon() {
      if (!pvClone) { return; }
      var box = pvClone.querySelector('.ico');
      if (!box) { return; }

      if (draft.mode === 'text') {
        box.textContent = '';
        var g = document.createElement('div');
        g.className = 'glyph';
        g.textContent = draft.text.slice(0, 3) || '?';
        g.dataset.len = g.textContent.length;
        g.style.background = draft.color === 'rainbow'
          ? 'conic-gradient(from 200deg,#F26B6B,#F2B93B,#7BD07B,#4AA8E0,#9A7BE0,#F26B6B)'
          : draft.color;
        box.appendChild(g);
        return;
      }
      if (draft.mode === 'custom' && draft.data) {
        box.textContent = '';
        var im = makeImg();
        im.referrerPolicy = 'no-referrer';
        im.src = draft.data;
        box.appendChild(im);
        return;
      }
      /* auto：把克隆下来的原始图标放回去（可能刚被文字 / 上传换掉过） */
      if (pvIcoSeed) { box.innerHTML = pvIcoSeed; }
    }

    /* 预览装不下时等比缩小（4×2 这类宽块），1×1 / 2×2 一律 1:1 */
    function fitPreview() {
      if (!pvClone || !pvNm) { return 1; }
      pvScale.style.transform = 'none';
      var cr = pvClone.getBoundingClientRect();
      var nr = pvNm.getBoundingClientRect();
      /* 1×1 的名称挂在方块下方，要一起装进来 */
      var ow = Math.max(cr.width, nr.width);
      var oh = Math.max(cr.height, nr.bottom - cr.top);
      var availW = pvStage.clientWidth - 6;
      var availH = pvStage.clientHeight - 6;
      if (availW < 20 || availH < 20) { return 1; }

      var k = Math.min(1, availW / Math.max(1, ow), availH / Math.max(1, oh));
      pvScale.style.transform = k < 0.995 ? 'scale(' + k.toFixed(4) + ')' : 'none';
      return k;
    }

    function render() {
      if (!pvClone || !pvNm) { return; }

      /* 和真实渲染同一套规则：底板方块在底色上自动反色，1×1 的壁纸名称不自动反 */
      var fg = draft.fg || (isPlate && draft.bg ? contrastOn(draft.bg) : '');
      if (fg) {
        pvClone.style.setProperty('--label-fg', fg);
        pvClone.style.setProperty('--label-shadow', 'none');
      } else {
        pvClone.style.removeProperty('--label-fg');
        pvClone.style.removeProperty('--label-shadow');
      }

      /* 底色：1×1 垫在图标上，展开后的方块铺整块底板 —— 全由 CSS 按真实类名决定 */
      if (draft.bg) {
        pvClone.classList.add('has-tone');
        pvClone.style.setProperty('--tone-bg', draft.bg);
      } else {
        pvClone.classList.remove('has-tone');
        pvClone.style.removeProperty('--tone-bg');
      }

      pvNm.textContent = draft.title || item.title || hostOf(draft.url) || '名称';

      /* 跑同一套 solveFit：缩放和单块字号一变，--ico / --label / --gap /
         名称字号一起走，和保存后画布上的结果完全一致 */
      var p = solveFit(item, item.rect || rectOf(item, metrics()), {
        zoom: draft.zoom, fs: draft.fs
      });
      applyFit(pvClone, pvNm, p);

      zTune.val(Math.round(draft.zoom * 100) + '%');
      zHint.textContent = draft.bg
        ? '只缩图标里的图案；底色块和它占的格子不动。'
        : '只缩图标里的图案。图不透明时缩小会露出壁纸，先垫个底色底板就不动。';
      if (sTune) { sTune.val(p.labelSize.toFixed(1).replace(/\.0$/, '') + ' px'); }

      var text = (draft.title || item.title || hostOf(draft.url) || '名称').trim();
      var needRemeasure = render.lastText !== text;   /* 名字变长会改变宽度 */
      render.lastText = text;
      if (needRemeasure) { void pvClone.offsetWidth; }

      var k = fitPreview();
      pvCap.textContent = '预览 · 图案 ' + p.logoPx + ' px · 名称 ' +
        p.labelSize.toFixed(1).replace(/\.0$/, '') + ' px' +
        (k < 0.995 ? ' · 按 ' + Math.round(k * 100) + '% 显示' : ' · 与画布 1:1');

      fBg.sync();
      fFg.sync();
    }

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
      /* 传过图才给「调整」：没图可裁的时候它只会是个死按钮 */
      tEdit.root.hidden = !(draft.mode === 'custom' && draft.source === 'file' && draft.data);

      var isText = draft.mode === 'text';
      fText.root.style.display = isText ? '' : 'none';
      colorWrap.style.display = isText ? '' : 'none';
      /* 文字图标没有图可取色，按钮收起来（它自己的颜色就在上面选） */
      pickBtn.style.display = isText ? 'none' : '';
      if (isText) { pickRow.hidden = true; }

      Array.prototype.forEach.call(swatchRow.children, function (b) {
        b.classList.toggle('is-active', b.dataset.color === draft.color);
      });

      lookIcon();
      render();
    }

    fText.input.addEventListener('input', function () {
      draft.text = fText.input.value.trim();
      if (draft.mode !== 'text') { draft.mode = 'text'; }
      syncPreview();
    });

    /* 名称改了预览立刻跟着变（预览里的名字就是这一块上挂的那个） */
    fName.input.addEventListener('input', function () {
      draft.title = fName.input.value.trim();
      render();
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
      /* 不再按体积拒收：大图在这里会先降分辨率再进裁剪页 */
      importFile(file);
      fileInput.value = '';
    });

    function close() {
      closeScrim(wrap);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('paste', onPaste);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        /* 在裁剪页按 Esc 是「退回」，不是把整个弹窗关掉 */
        if (!cropDlg.hidden) { hidePage(true); return; }
        close();
      } else if (e.key === 'Enter') {
        /* 裁剪页回车 = 用这张图；主弹窗回车 = 保存 */
        e.preventDefault();
        if (!cropDlg.hidden) { cOk.click(); } else { saveBtn.click(); }
      }
    }

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
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

      var before = serializeState();

      item.url = url;
      item.title = fName.input.value.trim().slice(0, 40) || item.title;
      item.iconMode = draft.mode;
      item.iconText = draft.text.slice(0, 3);
      item.iconColor = draft.color;
      item.iconData = (draft.mode === 'custom') ? draft.data : '';
      item.bgColor = draft.bg;
      item.fgColor = draft.fg;
      item.fontScale = Math.round(draft.fs * 100) / 100;
      item.iconZoom = Math.round(draft.zoom * 100) / 100;

      refreshLink(item);
      /* 底色 / 字号都会改变这一块的排版，必须重新 fit */
      layoutAll();
      close();
      scheduleSave();
      renderRows();
      if (serializeState() !== before) { pushUndo('编辑图标与外观', before); }
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
        var spot = findSpot(UNIT_W, UNIT_H, m, true) || { x: 0, y: 0 };
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
    renderTunings();
    paintClock();
    scheduleSave();
  }

  /* ---------------- 时钟 ---------------- */

  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function paintClock() {
    var now = new Date();

    state.items.forEach(function (it) {
      if (it.type !== 'clock') { return; }
      var lk = clockLook(it);
      var t = clockText(now, lk);
      if (it.time.textContent !== t.time) { it.time.textContent = t.time; }
      it.date.style.display = t.date ? '' : 'none';
      if (t.date && it.date.textContent !== t.date) { it.date.textContent = t.date; }
    });

    paintCalendars();

    var wait = 1000 - now.getMilliseconds();
    window.setTimeout(paintClock, wait < 60 ? wait + 1000 : wait);
  }

  /* ---------------- 搜索 ---------------- */

  function looksLikeUrl(v) {
    if (/^https?:\/\//i.test(v)) { return true; }
    if (/\s/.test(v)) { return false; }
    return /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(v) || /^localhost(:\d+)?/.test(v);
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
    allEngines().forEach(function (e) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seg' + (state.engine === e.id ? ' is-active' : '');
      btn.textContent = e.name;
      btn.dataset.engine = e.id;
      btn.addEventListener('click', function () { setEngine(e.id); });
      elSeg.appendChild(btn);
    });

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'seg seg-add';
    add.textContent = '+ 添加';
    add.setAttribute('aria-label', '添加搜索引擎');
    add.addEventListener('click', function () { closeDrawer(); openEngineDialog(); });
    elSeg.appendChild(add);
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
    var unit = UNIT_W * m.colW + (UNIT_W - 1) * m.gapX;
    elDensityHint.textContent = '方块约 ' + Math.round(unit) + ' px';
  }

  /* ---- 外观微调（间距 / 圆角 / 字号） ---- */

  /* 字号倍数换算成「一个 1×1 方块上大约多少 px」，比裸倍数值好判断 */
  function unitLabelPx(scale) {
    var m = metrics();
    var s = UNIT_W * m.colW + (UNIT_W - 1) * m.gapX;
    return Math.round(clamp(s * 0.15, 11, 16) * scale);
  }

  function fmtTune(t, v) {
    if (t.key === 'labelScale') {
      return v.toFixed(2).replace(/\.?0+$/, '') + '× · ' + unitLabelPx(v) + 'px';
    }
    if (t.key === 'iconScale') {
      return Math.round(v * 100) + '%';
    }
    return Math.round(v) + ' ' + t.unit;
  }

  function renderTunings() {
    if (!elTune) { return; }
    elTune.textContent = '';
    tuneInputs = {};

    var floorY = gapYFloor(tuneNum(state.gapX, TUNE.gapX, 6, 32));

    TUNE_KEYS.forEach(function (t) {
      var lo = t.key === 'gapY' ? Math.max(t.min, floorY) : t.min;
      var val = tuneNum(state[t.key], t.def, lo, t.max);
      if (t.key === 'gapY' && val < lo) { val = lo; state.gapY = lo; }

      var row = document.createElement('div');
      row.className = 'tune';

      var head = document.createElement('div');
      head.className = 'tune-head';
      var nm = document.createElement('span');
      nm.className = 'tune-name';
      nm.textContent = t.name;
      var out = document.createElement('span');
      out.className = 'tune-val';
      out.textContent = fmtTune(t, val);
      head.appendChild(nm);
      head.appendChild(out);

      var input = document.createElement('input');
      input.type = 'range';
      input.min = lo;
      input.max = t.max;
      input.step = t.step;
      input.value = val;
      input.setAttribute('aria-label', t.name);

      /* 拖动中即时重排：方块位置随间距变化，能直接看出松紧 */
      input.addEventListener('input', function () {
        state[t.key] = Number(input.value);
        out.textContent = fmtTune(t, state[t.key]);
        if (t.key !== 'gapY') { syncGapYMin(); }
        layoutAll();
        refreshDensityHint();
        scheduleSave();
      });
      input.addEventListener('change', function () {
        layoutAll();
        scheduleSave();
      });

      row.appendChild(head);
      row.appendChild(input);
      elTune.appendChild(row);

      tuneInputs[t.key] = { input: input, out: out, t: t };
    });
  }

  /* 横向拉宽 / 字号放大后，纵向间距的下限跟着抬高，滑杆本身也要跟着走 */
  function syncGapYMin() {
    var g = tuneInputs.gapY;
    if (!g) { return; }
    var floor = gapYFloor(tuneNum(state.gapX, TUNE.gapX, 6, 32));
    /* 先记住旧值：把 min 调高时浏览器会立刻把 value 夹到 min，
       再比较就永远「不小于」，state 反而留在旧值上 */
    var cur = Number(g.input.value);
    g.input.min = floor;
    if (cur < floor || Number(state.gapY) < floor) {
      state.gapY = floor;
      g.input.value = floor;
      g.out.textContent = fmtTune(g.t, floor);
    }
  }

  function refreshDensityHint() {
    var m = metrics();
    elDensityHint.textContent = '方块约 ' +
      Math.round(UNIT_W * m.colW + (UNIT_W - 1) * m.gapX) + ' px';
  }

  /* 窗口尺寸 / 密度变化后，字号的 px 读数会跟着变，单独刷这一行就行 */
  function refreshLabelPx() {
    var t = tuneInputs.labelScale;
    if (!t) { return; }
    t.out.textContent = fmtTune(t.t, Number(t.input.value));
  }

  function resetTunings() {
    var before = serializeState();
    TUNE_KEYS.forEach(function (t) { state[t.key] = t.def; });
    layoutAll();
    renderTunings();
    scheduleSave();
    pushUndo('恢复默认外观', before);
    showTip('外观已恢复默认', 2200);
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

    var origin = cellOriginX();
    var y = Math.ceil(startY / UNIT_H) * UNIT_H;   /* 行也要落在格点上 */
    rowsArr.forEach(function (row) {
      var total = 0;
      row.forEach(function (it) { total += it.w; });
      var x = snapCellX(Math.max(0, Math.round((COLS - total) / 2)), total, origin);
      var rowH = 0;
      row.forEach(function (it) {
        it.x = x;
        it.y = y;
        x += it.w;
        rowH = Math.max(rowH, it.h);
      });
      y += Math.max(UNIT_H, Math.ceil(rowH / UNIT_H) * UNIT_H);
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
    refreshLabelPx();
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
  document.getElementById('btnTuneReset').addEventListener('click', resetTunings);

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
    var pick = document.querySelector('.w-search.is-picking');
    if (pick) { pick.classList.remove('is-picking'); return; }
    if (!menu.hidden && !menuClosing) { hideMenu(); return; }
    if (drawer.classList.contains('is-open')) { closeDrawer(); }
  });

  /* 点别处就收起右键菜单。
     用捕获阶段：菜单外按下即关，并「吃掉」这一次点击 —— 否则收起菜单的那一下
     会顺带打开链接、或者把方块拖起来。和系统菜单的行为一致：第一下只负责关。
     这里只 stopPropagation 不 preventDefault：一旦 preventDefault，浏览器连 click
     都不派发，suppressClick 就没人来清，紧接着的第二下会被一起吞掉。 */
  document.addEventListener('pointerdown', function (e) {
    if (menu.hidden || menuClosing || e.button === 2) { return; }
    if (menu.contains(e.target)) { return; }
    /* 二级菜单挂在 body 上（为了让它自己的模糊取到页面），得单独放行 */
    if (subEl && subEl.contains(e.target)) { return; }
    hideMenu();
    suppressClick = true;
    window.setTimeout(function () { suppressClick = false; }, 500);
    e.stopPropagation();
  }, true);

  /* 在菜单上再按右键：别弹浏览器的原生菜单，菜单留在原地 */
  menu.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* 点别处收起浮层引擎行；内嵌在组件里的那条一直显示，不受影响 */
  document.addEventListener('pointerdown', function (e) {
    var open = document.querySelectorAll('.w-search.is-picking');
    for (var i = 0; i < open.length; i++) {
      if (!open[i].contains(e.target)) { open[i].classList.remove('is-picking'); }
    }
  }, true);

  /* 空白处右键：环境菜单 */
  canvas.addEventListener('contextmenu', function (e) {
    if (e.target !== canvas && e.target !== overlay) { return; }
    e.preventDefault();
    showCanvasMenu(e.clientX, e.clientY);
  });

  var rafId = 0;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(function () {
      layoutAll();
      refreshLabelPx();
    });
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
    renderTunings();
    paintClock();

    /* 天气每 5 分钟看一眼缓存过没过期（过 15 分钟才真去请求） */
    window.setInterval(function () {
      state.items.forEach(function (it) {
        if (it.type === 'weather') { wxMaybeRefresh(it); }
      });
    }, 5 * 60 * 1000);
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
