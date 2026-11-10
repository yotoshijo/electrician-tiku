/* 电工题库 · 离线版 v2（多题库 / 夜间模式 / 背题 / 智能组卷 / 打卡） */
(function () {
  'use strict';

  /* ---------- 全局错误提示 ---------- */
  window.onerror = function (msg, src, line, col) {
    try {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:60px;background:#fee2e2;color:#991b1b;' +
        'font-size:12px;line-height:1.5;padding:8px;z-index:99999;border-radius:8px;white-space:pre-wrap;word-break:break-all';
      d.textContent = 'JS 错误：' + msg + ' @' + line + ':' + col;
      document.body.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 8000);
    } catch (e) {}
    return false;
  };

  /* ---------- 题库 ---------- */
  var BANKS = window.BANKS || [{ id: 'lv', name: '低压电工作业', sub: '安全技术培训 · 精选题库', q: window.QUESTIONS || [] }];
  var storage = window.TikuStorage;
  var bid = storage.getItem('jhw_bank') || BANKS[0].id;
  if (!BANKS.some(function (b) { return b.id === bid; })) bid = BANKS[0].id;

  var BANK = null, Q = [], N = 0;
  function loadBank() {
    BANK = BANKS.filter(function (b) { return b.id === bid; })[0] || BANKS[0];
    Q = BANK.q;
    N = Q.length;
  }
  loadBank();

  /* ---------- 存储 ---------- */
  var PREFIX = 'jhw_' + bid + '_';
  function read(k, def) {
    try { var v = storage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function write(k, v) { try { storage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var SET = {
    theme: storage.getItem('jhw_theme') || 'light',
    vibrate: read('jhw_vibrate', true),
    goal: read('jhw_goal', 30),
    remind: read('jhw_remind', { on: false, h: 20, m: 0 })
  };

  var S = {};
  function migrateLegacy() {
    // v1 只有一套全局键，升级到多题库后把它们搬到低压题库的命名空间
    if (bid !== 'lv') return;
    ['ans', 'wrong', 'fav', 'records', 'daily', 'known', 'unknown', 'last'].forEach(function (k) {
      var oldK = 'jhw_' + k, newK = 'jhw_lv_' + k;
      var v = storage.getItem(oldK);
      if (v !== null && storage.getItem(newK) === null) {
        storage.setItem(newK, v);
        storage.removeItem(oldK);
      }
    });
  }
  function loadState() {
    migrateLegacy();
    PREFIX = 'jhw_' + bid + '_';
    var legacyPos = storage.getItem('jhw_pos');
    S = {
      pos: read(PREFIX + 'pos', legacyPos ? Number(legacyPos) : 0),
      ans: read(PREFIX + 'ans', {}),
      wrong: read(PREFIX + 'wrong', {}),
      fav: read(PREFIX + 'fav', []),
      records: read(PREFIX + 'records', []),
      reciteKnown: read(PREFIX + 'known', {}),
      reciteUnknown: read(PREFIX + 'unknown', {}),
      daily: read(PREFIX + 'daily', {}),
      last: read(PREFIX + 'last', null)
    };
    S = window.TikuCore.normalizeState(S, N);
  }
  loadState();

  var K = {};
  function saveKey(name) { write(PREFIX + (name === 'reciteKnown' ? 'known' : name === 'reciteUnknown' ? 'unknown' : name), S[name]); }
  function savePos() { write(PREFIX + 'pos', S.pos); }

  /* ---------- 工具 ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var content = $('#content');
  var tbTitle = $('#tbTitle');
  var tbBack = $('#tbBack');
  var tbRight = $('#tbRight');
  var topbar = $('#topbar');
  var tabbar = $('#tabbar');

  function vibrate(ms) {
    if (!SET.vibrate) return;
    var p = Object.prototype.toString.call(ms) === '[object Array]' ? ms.join(',') : String(ms);
    try {
      if (window.AndroidUI && window.AndroidUI.vibrate) { window.AndroidUI.vibrate(p); return; }
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  function ensureVisible(el) {
    if (!el) return;
    var bar = $('.bottom-bar');
    var barH = bar ? bar.offsetHeight : 0;
    var limit = window.innerHeight - barH - 10;
    var r = el.getBoundingClientRect();
    var over = r.bottom - limit;
    if (over <= 0) return;
    content.scrollTop += over;
    r = el.getBoundingClientRect();
    over = r.bottom - limit;
    if (over > 0) {
      var pad = document.createElement('div');
      pad.style.height = (over + 12) + 'px';
      content.appendChild(pad);
      content.scrollTop += over;
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fixHtml(value) { return window.TikuCore.safeHtml(value); }
  function optionsOf(q) { return window.TikuCore.optionsOf(q); }
  function issueHtml(q) { return q.issue ? '<div class="data-issue" role="status">待补全 · ' + esc(q.issue) + '</div>' : ''; }
  function modeName(mode) { return {seq:'顺序练习',rand:'随机练习',cat:'章节练习',smart:'智能组卷',wrong:'错题练习',fav:'收藏练习',review:'试卷解析'}[mode] || '练习'; }
  function isJudge(q) { return (q.tizhong || '').indexOf('判') >= 0; }
  function correctLetter(q) {
    var d = String(q.daan || '').trim().toUpperCase();
    if (/^[A-D]$/.test(d)) return d;
    if (d === '对' || d === '正确' || d === '√') return 'A';
    if (d === '错' || d === '错误' || d === '×') return 'B';
    return d;
  }
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function dateStr(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function bumpDaily() {
    var t = today();
    S.daily[t] = (S.daily[t] || 0) + 1;
    write(PREFIX + 'daily', S.daily);
  }

  /* ---------- 主题 ---------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', SET.theme);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', SET.theme === 'dark' ? '#101a1b' : '#063f42');
  }
  function topBarActive() { return screens.current && screens.current.name !== 'home'; }

  /* ---------- 框架 ---------- */
  var stack = [];
  function setTab(name) {
    Array.prototype.forEach.call(tabbar.children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === name);
    });
  }
  function showTabbar(v) { tabbar.style.display = v ? '' : 'none'; }
  function statusColors(opts) {
    opts = opts || {};
    var dark = SET.theme === 'dark';
    if (opts.light) return { bg: dark ? '#11151f' : '#ffffff', dark: !dark };
    return { bg: dark ? '#11151f' : '#2f6bff', dark: dark ? false : false };
  }
  function setTop(title, opts) {
    opts = opts || {};
    var c = statusColors(opts);
    try {
      if (window.AndroidUI && window.AndroidUI.setStatusBar) {
        window.AndroidUI.setStatusBar(c.bg, c.dark);
      }
    } catch (e) {}
    tbTitle.textContent = title;
    topbar.classList.toggle('light', !!opts.light);
    tbBack.innerHTML = opts.back ? '<span class="back-ico">‹</span>' : '';
    tbBack.onclick = opts.back ? function () { if (screens.current && screens.current.name === 'examRun') window.__back(); else back(); } : null;
    tbRight.innerHTML = opts.right || '';
    tbRight.onclick = opts.onRight || null;
  }
  function render(html, keepScroll) {
    content.innerHTML = html;
    if (!keepScroll) content.scrollTop = 0;
  }
  var screens = {};

  function go(name, params, replace) {
    if (!replace && screens.current) stack.push(screens.current);
    if (E && name !== 'examRun') { clearTimeout(E.advance); clearInterval(E.timer); E.advance = null; E.timer = null; }
    screens.current = { name: name, params: params || {} };
    screens[name](params || {});
  }
  function back() {
    var p = stack.pop();
    if (p) { screens.current = p; screens[p.name](p.params, true); }
    else go('home', {}, true);
  }

  /* ---------- 通用组件 ---------- */
  function showDialog(title, msg, okText, onOk, cancelText) {
    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML =
      '<div class="sheet" style="max-height:auto">' +
        '<div class="sheet-head">' + esc(title) + '</div>' +
        '<div style="padding:0 18px 16px;color:var(--text-2)">' + esc(msg) + '</div>' +
        '<div class="sheet-foot">' +
          '<button class="btn ghost" style="flex:1" id="dlgCancel">' + esc(cancelText || '取消') + '</button>' +
          '<button class="btn primary" style="flex:1" id="dlgOk">' + esc(okText) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.querySelector('#dlgCancel').onclick = function () { document.body.removeChild(mask); };
    mask.querySelector('#dlgOk').onclick = function () { document.body.removeChild(mask); onOk(); };
  }

  function showChoices(title, items) {
    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    var body = items.map(function (it, i) {
      return '<div class="list-item" data-i="' + i + '" style="padding:16px 18px"><div class="li-main"><div class="li-title">' + esc(it.t) + '</div>' +
        (it.s ? '<div class="li-sub">' + esc(it.s) + '</div>' : '') + '</div></div>';
    }).join('');
    mask.innerHTML =
      '<div class="sheet" style="max-height:70%">' +
        '<div class="sheet-head">' + esc(title) + '</div>' +
        '<div class="sheet-body" style="padding:0">' + body + '</div>' +
        '<div class="sheet-foot"><button class="btn ghost" style="flex:1" id="chCancel">取消</button></div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.querySelector('#chCancel').onclick = function () { document.body.removeChild(mask); };
    Array.prototype.forEach.call(mask.querySelectorAll('.list-item'), function (el) {
      el.onclick = function () {
        var i = Number(el.getAttribute('data-i'));
        document.body.removeChild(mask);
        items[i].fn();
      };
    });
  }

  /* 图片点击放大 */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && !t.closest('.zoom-box')) {
      openZoom(t.getAttribute('src'));
    }
  }, false);
  function openZoom(src) {
    if (!src) return;
    var mask = document.createElement('div');
    mask.className = 'zoom-box';
    mask.innerHTML = '<img src="' + esc(src) + '">';
    mask.onclick = function () { document.body.removeChild(mask); };
    document.body.appendChild(mask);
  }

  /* 左右滑动切题 */
  var touch = null;
  document.addEventListener('touchstart', function (e) {
    if (!screens.current) return;
    var n = screens.current.name;
    if (n !== 'practice' && n !== 'recite') return;
    if (e.touches.length !== 1) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!touch) return;
    var t = touch; touch = null;
    if (e.changedTouches.length !== 1) return;
    var dx = e.changedTouches[0].clientX - t.x;
    var dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 60 || Date.now() - t.t > 800) return;
    if (document.querySelector('.zoom-box,.sheet-mask')) return;
    if (screens.current.name === 'practice') { dx < 0 ? goNext() : goPrev(); }
    else if (screens.current.name === 'recite') { dx < 0 ? reciteNext(0) : recitePrev(); }
  }, { passive: true });

  /* ---------- 首页 ---------- */
  screens.home = function () {
    showTabbar(true); setTab('home');
    setTop(BANK.id === 'lv' ? '低压电工' : (BANK.id === 'gy' ? '高压电工' : '电工题库'), { light: false });
    var done = Object.keys(S.ans).length;
    var wrongN = Object.keys(S.wrong).length;
    var pct = N ? Math.round(done / N * 100) : 0;
    var td = S.daily[today()] || 0;
    var goal = SET.goal;
    var streak = calcStreak();
    var best = 0;
    for (var bi = 0; bi < S.records.length; bi++) {
      if (S.records[bi].score > best) best = S.records[bi].score;
    }
    var scoreHint = S.records.length
      ? ('最近 ' + Math.min(8, S.records.length) + ' 次 · 最高 ' + best + ' 分')
      : '还没有考试记录';

    var lastHtml = '';
    if (S.last && S.last.list && S.last.list.length) {
      lastHtml = '<div class="continue-card" id="continueCard">' +
        '<div class="cc-main"><b>继续上次练习</b><span>' + modeName(S.last.mode) +
        ' · 第 ' + Math.min(S.last.pos + 1, S.last.list.length) + ' / ' + S.last.list.length + ' 题</span></div>' +
        '<span class="cc-go">继续 ›</span></div>';
    }

    render(
      '<div class="hero">' +
        '<span class="hero-kicker">ELECTRICIAN / PRACTICE FILE № ' + (BANK.id === 'gy' ? '02' : '01') + '</span>' +
        '<img class="hero-art" src="assets/hero-electrician.webp" alt="原创电工角色插画">' +
        '<div class="hero-top"><h1>' + esc(BANK.name) + '</h1>' +
        (BANKS.length > 1 ? '<button class="bank-switch" id="bankSwitch">切换题库</button>' : '') +
        '</div>' +
        '<p>' + esc(BANK.sub) + '</p>' +
        '<span class="badge">共 ' + N + ' 题 · 支持离线练习</span>' +
      '</div>' +
      '<div class="stat-card">' +
        '<div class="stat"><b>' + N + '</b><span>总题数</span></div>' +
        '<div class="stat"><b>' + done + '</b><span>已练习</span></div>' +
        '<div class="stat"><b>' + wrongN + '</b><span>错题</span></div>' +
        '<div class="stat"><b>' + (S.records.length ? S.records[0].score : '--') + '</b><span>最近成绩</span></div>' +
      '</div>' +
      lastHtml +
      '<div class="progress-wrap">' +
        '<div class="row"><span>学习进度</span><span>' + done + ' / ' + N + '（' + pct + '%）</span></div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="row" style="margin-top:12px"><span>今日目标</span><span>' + td + ' / ' + goal + ' 题' +
          (streak > 0 ? ' · 连续 ' + streak + ' 天' : '') + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.min(100, Math.round(td / Math.max(1, goal) * 100)) + '%"></i></div>' +
        '<div class="row" style="margin-top:14px"><span>成绩曲线</span><span class="tiny">' + scoreHint + '</span></div>' +
        miniTrend() +
      '</div>' +
      '<div class="grid">' +
        '<div class="entry primary" data-go="seq"><span class="e-ico">📖</span><span class="e-name">顺序练习</span><span class="e-desc">按题库顺序逐题练习</span></div>' +
        '<div class="entry" data-go="rand"><span class="e-ico">🎲</span><span class="e-name">随机练习</span><span class="e-desc">打乱顺序随机刷题</span></div>' +
        '<div class="entry" data-go="exam"><span class="e-ico">📝</span><span class="e-name">模拟考试</span><span class="e-desc">100 题 · 45 分钟</span></div>' +
        '<div class="entry" data-go="wrong"><span class="e-ico">❌</span><span class="e-name">错题本</span><span class="e-desc">' + wrongN + ' 道待巩固</span></div>' +
        '<div class="entry" data-go="cats"><span class="e-ico">🗂️</span><span class="e-name">章节练习</span><span class="e-desc">按知识点专项突破</span></div>' +
        '<div class="entry" data-go="recite"><span class="e-ico">📚</span><span class="e-name">背题模式</span><span class="e-desc">直接看答案与解析</span></div>' +
        '<div class="entry" data-go="fav"><span class="e-ico">⭐</span><span class="e-name">我的收藏</span><span class="e-desc">' + S.fav.length + ' 道已收藏</span></div>' +
        '<div class="entry" data-go="smart"><span class="e-ico">🧠</span><span class="e-name">智能组卷</span><span class="e-desc">弱项针对性练习</span></div>' +
        '<div class="entry" data-go="stats"><span class="e-ico">📊</span><span class="e-name">学习统计</span><span class="e-desc">成绩与正确率</span></div>' +
        '<div class="entry" data-go="heat"><span class="e-ico">🗓️</span><span class="e-name">打卡日历</span><span class="e-desc">连续 ' + streak + ' 天</span></div>' +
      '</div>'
    );
    var cc = $('#continueCard');
    if (cc) cc.onclick = function () { resumeLast(); };
    var bs = $('#bankSwitch');
    if (bs) bs.onclick = function () { openBankSwitch(); };
    Array.prototype.forEach.call(content.querySelectorAll('[data-go]'), function (el) {
      el.onclick = function () {
        var g = el.getAttribute('data-go');
        if (g === 'seq') startPractice('seq');
        else if (g === 'rand') openRandCount();
        else if (g === 'exam') go('exam');
        else if (g === 'wrong') go('wrong');
        else if (g === 'fav') go('fav');
        else if (g === 'cats') go('cats');
        else if (g === 'recite') startRecite();
        else if (g === 'smart') openSmart();
        else if (g === 'heat') go('heat');
        else go(g);
      };
    });
  };

  function calcStreak() {
    var n = 0, d = new Date();
    for (;;) {
      var s = dateStr(d);
      if ((S.daily[s] || 0) > 0) { n++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  }

  function openBankSwitch() {
    var items = BANKS.map(function (b) {
      return {
        t: b.name, s: b.q.length + ' 题' + (b.id === bid ? ' · 当前题库' : ''),
        fn: function () {
          if (b.id === bid) return;
          bid = b.id;
          storage.setItem('jhw_bank', bid);
          loadBank(); loadState();
          stack = [];
          go('home', {}, true);
        }
      };
    });
    showChoices('切换题库', items);
  }

  /* ---------- 练习 ---------- */
  var P = { list: [], pos: 0, mode: 'seq', review: false, overrideAns: null, retryMode: false, retry: {} };

  function startPractice(mode, opts) {
    opts = opts || {};
    P.overrideAns = opts.ans || null;
    if (opts.list) {
      P.list = opts.list; P.pos = 0;
      P.mode = opts.mode || (mode === 'cat' || mode === 'smart' ? mode : 'review');
      P.review = !!opts.review;
    } else if (mode === 'seq') {
      P.list = Q.map(function (_, i) { return i; });
      P.pos = Math.min(S.pos || 0, N - 1);
      P.mode = 'seq'; P.review = false;
    } else if (mode === 'rand') {
      var n = opts.count && opts.count < N ? opts.count : N;
      P.list = shuffled(Q.map(function (_, i) { return i; })).slice(0, n);
      P.pos = 0; P.mode = 'rand'; P.review = false;
    } else if (mode === 'wrong') {
      P.list = Object.keys(S.wrong).map(Number);
      P.pos = 0; P.mode = 'wrong'; P.review = false;
    } else if (mode === 'fav') {
      P.list = S.fav.slice();
      P.pos = 0; P.mode = 'fav'; P.review = false;
    } else if (mode === 'cat') {
      P.list = opts.list || [];
      P.pos = 0; P.mode = 'cat'; P.review = false;
    } else if (mode === 'smart') {
      P.list = opts.list || [];
      P.pos = 0; P.mode = 'smart'; P.review = false;
    }
    P.list = P.list.filter(function (i) { return Number.isInteger(i) && Q[i]; });
    if (!P.list.length) {
      showDialog('暂无可练习题目', '当前分类还没有题目，完成练习或收藏后再来试试。', '知道了', function () {}); return;
    }
    P.retryMode = P.mode !== 'seq' && !P.review;
    P.retry = {};
    go('practice');
  }

  function openRandCount() {
    showChoices('随机练习题量', [
      { t: '20 题', s: '快速热身', fn: function () { startPractice('rand', { count: 20 }); } },
      { t: '50 题', s: '小强度练习', fn: function () { startPractice('rand', { count: 50 }); } },
      { t: '100 题', s: '完整一套', fn: function () { startPractice('rand', { count: 100 }); } },
      { t: '全部题目', s: '打乱 ' + N + ' 题', fn: function () { startPractice('rand', { count: N }); } }
    ]);
  }

  /* 顺序练习专用：自定义清除错题记录 */
  function openClearWrong() {
    var ids = Object.keys(S.wrong).map(Number).sort(function (a, b) { return a - b; });
    if (!ids.length) {
      showDialog('没有错题', '当前题库还没有错题记录，不用清理。', '知道了', function () {});
      return;
    }
    var sel = {};
    var rows = ids.map(function (i) {
      var q = Q[i] || {};
      var tm = String(q.tm || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (tm.length > 46) tm = tm.slice(0, 46) + '…';
      return '<div class="cw-item" data-idx="' + i + '">' +
        '<span class="cw-box"></span>' +
        '<div class="li-main"><div class="li-title">' + esc(tm) + '</div>' +
        '<div class="li-sub">' + (isJudge(q) ? '判断题' : '单选题') +
        ' · 错 ' + S.wrong[i] + ' 次 · 答案 ' + esc(correctLetter(q)) + '</div></div></div>';
    }).join('');
    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML =
      '<div class="sheet" style="max-height:82%">' +
        '<div class="sheet-head">清除错题记录<span class="cw-total">共 ' + ids.length + ' 道</span></div>' +
        '<div class="cw-tools">' +
          '<span class="chip" id="cwAll">全选</span>' +
          '<span class="chip" id="cwNone">清空选择</span>' +
          '<span class="spacer"></span>' +
          '<span class="tiny" id="cwCount">已选 0 道</span>' +
        '</div>' +
        '<div class="sheet-body" id="cwBody">' + rows + '</div>' +
        '<div class="sheet-foot">' +
          '<button class="btn ghost" style="flex:1" id="cwCancel">取消</button>' +
          '<button class="btn danger" style="flex:1" id="cwOk">清除所选</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);

    var items = Array.prototype.slice.call(mask.querySelectorAll('.cw-item'));
    function refresh() {
      var n = 0;
      items.forEach(function (el) {
        var i = el.getAttribute('data-idx');
        var on = !!sel[i];
        if (on) n++;
        el.classList.toggle('on', on);
      });
      mask.querySelector('#cwCount').textContent = '已选 ' + n + ' 道';
      return n;
    }
    items.forEach(function (el) {
      el.onclick = function () {
        var i = el.getAttribute('data-idx');
        if (sel[i]) delete sel[i]; else sel[i] = 1;
        refresh();
      };
    });
    mask.querySelector('#cwAll').onclick = function () {
      items.forEach(function (el) { sel[el.getAttribute('data-idx')] = 1; });
      refresh();
    };
    mask.querySelector('#cwNone').onclick = function () {
      sel = {};
      refresh();
    };
    mask.querySelector('#cwCancel').onclick = function () { document.body.removeChild(mask); };
    mask.querySelector('#cwOk').onclick = function () {
      var picked = Object.keys(sel);
      if (!picked.length) {
        showDialog('还没选', '请先勾选要清除的错题。', '知道了', function () {});
        return;
      }
      showDialog('清除错题', '将把选中的 ' + picked.length + ' 道题从错题本移除（练习记录不受影响）。', '确认清除', function () {
        picked.forEach(function (i) { delete S.wrong[i]; });
        write(PREFIX + 'wrong', S.wrong);
        document.body.removeChild(mask);
        if (screens.current && screens.current.name === 'practice') screens.practice(screens.current.params, true);
        showDialog('已清除', '已移除 ' + picked.length + ' 道错题记录。', '好', function () {});
      });
    };
    refresh();
  }

  function openSmart() {    var unseen = Q.map(function (_, i) { return i; }).filter(function (i) { return S.ans[i] == null; });
    var wrong2 = Object.keys(S.wrong).map(Number).filter(function (i) { return S.wrong[i] >= 2; });
    var wrongList = Object.keys(S.wrong).map(Number);
    showChoices('智能组卷', [
      { t: '错题专项', s: wrongList.length + ' 题', fn: function () { startPractice('smart', { list: shuffled(wrongList) }); } },
      { t: '收藏专项', s: S.fav.length + ' 题', fn: function () { startPractice('smart', { list: shuffled(S.fav) }); } },
      { t: '没做过的题', s: unseen.length + ' 题', fn: function () { startPractice('smart', { list: shuffled(unseen).slice(0, 100) }); } },
      { t: '错误 2 次以上', s: wrong2.length + ' 题', fn: function () { startPractice('smart', { list: shuffled(wrong2) }); } }
    ]);
  }

  function remember() {
    if (P.review) return;
    S.last = { mode: P.mode, pos: P.pos, list: P.list.slice(), retry: P.retry };
    write(PREFIX + 'last', S.last);
    if (P.mode === 'seq') { S.pos = P.pos; savePos(); }
  }
  function resumeLast() {
    if (!S.last || !S.last.list || !S.last.list.length) { startPractice('seq'); return; }
    P.list = S.last.list.slice();
    P.pos = Math.max(0, Math.min(S.last.pos || 0, P.list.length - 1));
    P.mode = S.last.mode || 'seq';
    P.review = false; P.overrideAns = null;
    P.retryMode = P.mode !== 'seq'; P.retry = S.last.retry || {};
    go('practice');
  }

  screens.practice = function () {
    showTabbar(false);
    var titles = { seq: '顺序练习', rand: '随机练习', wrong: '错题练习', fav: '收藏练习', cat: '章节练习', smart: '智能组卷', review: '试卷解析' };
    var cur = P.list[P.pos] || 0;
    setTop(titles[P.mode] || '练习', {
      light: true,
      back: true,
      right: '<span class="tb-acts">' +
        (P.mode === 'seq' ? '<span id="clrWrongBtn">清错</span>' : '') +
        '<span id="sheetBtn">答题卡</span>' +
        '<span style="font-size:20px;color:#f5a623" id="favBtn">' + (isFav(cur) ? '★' : '☆') + '</span></span>',
      onRight: null
    });
    var sb = $('#sheetBtn');
    if (sb) sb.onclick = function (e) { e.stopPropagation(); openPracticeSheet(); };
    var cw = $('#clrWrongBtn');
    if (cw) cw.onclick = function (e) { e.stopPropagation(); openClearWrong(); };
    var fb = $('#favBtn');
    if (fb) fb.onclick = function (e) {
      e.stopPropagation();
      var current = P.list[P.pos];
      toggleFav(current);
      fb.textContent = isFav(current) ? '★' : '☆';
    };
    renderPractice();
    setTimeout(function () { ensureVisible($('.answer-box')); }, 60);
  };

  function isFav(idx) { return S.fav.indexOf(idx) >= 0; }
  function toggleFav(idx) {
    var i = S.fav.indexOf(idx);
    if (i >= 0) S.fav.splice(i, 1); else S.fav.push(idx);
    write(PREFIX + 'fav', S.fav);
  }

  function renderPractice() {
    if (P.pos < 0) P.pos = 0;
    if (P.pos > P.list.length - 1) P.pos = P.list.length - 1;
    var idx = P.list[P.pos];
    var q = Q[idx];
    if (!q) { go('home'); return; }
    remember();
    var favorite = $('#favBtn'); if (favorite) favorite.textContent = isFav(idx) ? '★' : '☆';
    var opts = optionsOf(q);
    var ansMap = P.overrideAns || (P.retryMode ? P.retry : S.ans);
    var chosen = ansMap[idx];
    var answered = chosen != null;
    var reveal = answered || P.review;
    var right = answered && chosen === correctLetter(q);
    var pct = Math.round((P.pos + 1) / P.list.length * 100);

    var html =
      '<div class="pbar">' +
        '<span class="num">' + (P.pos + 1) + ' / ' + P.list.length + '</span>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '</div>' +
      '<div class="q-card">' +
        '<div class="row"><span class="q-tag ' + (isJudge(q) ? 'judge' : '') + '">' + (isJudge(q) ? '判断题' : '单选题') + '</span>' +
        '<span class="q-index">题号 ' + (q.idx || (idx + 1)) + '</span></div>' +
        '<div class="q-text">' + fixHtml(q.tm) + '</div>' + issueHtml(q) +
      '</div>' +
      '<div class="opts" id="opts"></div>';

    if (reveal && !q.issue) {
      html +=
        '<div class="answer-box ' + (right ? 'good' : 'bad') + '">' +
          '<div class="a-head ' + (right ? 'good' : 'bad') + '">' + (!answered ? '本题未作答' : (right ? '回答正确' : '回答错误')) + '</div>' +
          '<div class="a-body"><b style="color:var(--text)">正确答案：' + correctLetter(q) + '</b>' +
          (q.daanjiexi ? '<br>' + fixHtml(q.daanjiexi) : '<br><span class="muted">暂无解析</span>') + '</div>' +
        '</div>';
    }

    var isLast = P.pos === P.list.length - 1;
    html +=
      '<div class="bottom-bar no-tab">' +
        '<button class="btn ghost" id="prevBtn"' + (P.pos === 0 ? ' disabled' : '') + '>上一题</button>' +
        '<button class="btn primary" id="nextBtn"' + (answered || P.review || q.issue ? '' : ' disabled') + '>' + (isLast ? '完成' : '下一题') + '</button>' +
      '</div>';

    render(html);
    var box = $('#opts');
    opts.forEach(function (o) {
      var cls = 'opt';
      if (reveal && !q.issue) {
        cls += ' lock';
        if (o.letter === correctLetter(q)) cls += ' right';
        else if (o.letter === chosen) cls += ' wrong';
      }
      var b = document.createElement('button');
      b.className = cls;
      b.disabled = !!q.issue;
      b.innerHTML = '<span class="ltr">' + o.letter + '</span><span class="val">' + o.html + '</span>';
      b.onclick = function () { choose(o.letter); };
      box.appendChild(b);
    });

    $('#prevBtn').onclick = function () { P.pos--; renderPractice(); };
    var nb = $('#nextBtn');
    if (nb) nb.onclick = function () { if (isLast) finishPractice(); else { P.pos++; renderPractice(); } };

    function choose(letter) {
      if (P.overrideAns || P.review || q.issue) return;
      var store = P.retryMode ? P.retry : S.ans;
      if (store[idx] != null) return;
      store[idx] = letter;
      S.ans[idx] = letter;
      if (P.mode === 'seq') { S.pos = P.pos; savePos(); }
      var ok = letter === correctLetter(q);
      if (!ok) { S.wrong[idx] = (S.wrong[idx] || 0) + 1; }
      else if (P.mode === 'wrong') { delete S.wrong[idx]; }
      write(PREFIX + 'ans', S.ans);
      write(PREFIX + 'wrong', S.wrong);
      bumpDaily();
      vibrate(ok ? 12 : [0, 30, 40, 30]);
      remember();
      renderPractice();
      setTimeout(function () { ensureVisible($('.answer-box')); }, 40);
    }
  }

  function goPrev() { if (P.pos > 0) { P.pos--; renderPractice(); } }
  function goNext() { var b = $('#nextBtn'); if (b && !b.disabled) b.click(); }

  function openPracticeSheet() {
    var ansMap = P.overrideAns || (P.retryMode ? P.retry : S.ans);
    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    var cells = P.list.map(function (idx, i) {
      var a = ansMap[idx];
      var cls = 'cg';
      if (a != null) cls += (a === correctLetter(Q[idx]) ? ' right' : ' wrong');
      if (i === P.pos) cls += ' cur';
      return '<div class="' + cls + '" data-i="' + i + '">' + (i + 1) + '</div>';
    }).join('');
    var doneN = 0;
    P.list.forEach(function (idx) { if (ansMap[idx] != null) doneN++; });
    mask.innerHTML =
      '<div class="sheet">' +
        '<div class="sheet-head">答题卡<span class="spacer"></span>' +
          '<span class="tiny" style="font-weight:400">已答 ' + doneN + ' / ' + P.list.length + '</span>' +
        '</div>' +
        '<div class="sheet-body"><div class="cards-grid">' + cells + '</div></div>' +
        '<div class="sheet-foot"><button class="btn ghost" style="flex:1" id="sheetClose">继续练习</button></div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.querySelector('#sheetClose').onclick = function () { document.body.removeChild(mask); };
    Array.prototype.forEach.call(mask.querySelectorAll('.cg'), function (c) {
      c.onclick = function () { P.pos = Number(c.getAttribute('data-i')); document.body.removeChild(mask); renderPractice(); };
    });
  }

  function finishPractice() {
    var done = Object.keys(S.ans).length;
    var wrongN = Object.keys(S.wrong).length;
    showTabbar(true); setTab('practice');
    setTop('练习完成', { light: true, back: true });
    render(
      '<div class="result-card">' +
        '<div style="font-size:44px">🎉</div>' +
        '<div style="font-size:20px;font-weight:700;margin-top:10px">练习完成</div>' +
        '<div class="res-meta">' +
          '<div><b>' + done + '</b><span>累计已练</span></div>' +
          '<div><b>' + wrongN + '</b><span>错题</span></div>' +
          '<div><b>' + N + '</b><span>题库总数</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="page">' +
        '<button class="btn primary" style="width:100%" id="againBtn">继续练习</button>' +
        '<div style="height:12px"></div>' +
        '<button class="btn ghost" style="width:100%" id="wrongBtn">去巩固错题</button>' +
      '</div>'
    );
    $('#againBtn').onclick = function () { startPractice('seq'); };
    $('#wrongBtn').onclick = function () { startPractice('wrong'); };
  }

  /* ---------- 背题模式 ---------- */
  var R = { list: [], pos: 0 };
  function startRecite() {
    R.list = Q.map(function (_, i) { return i; }).filter(function (i) { return S.reciteKnown[i] == null && !Q[i].issue; });
    if (!R.list.length) R.list = Q.map(function (_, i) { return i; }).filter(function (i) { return !Q[i].issue; });
    R.pos = 0;
    go('recite');
  }
  screens.recite = function () {
    showTabbar(false);
    setTop('背题模式', { light: true, back: true });
    renderRecite();
  };
  function renderRecite() {
    if (R.pos < 0) R.pos = 0;
    if (R.pos > R.list.length - 1) R.pos = R.list.length - 1;
    var idx = R.list[R.pos];
    var q = Q[idx];
    if (!q) { go('home'); return; }
    var opts = optionsOf(q);
    var correct = correctLetter(q);
    var pct = Math.round((R.pos + 1) / R.list.length * 100);
    var html =
      '<div class="pbar"><span class="num">' + (R.pos + 1) + ' / ' + R.list.length + '</span>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="q-card">' +
        '<div class="row"><span class="q-tag ' + (isJudge(q) ? 'judge' : '') + '">' + (isJudge(q) ? '判断题' : '单选题') + '</span>' +
        '<span class="q-index">题号 ' + (q.idx || (idx + 1)) + '</span></div>' +
        '<div class="q-text">' + fixHtml(q.tm) + '</div>' + issueHtml(q) +
      '</div>' +
      '<div class="opts">' +
        opts.map(function (o) {
          return '<div class="opt lock' + (o.letter === correct ? ' right' : '') + '">' +
            '<span class="ltr">' + o.letter + '</span><span class="val">' + o.html + '</span></div>';
        }).join('') +
      '</div>' +
      '<div class="answer-box good">' +
        '<div class="a-head good">正确答案：' + correct + '</div>' +
        '<div class="a-body">' + (q.daanjiexi ? fixHtml(q.daanjiexi) : '<span class="muted">暂无解析</span>') + '</div>' +
      '</div>' +
      '<div class="bottom-bar no-tab">' +
        '<button class="btn ghost" id="remUnknown">没记住</button>' +
        '<button class="btn primary" id="remKnown">记住了</button>' +
      '</div>';
    render(html);
    $('#remKnown').onclick = function () { S.reciteKnown[idx] = 1; delete S.reciteUnknown[idx]; write(PREFIX + 'known', S.reciteKnown); write(PREFIX + 'unknown', S.reciteUnknown); bumpDaily(); reciteNext(1); };
    $('#remUnknown').onclick = function () { S.reciteUnknown[idx] = 1; delete S.reciteKnown[idx]; write(PREFIX + 'known', S.reciteKnown); write(PREFIX + 'unknown', S.reciteUnknown); bumpDaily(); reciteNext(-1); };
  }
  function reciteNext() {
    if (R.pos >= R.list.length - 1) {
      showTabbar(true); setTab('practice');
      setTop('背题完成', { light: true, back: true });
      render('<div class="result-card"><div style="font-size:44px">📚</div>' +
        '<div style="font-size:20px;font-weight:700;margin-top:10px">本轮背题完成</div>' +
        '<div class="res-meta"><div><b>' + Object.keys(S.reciteKnown).length + '</b><span>已记住</span></div>' +
        '<div><b>' + Object.keys(S.reciteUnknown).length + '</b><span>没记住</span></div>' +
        '<div><b>' + R.list.length + '</b><span>本轮题数</span></div></div></div>' +
        '<div class="page"><button class="btn primary" style="width:100%" id="againR">再来一轮</button></div>');
      $('#againR').onclick = function () { startRecite(); };
      return;
    }
    R.pos++;
    renderRecite();
  }
  function recitePrev() { if (R.pos > 0) { R.pos--; renderRecite(); } }

  /* ---------- 章节 ---------- */
  screens.cats = function () {
    showTabbar(true); setTab('practice');
    setTop('章节练习', { light: true, back: true });
    var map = {};
    Q.forEach(function (q, i) {
      var c = q.cat || '其他';
      if (!map[c]) map[c] = { n: 0, done: 0, right: 0, ids: [] };
      map[c].n++;
      map[c].ids.push(i);
    });
    Object.keys(map).forEach(function (c) {
      map[c].ids.forEach(function (i) {
        if (S.ans[i] != null) {
          map[c].done++;
          if (S.ans[i] === correctLetter(Q[i])) map[c].right++;
        }
      });
    });
    var cats = Object.keys(map).sort(function (a, b) { return map[b].n - map[a].n; });
    var html = '<div class="page" style="padding-bottom:0"><div class="tiny">按题面关键词自动归类，共 ' + cats.length + ' 个知识点</div></div><div class="list">';
    cats.forEach(function (c) {
      var m = map[c];
      var p = Math.round(m.done / m.n * 100);
      var rate = m.done ? Math.round(m.right / m.done * 100) : 0;
      html += '<div class="list-item" data-cat="' + esc(c) + '"><div class="li-main">' +
        '<div class="li-title">' + esc(c) + '</div>' +
        '<div class="li-sub">' + m.n + ' 题 · 已练 ' + m.done + '（' + p + '%）· 正确率 ' + rate + '%</div>' +
        '<div class="bar" style="margin-top:8px"><i style="width:' + p + '%"></i></div>' +
        '</div><span class="chev">›</span></div>';
    });
    html += '</div>';
    render(html);
    Array.prototype.forEach.call(content.querySelectorAll('.list-item'), function (el) {
      el.onclick = function () {
        var c = el.getAttribute('data-cat');
        var qs = Q.map(function (q, i) { return i; }).filter(function (i) { return (Q[i].cat || '其他') === c; });
        startPractice('cat', { list: qs });
      };
    });
  };

  /* ---------- 错题 / 收藏 ---------- */
  screens.wrong = function () {
    showTabbar(true); setTab('wrong');
    setTop('错题本', { light: true });
    var ids = Object.keys(S.wrong).map(Number).sort(function (a, b) { return S.wrong[b] - S.wrong[a]; });
    var html = '';
    if (!ids.length) {
      html = '<div class="empty"><span class="e-ico">🎯</span>还没有错题<br>做错的题会自动收进这里</div>';
    } else {
      html += '<div class="page" style="padding-bottom:0"><button class="btn primary" style="width:100%" id="redoAll">开始错题练习（' + ids.length + ' 题）</button></div>';
      html += '<div class="list">';
      ids.forEach(function (idx) {
        var q = Q[idx];
        html += '<div class="list-item" data-idx="' + idx + '">' +
          '<div class="li-main">' +
            '<div class="li-title">' + fixHtml(q.tm).replace(/<[^>]+>/g, '') + '</div>' +
            '<div class="li-sub">' + (isJudge(q) ? '判断题' : '单选题') + ' · 错 ' + S.wrong[idx] + ' 次 · 答案 ' + correctLetter(q) + '</div>' +
          '</div><span class="chev">›</span></div>';
      });
      html += '</div>';
    }
    render(html);
    var redo = $('#redoAll');
    if (redo) redo.onclick = function () { startPractice('wrong'); };
    Array.prototype.forEach.call(content.querySelectorAll('.list-item'), function (el) {
      el.onclick = function () {
        var idx = Number(el.getAttribute('data-idx'));
        startPractice('review', { list: [idx], review: true });
      };
    });
  };

  screens.fav = function () {
    showTabbar(true); setTab('practice');
    setTop('我的收藏', { light: true });
    var ids = S.fav.slice();
    var html = '';
    if (!ids.length) {
      html = '<div class="empty"><span class="e-ico">⭐</span>还没有收藏<br>练习时点右上角星标收藏</div>';
    } else {
      html += '<div class="page" style="padding-bottom:0"><button class="btn primary" style="width:100%" id="doFav">练习收藏题（' + ids.length + ' 题）</button></div>';
      html += '<div class="list">';
      ids.forEach(function (idx) {
        var q = Q[idx];
        if (!q) return;
        html += '<div class="list-item" data-idx="' + idx + '">' +
          '<div class="li-main"><div class="li-title">' + fixHtml(q.tm).replace(/<[^>]+>/g, '') + '</div>' +
          '<div class="li-sub">' + (isJudge(q) ? '判断题' : '单选题') + '</div></div><span class="chev">›</span></div>';
      });
      html += '</div>';
    }
    render(html);
    var b = $('#doFav');
    if (b) b.onclick = function () { startPractice('fav'); };
    Array.prototype.forEach.call(content.querySelectorAll('.list-item'), function (el) {
      el.onclick = function () {
        startPractice('review', { list: [Number(el.getAttribute('data-idx'))], review: true });
      };
    });
  };

  /* ---------- 考试 ---------- */
  var E = { list: [], answers: {}, pos: 0, endAt: 0, timer: null, submitted: false };

  function examTotal() {
    var total = 100;
    var m = String(location.search || '').match(/[?&]exam=(\d+)/);
    if (m) total = Math.max(2, Math.min(100, parseInt(m[1], 10)));
    return total;
  }

  screens.exam = function () {
    showTabbar(true); setTab('exam');
    setTop('模拟考试', { light: true });
    var total = examTotal();
    var danN = Math.min(50, total);
    var panN = total - danN;
    render(
      '<div class="exam-start">' +
        '<div class="exam-hero">' +
          '<div class="big">' + total + '</div>' +
          '<div class="sub">满分 100 分 · 80 分合格</div>' +
        '</div>' +
        '<div class="exam-meta">' +
          '<div><b>' + danN + '</b><span>单选题</span></div>' +
          '<div><b>' + panN + '</b><span>判断题</span></div>' +
          '<div><b>45</b><span>分钟</span></div>' +
        '</div>' +
        '<div class="rules">' +
          '<h4>考试说明</h4>' +
          '1. 从题库随机抽取 ' + danN + ' 道单选 + ' + panN + ' 道判断；<br>' +
          '2. 得分按答对比例折算为百分制，80 分及格；<br>' +
          '3. 考试时间 45 分钟，倒计时结束自动交卷；<br>' +
          '4. 交卷后可逐题查看答案与解析。' +
        '</div>' +
        '<div style="height:18px"></div>' +
        '<button class="btn primary" style="width:100%" id="startExam" onclick="window.__startExam&&window.__startExam()">开始考试</button>' +
      '</div>'
    );
    window.__startExam = startExam;
  };

  function startExam() {
    var total = examTotal();
    var danN = Math.min(50, total);
    var panN = total - danN;
    var allIdx = Q.map(function (_, i) { return i; }).filter(function (i) { return !Q[i].issue; });
    var dan = shuffled(allIdx.filter(function (i) { return !isJudge(Q[i]); })).slice(0, danN);
    var pan = shuffled(allIdx.filter(function (i) { return isJudge(Q[i]); })).slice(0, panN);
    E.list = dan.concat(pan);
    E.answers = {};
    E.pos = 0;
    E.submitted = false;
    E.endAt = Date.now() + 45 * 60 * 1000;
    go('examRun');
  }

  screens.examRun = function () {
    showTabbar(false);
    setTop('模拟考试', {
      light: true,
      back: true,
      right: '<span id="sheetBtn" style="font-size:14px">答题卡</span>'
    });
    var sb = $('#sheetBtn');
    if (sb) sb.onclick = function () { openSheet(); };
    renderExamQ();
    if (E.timer) clearInterval(E.timer);
    E.timer = setInterval(function () {
      var left = Math.floor((E.endAt - Date.now()) / 1000);
      var t = $('#timer');
      if (t) { t.textContent = fmtTime(left); t.classList.toggle('warn', left <= 300); }
      if (left <= 0) { clearInterval(E.timer); submitExam(true); }
    }, 500);
  };

  function renderExamQ() {
    clearTimeout(E.advance); E.advance = null;
    var idx = E.list[E.pos];
    var q = Q[idx];
    var opts = optionsOf(q);
    var chosen = E.answers[E.pos];
    var html =
      '<div class="exam-top">' +
        '<span style="font-size:14px;color:var(--text-2)">第 ' + (E.pos + 1) + ' / ' + E.list.length + ' 题</span>' +
        '<div class="spacer"></div>' +
        '<span style="font-size:13px;color:var(--text-3)">剩余</span>' +
        '<span class="timer" id="timer">' + fmtTime((E.endAt - Date.now()) / 1000) + '</span>' +
      '</div>' +
      '<div class="q-card">' +
        '<div class="row"><span class="q-tag ' + (isJudge(q) ? 'judge' : '') + '">' + (isJudge(q) ? '判断题' : '单选题') + '</span></div>' +
        '<div class="q-text">' + fixHtml(q.tm) + '</div>' + issueHtml(q) +
      '</div>' +
      '<div class="opts" id="opts"></div>' +
      '<div class="bottom-bar no-tab">' +
        '<button class="btn ghost" id="prevQ"' + (E.pos === 0 ? ' disabled' : '') + '>上一题</button>' +
        '<button class="btn primary" id="nextQ">' + (E.pos === E.list.length - 1 ? '交卷' : '下一题') + '</button>' +
      '</div>';
    render(html);
    var box = $('#opts');
    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'opt' + (chosen === o.letter ? ' sel' : '');
      b.innerHTML = '<span class="ltr">' + o.letter + '</span><span class="val">' + o.html + '</span>';
      b.onclick = function () {
        E.answers[E.pos] = o.letter;
        renderExamQ();
        var answeredPos = E.pos;
        E.advance = setTimeout(function () {
          if (!E.submitted && screens.current && screens.current.name === 'examRun' && E.pos === answeredPos && E.pos < E.list.length - 1) { E.pos++; renderExamQ(); }
        }, 180);
      };
      box.appendChild(b);
    });
    $('#prevQ').onclick = function () { if (E.pos > 0) { E.pos--; renderExamQ(); } };
    $('#nextQ').onclick = function () {
      if (E.pos < E.list.length - 1) { E.pos++; renderExamQ(); }
      else confirmSubmit();
    };
  }

  function confirmSubmit() {
    var done = Object.keys(E.answers).length;
    if (done < E.list.length) {
      showDialog('还有 ' + (E.list.length - done) + ' 题未作答', '确定要交卷吗？', '交卷', function () { submitExam(false); });
    } else {
      submitExam(false);
    }
  }

  function openSheet() {
    clearTimeout(E.advance); E.advance = null;
    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    var cells = E.list.map(function (idx, i) {
      var cls = 'cg';
      if (E.answers[i] != null) cls += ' done';
      if (i === E.pos) cls += ' cur';
      return '<div class="' + cls + '" data-i="' + i + '">' + (i + 1) + '</div>';
    }).join('');
    mask.innerHTML =
      '<div class="sheet">' +
        '<div class="sheet-head">答题卡<span class="spacer"></span>' +
          '<span class="tiny" style="font-weight:400">已答 ' + Object.keys(E.answers).length + ' / ' + E.list.length + '</span>' +
        '</div>' +
        '<div class="sheet-body"><div class="cards-grid">' + cells + '</div></div>' +
        '<div class="sheet-foot">' +
          '<button class="btn ghost" style="flex:1" id="sheetClose">继续答题</button>' +
          '<button class="btn primary" style="flex:1" id="sheetSubmit">交卷</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.querySelector('#sheetClose').onclick = function () { document.body.removeChild(mask); };
    mask.querySelector('#sheetSubmit').onclick = function () { document.body.removeChild(mask); confirmSubmit(); };
    Array.prototype.forEach.call(mask.querySelectorAll('.cg'), function (c) {
      c.onclick = function () { E.pos = Number(c.getAttribute('data-i')); document.body.removeChild(mask); renderExamQ(); };
    });
  }

  function submitExam(auto) {
    if (E.submitted) return;
    E.submitted = true;
    if (E.timer) clearInterval(E.timer);
    var right = 0, wrong = 0, blank = 0;
    E.list.forEach(function (idx, i) {
      var a = E.answers[i];
      if (a == null) { blank++; return; }
      if (a === correctLetter(Q[idx])) right++;
      else { wrong++; S.wrong[idx] = (S.wrong[idx] || 0) + 1; }
    });
    var score = E.list.length ? Math.round(right / E.list.length * 100) : 0;
    var rec = { date: today(), score: score, dur: Math.round((Date.now() - (E.endAt - 45 * 60 * 1000)) / 1000), right: right, wrong: wrong, blank: blank, auto: !!auto };
    clearTimeout(E.advance);
    S.records.unshift(rec);
    S.records = S.records.slice(0, 30);
    write(PREFIX + 'records', S.records);
    write(PREFIX + 'wrong', S.wrong);
    go('examResult', { score: score, right: right, wrong: wrong, blank: blank, rec: rec });
  }

  screens.examResult = function (p) {
    showTabbar(true); setTab('exam');
    setTop('考试成绩', { light: true });
    var pass = p.score >= 80;
    render(
      '<div class="result-card">' +
        '<div class="score ' + (pass ? '' : 'fail') + '">' + p.score + '</div>' +
        '<div style="color:var(--text-3);font-size:13px;margin-top:4px">总分 100 分</div>' +
        '<span class="pass ' + (pass ? 'ok' : 'no') + '">' + (pass ? '恭喜，考试合格' : '未达 80 分，继续加油') + '</span>' +
        '<div class="res-meta">' +
          '<div><b style="color:var(--green)">' + p.right + '</b><span>答对</span></div>' +
          '<div><b style="color:var(--red)">' + p.wrong + '</b><span>答错</span></div>' +
          '<div><b>' + p.blank + '</b><span>未答</span></div>' +
          '<div><b>' + fmtTime(p.rec.dur) + '</b><span>用时</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="page">' +
        '<button class="btn primary" style="width:100%" id="reviewBtn">查看答案解析</button>' +
        '<div style="height:12px"></div>' +
        '<button class="btn ghost" style="width:100%" id="againBtn">再来一套</button>' +
      '</div>'
    );
    $('#reviewBtn').onclick = function () {
      var ansMap = {};
      Object.keys(E.answers).forEach(function (pos) { ansMap[E.list[Number(pos)]] = E.answers[pos]; });
      startPractice('review', { list: E.list.slice(), review: true, ans: ansMap });
    };
    $('#againBtn').onclick = function () { startExam(); };
  };

  /* ---------- 统计 ---------- */
  screens.stats = function () {
    showTabbar(true); setTab('home');
    setTop('学习统计', { light: true, back: true });
    var done = 0, right = 0, jDone = 0, jRight = 0, sDone = 0, sRight = 0;
    Object.keys(S.ans).forEach(function (k) {
      var q = Q[Number(k)]; if (!q) return;
      var ok = S.ans[k] === correctLetter(q);
      done++; if (ok) right++;
      if (isJudge(q)) { jDone++; if (ok) jRight++; } else { sDone++; if (ok) sRight++; }
    });
    var jTotal = Q.filter(isJudge).length;
    var sTotal = N - jTotal;
    var rate = done ? Math.round(right / done * 100) : 0;
    var jRate = jDone ? Math.round(jRight / jDone * 100) : 0;
    var sRate = sDone ? Math.round(sRight / sDone * 100) : 0;
    function bar(cur, total, color) {
      var p = total ? Math.round(cur / total * 100) : 0;
      return '<div class="bar" style="margin-top:8px"><i style="width:' + p + '%' + (color ? ';background:' + color : '') + '"></i></div>';
    }
    var html =
      '<div class="page">' +
        '<div class="q-card" style="text-align:center">' +
          '<div class="tiny">总体正确率</div>' +
          '<div style="font-size:52px;font-weight:800;color:var(--blue);line-height:1.2">' + rate + '<span style="font-size:22px">%</span></div>' +
          '<div class="tiny">已练习 ' + done + ' / ' + N + ' 题</div>' +
          bar(done, N) +
        '</div>' +
        '<div class="q-card">' +
          '<div class="row"><span style="font-weight:700">单选题</span><span class="tiny">' + sDone + ' / ' + sTotal + ' · 正确率 ' + sRate + '%</span></div>' +
          bar(sDone, sTotal) +
          '<div style="height:16px"></div>' +
          '<div class="row"><span style="font-weight:700">判断题</span><span class="tiny">' + jDone + ' / ' + jTotal + ' · 正确率 ' + jRate + '%</span></div>' +
          bar(jDone, jTotal, 'linear-gradient(90deg,#fbbf24,#f59e0b)') +
        '</div>' +
        '<div class="q-card">' +
          '<div class="row"><span style="font-weight:700">错题待巩固</span><span style="color:var(--red);font-weight:700">' + Object.keys(S.wrong).length + ' 题</span></div>' +
          '<div style="height:12px"></div>' +
          '<div class="row"><span style="font-weight:700">已收藏</span><span class="tiny">' + S.fav.length + ' 题</span></div>' +
        '</div>' +
        '<div class="q-card"><div class="row" style="margin-bottom:8px"><span style="font-weight:700">成绩趋势</span><span class="tiny">最近 ' + Math.min(10, S.records.length) + ' 次</span></div>' +
          trendSvg() + '</div>' +
        '<div class="q-card"><div class="row" style="margin-bottom:8px"><span style="font-weight:700">每日打卡</span><span class="tiny">目标 ' + SET.goal + ' 题/天</span></div>' +
          heatSvg() + '</div>';
    html += '<div class="list"><div class="list-item"><div class="li-main"><div class="li-title">最近成绩</div></div></div>';
    if (!S.records.length) {
      html += '<div class="list-item"><div class="li-main"><div class="li-sub">还没有考试记录</div></div></div>';
    } else {
      S.records.slice(0, 5).forEach(function (r) {
        html += '<div class="list-item"><div class="li-main">' +
          '<div class="li-title">' + r.score + ' 分 ' + (r.score >= 80 ? '<span style="color:var(--green);font-size:12px">合格</span>' : '<span style="color:var(--red);font-size:12px">不合格</span>') + '</div>' +
          '<div class="li-sub">' + r.date + ' · 用时 ' + fmtTime(r.dur) + ' · 对 ' + r.right + ' 错 ' + r.wrong + '</div>' +
        '</div></div>';
      });
    }
    html += '</div></div>';
    render(html);
  };

  // 首页进度卡里的迷你成绩曲线：最近 8 次，含 80 分合格线
  function miniTrend() {
    var rs = S.records.slice(0, 8).reverse();
    if (!rs.length) {
      return '<div class="trend-empty">考一次模拟考试，这里就会出现分数走势</div>';
    }
    var W = 300, H = 56, padX = 8, padY = 10;
    var innerH = H - padY * 2;
    var yOf = function (s) { return padY + innerH * (1 - Math.min(100, Math.max(0, s)) / 100); };
    var step = rs.length > 1 ? (W - padX * 2) / (rs.length - 1) : 0;
    var pts = [], dots = [];
    for (var i = 0; i < rs.length; i++) {
      var x = rs.length > 1 ? padX + i * step : W / 2;
      var y = yOf(rs[i].score);
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
      var col = rs[i].score >= 80 ? '#16a34a' : '#ef4444';
      dots.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.8" fill="' + col + '"/>');
      dots.push('<text x="' + x.toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" font-size="9" fill="' + col +
        '" text-anchor="middle">' + rs[i].score + '</text>');
    }
    var dk = document.documentElement.getAttribute('data-theme') === 'dark';
    var grid = dk ? '#2a3242' : '#e9eef8';
    var line = dk ? '#7fb0ff' : '#2f6bff';
    var fill = dk ? 'rgba(127,176,255,.14)' : 'rgba(47,107,255,.10)';
    var y80 = yOf(80);
    var area = rs.length > 1
      ? '<polygon points="' + padX + ',' + (H - padY) + ' ' + pts.join(' ') + ' ' +
        (W - padX) + ',' + (H - padY) + '" fill="' + fill + '"/>'
      : '';
    return '<div class="mini-trend-wrap">' +
      '<svg class="mini-trend" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<line x1="' + padX + '" y1="' + y80.toFixed(1) + '" x2="' + (W - padX) + '" y2="' + y80.toFixed(1) +
      '" stroke="' + grid + '" stroke-width="1" stroke-dasharray="4 4"/>' + area +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + line +
      '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + dots.join('') + '</svg>' +
      '<span class="trend-legend">80 分合格线</span></div>';
  }

  function trendSvg() {
    var rs = S.records.slice(0, 10).reverse();
    if (!rs.length) return '<div class="tiny">还没有考试记录</div>';
    var W = 300, H = 110, pad = 18;
    var step = rs.length > 1 ? (W - pad * 2) / (rs.length - 1) : 0;
    var pts = rs.map(function (r, i) {
      var x = pad + i * step;
      var y = pad + (H - pad * 2) * (1 - r.score / 100);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var dots = rs.map(function (r, i) {
      var x = pad + i * step;
      var y = pad + (H - pad * 2) * (1 - r.score / 100);
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="' + (r.score >= 80 ? '#16a34a' : '#ef4444') + '"/>';
    }).join('');
    var dk = document.documentElement.getAttribute('data-theme') === 'dark';
    var grid = dk ? '#2a3242' : '#eceff4';
    var line = dk ? '#7fb0ff' : '#2f6bff';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto">' +
      '<line x1="' + pad + '" y1="' + pad + '" x2="' + (W - pad) + '" y2="' + pad + '" stroke="' + grid + '"/>' +
      '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="' + grid + '"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="' + line + '" stroke-width="2"/>' + dots + '</svg>';
  }

  function heatSvg() {
    var days = 84;
    var cells = [];
    var start = new Date();
    start.setDate(start.getDate() - days + 1);
    var first = new Date(start.getTime());
    var offset = (first.getDay() + 6) % 7;
    for (var i = 0; i < offset; i++) cells.push(null);
    for (var d = 0; d < days; d++) {
      var dt = new Date(start.getTime());
      dt.setDate(dt.getDate() + d);
      var key = dateStr(dt);
      cells.push({ k: key, n: S.daily[key] || 0 });
    }
    var goal = Math.max(1, SET.goal);
    var box = cells.map(function (c) {
      if (!c) return '<i style="background:transparent"></i>';
      var lv = c.n <= 0 ? 0 : (c.n >= goal ? 4 : c.n >= goal * 0.66 ? 3 : c.n >= goal * 0.33 ? 2 : 1);
      var colors = document.documentElement.getAttribute('data-theme') === 'dark'
        ? ['#1e2635', '#25406b', '#2f5fa8', '#4d8bff', '#7fb0ff']
        : ['#eef1f7', '#d7e5ff', '#9dc0ff', '#5b93ff', '#2f6bff'];
      return '<i title="' + c.k + ' ' + c.n + ' 题" style="background:' + colors[lv] + '"></i>';
    }).join('');
    return '<div class="heat">' + box + '</div>' +
      '<div class="tiny" style="margin-top:8px">最近 12 周 · 颜色越深做题越多</div>';
  }

  screens.heat = function () {
    showTabbar(true); setTab('home');
    setTop('打卡日历', { light: true, back: true });
    var t = today();
    render('<div class="page">' +
      '<div class="q-card"><div class="row"><span style="font-weight:700">今日已练</span><span style="color:var(--blue);font-weight:700">' + (S.daily[t] || 0) + ' 题</span></div>' +
      '<div class="tiny" style="margin-top:6px">每日目标 ' + SET.goal + ' 题 · 连续打卡 ' + calcStreak() + ' 天</div>' +
      '<div style="margin-top:14px">' + heatSvg() + '</div></div>' +
      '<div class="page" style="padding-top:0"><button class="btn ghost" style="width:100%" id="goalBtn">调整每日目标</button></div>' +
      '</div>');
    $('#goalBtn').onclick = openGoal;
  };

  function openGoal() {
    showChoices('每日目标', [
      { t: '10 题 / 天', s: '轻松一点', fn: function () { SET.goal = 10; storage.setItem('jhw_goal', '10'); go('heat', {}, true); } },
      { t: '20 题 / 天', s: '常规强度', fn: function () { SET.goal = 20; storage.setItem('jhw_goal', '20'); go('heat', {}, true); } },
      { t: '30 题 / 天', s: '推荐', fn: function () { SET.goal = 30; storage.setItem('jhw_goal', '30'); go('heat', {}, true); } },
      { t: '50 题 / 天', s: '冲刺', fn: function () { SET.goal = 50; storage.setItem('jhw_goal', '50'); go('heat', {}, true); } }
    ]);
  }

  /* ---------- 我的 ---------- */
  screens.me = function () {
    showTabbar(true); setTab('me');
    setTop('我的', { light: true });
    var done = Object.keys(S.ans).length;
    var right = 0;
    Object.keys(S.ans).forEach(function (idx) { if (S.ans[idx] === correctLetter(Q[Number(idx)])) right++; });
    var rate = done ? Math.round(right / done * 100) : 0;
    var best = S.records.reduce(function (m, r) { return Math.max(m, r.score); }, 0);
    var html =
      '<div class="me-head">' +
        '<div class="avatar">👷</div>' +
        '<div class="name">' + (BANK.id === 'gy' ? '高压电工考生' : '低压电工考生') + '</div>' +
        '<div class="desc">' + esc(BANK.name) + ' · 已练习 ' + done + ' / ' + N + ' 题 · 正确率 ' + rate + '%</div>' +
      '</div>' +
      '<div class="stat-card">' +
        '<div class="stat"><b>' + best + '</b><span>最高分</span></div>' +
        '<div class="stat"><b>' + S.records.length + '</b><span>考试次数</span></div>' +
        '<div class="stat"><b>' + Object.keys(S.wrong).length + '</b><span>错题数</span></div>' +
      '</div>';

    html += '<div class="list"><div class="list-item"><div class="li-main"><div class="li-title">历史成绩</div></div></div>';
    if (!S.records.length) {
      html += '<div class="list-item"><div class="li-main"><div class="li-sub">暂无考试记录</div></div></div>';
    } else {
      S.records.slice(0, 10).forEach(function (r) {
        html += '<div class="list-item"><div class="li-main">' +
          '<div class="li-title">' + r.score + ' 分 ' + (r.score >= 80 ? '<span style="color:var(--green);font-size:12px">合格</span>' : '<span style="color:var(--red);font-size:12px">不合格</span>') + '</div>' +
          '<div class="li-sub">' + r.date + ' · 用时 ' + fmtTime(r.dur) + ' · 对 ' + r.right + ' 错 ' + r.wrong + '</div>' +
        '</div></div>';
      });
    }
    html += '</div>';

    html += '<div class="list">' +
      row('切换题库', BANKS.length > 1 ? BANK.name : '仅一个题库', 'bankRow') +
      row('夜间模式', SET.theme === 'dark' ? '已开启' : '已关闭', 'themeRow') +
      row('答题震动', SET.vibrate ? '已开启' : '已关闭', 'vibRow') +
      row('每日目标', SET.goal + ' 题', 'goalRow') +
      row('每日提醒', window.AndroidUI ? (SET.remind.on ? '已开启' : '未开启') : '网页版不支持后台定时提醒', 'remindRow') +
      row('题库校验', Q.filter(function(q){return !!q.issue;}).length + ' 题待补全 · ' + Q.filter(function(q){return !q.daanjiexi.trim();}).length + ' 题原始数据无解析', 'qualityRow') +
      row('备份进度', '导出到「下载」目录', 'backupRow') +
      row('恢复进度', '从备份文件导入', 'restoreRow') +
    '</div>';

    html += '<div class="page">' +
      '<button class="btn danger" style="width:100%" id="resetBtn">清空当前题库学习记录</button>' +
      '<div style="height:10px"></div>' +
      '<div class="tiny" style="text-align:center">' + esc(BANK.name) + ' · 共 ' + N + ' 题 · 数据仅保存在本机</div>' +
      '<div class="me-notice">' +
        '<div class="mn-text">仅供参考学习</div>' +
          '<div class="mn-sign">——三玖 · yotoshijo</div>' +
      '</div>' +
    '</div>';

    render(html);

    $('#bankRow').onclick = openBankSwitch;
    $('#themeRow').onclick = function () {
      SET.theme = SET.theme === 'dark' ? 'light' : 'dark';
      storage.setItem('jhw_theme', SET.theme);
      applyTheme();
      go('me', {}, true);
    };
    $('#vibRow').onclick = function () {
      SET.vibrate = !SET.vibrate;
      write('jhw_vibrate', SET.vibrate);
      vibrate(20);
      go('me', {}, true);
    };
    $('#goalRow').onclick = openGoal;
    $('#remindRow').onclick = openRemind;
    $('#qualityRow').onclick = function () {
      var issues = Q.map(function(q,i){return {q:q,i:i};}).filter(function(v){return v.q.issue;});
      showChoices('题库校验', issues.length ? issues.map(function(v){ return {t:'第 ' + v.q.idx + ' 题 · 缺少配图',s:v.q.issue,fn:function(){startPractice('review',{list:[v.i],review:true});}}; }) : [{t:'当前题库题干、选项和图片引用检查通过',s:'解析和答案沿用原始资料；未进行逐题专业内容审定。',fn:function(){}}]);
    };
    $('#backupRow').onclick = doBackup;
    $('#restoreRow').onclick = doRestore;
    $('#resetBtn').onclick = function () {
      showDialog('清空记录', '将删除当前题库的练习进度、错题、收藏和成绩记录，不可恢复。', '确认清空', function () {
        ['pos', 'ans', 'wrong', 'fav', 'records', 'known', 'unknown', 'daily', 'last'].forEach(function (k) {
          storage.removeItem(PREFIX + k);
        });
        loadState();
        go('me', {}, true);
      });
    };
  };

  function row(title, sub, id) {
    return '<div class="list-item" id="' + id + '"><div class="li-main"><div class="li-title">' + esc(title) + '</div>' +
      '<div class="li-sub">' + esc(sub) + '</div></div><span class="chev">›</span></div>';
  }

  function openRemind() {
    if (!window.AndroidUI || !window.AndroidUI.setReminder) { showDialog('网页版提醒说明', '浏览器关闭后无法保证按时提醒，请在手机时钟中设置每日学习提醒。', '知道了', function () {}); return; }
    var times = [[7, 0], [8, 0], [12, 0], [20, 0], [21, 0], [22, 0]];
    var items = times.map(function (t) {
      var hh = ('0' + t[0]).slice(-2), mm = ('0' + t[1]).slice(-2);
      return {
        t: '每天 ' + hh + ':' + mm,
        s: (SET.remind.on && SET.remind.h === t[0] && SET.remind.m === t[1]) ? '当前设置' : '',
        fn: function () {
          SET.remind = { on: true, h: t[0], m: t[1] };
          write('jhw_remind', SET.remind);
          if (window.AndroidUI && window.AndroidUI.setReminder) {
            window.AndroidUI.setReminder(t[0], t[1], '今天还没刷题，来做几道电工题吧');
          }
          go('me', {}, true);
        }
      };
    });
    items.unshift({
      t: '关闭提醒', s: SET.remind.on ? '当前已开启' : '当前已关闭',
      fn: function () {
        SET.remind = { on: false, h: SET.remind.h, m: SET.remind.m };
        write('jhw_remind', SET.remind);
        if (window.AndroidUI && window.AndroidUI.cancelReminder) window.AndroidUI.cancelReminder();
        go('me', {}, true);
      }
    });
    showChoices('每日提醒时间', items);
  }

  /* ---------- 备份 / 恢复 ---------- */
  function collectAll() {
    var out = {};
    for (var i = 0; i < storage.length; i++) {
      var k = storage.key(i);
      if (k && k.indexOf('jhw_') === 0) out[k] = storage.getItem(k);
    }
    return out;
  }
  function doBackup() {
    var data = { app: 'lvdg-tiku', ver: 3, at: new Date().toISOString(), data: collectAll(), bankQuestionIds: {} };
    BANKS.forEach(function(b){ data.bankQuestionIds[b.id] = b.q.map(function(q){return q.sourceId;}); });
    var text = JSON.stringify(data, null, 2);
    if (window.AndroidUI && window.AndroidUI.exportBackup) { window.AndroidUI.exportBackup(text); return; }
    var link = document.createElement('a'), url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
    link.href = url; link.download = '电工题库学习进度-' + today() + '.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function(){URL.revokeObjectURL(url);}, 1000);
  }
  function doRestore() {
    if (window.AndroidUI && window.AndroidUI.importBackup) { window.AndroidUI.importBackup(); return; }
    var input = document.createElement('input'); input.type='file'; input.accept='.json,application/json';
    input.onchange=function(){
      var file=input.files[0]; if(!file) return;
      if(file.size > 5*1024*1024){ showDialog('文件过大','请选择小于 5 MB 的学习进度备份。','知道了',function(){});return; }
      var reader=new FileReader(); reader.onload=function(){window.__importBackup(reader.result);};
      reader.onerror=function(){showDialog('读取失败','无法读取所选文件。','知道了',function(){});}; reader.readAsText(file);
    };
    input.click();
  }
  window.__importBackup = function (text) {
    try {
      var obj = window.TikuCore.validateBackup(text, BANKS);
      showDialog('恢复学习进度', '将导入备份中的学习记录，覆盖对应题库在本机的进度。建议先导出当前进度。', '确认恢复', function(){
        var previous = collectAll();
        try {
          Object.keys(obj.data).forEach(function(k){ storage.setItem(k,obj.data[k]); });
          loadState(); SET.theme = storage.getItem('jhw_theme') || 'light'; applyTheme();
          showDialog('恢复成功','已导入学习进度。','好',function(){location.reload();});
        } catch(e) {
          Object.keys(obj.data).forEach(function(k){if(previous[k] == null) storage.removeItem(k); else storage.setItem(k,previous[k]);});
          showDialog('恢复失败','浏览器存储空间不足，已撤回本次导入。','知道了',function(){});
        }
      });
    } catch (e) { showDialog('恢复失败', String(e.message || e), '知道了', function () {}); }
  };
  window.__importCancel = function () {};
  window.__exportDone = function (ok, path) {
    if (ok) showDialog('已导出', '备份文件已保存到：' + path, '好', function () {});
    else showDialog('导出失败', String(path), '知道了', function () {});
  };

  /* ---------- 启动 ---------- */
  Array.prototype.forEach.call(tabbar.children, function (b) {
    b.onclick = function () {
      var t = b.getAttribute('data-tab');
      stack = [];
      if (t === 'home') go('home', {}, true);
      else if (t === 'practice') { startPractice('seq'); }
      else if (t === 'exam') go('exam', {}, true);
      else if (t === 'wrong') go('wrong', {}, true);
      else go('me', {}, true);
    };
  });

  document.addEventListener('backbutton', function () { back(); }, false);

  window.__back = function () {
    var cur = screens.current && screens.current.name;
    if (!cur || cur === 'home') return 'exit';
    if (cur === 'examRun') {
      showDialog('退出考试', '退出后本次考试不保存成绩。', '退出', function () {
        if (E.timer) clearInterval(E.timer);
        go('home', {}, true);
      });
      return 'ok';
    }
    back();
    return 'ok';
  };

  applyTheme();
  go('home', {}, true);
})();
