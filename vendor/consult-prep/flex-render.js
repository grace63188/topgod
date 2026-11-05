/*
 * LINE Flex Message 預覽渲染器（後台發送面板共用；不依賴其他檔案，ES5）
 *
 * 用途：把 CONSULT_FLEX.messages(card, note) 產生的訊息陣列（Flex 卡片＋補充說明文字）轉成近似 LINE 聊天室外觀的 HTML。
 * 輸出：window.FlexRender、window.renderFlexPreview／module.exports（Node 測試只用 toHTML 字串函式）。
 *
 *   renderFlexPreview(container, input, opts) → 控制器 { index, count, go(i), next(), prev(), update(input), destroy() }
 *     input：單一收件人 → LINE 訊息陣列 [flex, text?]
 *            多位收件人 → [{ name, sub?, messages:[…] }, …]（左右切換逐人預覽；鍵盤 ←／→、手機左右滑）
 *     opts：theme 'dark'|'light'（預設 dark）、assetBase（頂圖網址改指本機路徑，例 '../assets/flex/'）、
 *           oaName（官方帳號名稱）、logo（頭像網址）、time（時間標示）、index（起始收件人）、showAlt（顯示通知列預覽，預設 true）、
 *           fit（依容器寬度縮放，預設 true）、nav（false＝不畫切換列，由面板既有的收件人選單控制 go(i)）、onChange(i)（切換收件人時呼叫）
 *   FlexRender.toHTML(input, opts) → 字串（同上，不綁事件）
 *   FlexRender.bubbleHTML(bubble, opts)、FlexRender.messageHTML(message, opts)
 *
 * 支援 flex.js 用到的元件與屬性：bubble（size、hero/body/footer、styles、action）、box（layout horizontal/vertical/baseline、
 *   spacing、margin、padding*、cornerRadius、backgroundColor、background linearGradient、borderWidth/borderColor、width/height、
 *   flex、justifyContent、alignItems、position/offset*）、text（span、size、weight、color、align、gravity、wrap、maxLines、
 *   lineSpacing、style、decoration）、image（size、aspectRatio、aspectMode、backgroundColor）、button（style、color、height）、
 *   separator、filler。
 * action（uri／message／postback）：預覽中可點，但不跳轉、不送出；點擊後在預覽下方顯示目標網址或將送出的文字。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.FlexRender = api; root.renderFlexPreview = api.renderFlexPreview; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var VERSION = '1.0.0';
  /* LINE 規格數值（px） */
  var TEXT = { xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29, '3xl': 35, '4xl': 48, '5xl': 74 };
  var SPACE = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
  var BORDER = { none: 0, light: 0.5, normal: 1, medium: 2, 'semi-bold': 3, bold: 4 };
  var BUBBLE = { nano: 120, micro: 160, deca: 220, hecto: 241, kilo: 260, mega: 300, giga: 386 };
  var IMG = { xxs: 40, xs: 60, sm: 80, md: 100, lg: 120, xl: 140, xxl: 160, '3xl': 180, '4xl': 200, '5xl': 220 };
  var DEF = { oaName: 'G.R.A.C.E Academy', theme: 'dark', showAlt: true, fit: true };
  var PX_RE = /^-?\d+(?:\.\d+)?px$/, PCT_RE = /^-?\d+(?:\.\d+)?%$/, COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function assign(o, x) { if (x) for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k) && x[k] !== undefined) o[k] = x[k]; return o; }
  /** 關鍵字或 px／% → CSS 長度；不合法回 null */
  function len(v, map) {
    if (v == null || v === '') return null;
    var s = String(v);
    if (map && Object.prototype.hasOwnProperty.call(map, s)) return map[s] + 'px';
    return PX_RE.test(s) || PCT_RE.test(s) ? s : null;
  }
  function color(v) { var s = String(v == null ? '' : v); return COLOR_RE.test(s) ? s : null; }
  function styleAttr(st) {
    var out = [];
    for (var k in st) if (st[k] != null && st[k] !== '') out.push(k + ':' + st[k]);
    return out.length ? ' style="' + esc(out.join(';')) + '"' : '';
  }
  /** 圖片網址：assetBase 覆寫官方頂圖位置；只允許 https、相對路徑、data:image */
  function imgUrl(u, o) {
    var s = String(u || '');
    if (o.assetBase && o.flexAssetBase && s.indexOf(o.flexAssetBase) === 0) s = o.assetBase.replace(/\/?$/, '/') + s.slice(o.flexAssetBase.length);
    else if (o.assetBase && /\/assets\/flex\/[\w.-]+$/.test(s)) s = o.assetBase.replace(/\/?$/, '/') + s.replace(/^.*\/assets\/flex\//, '');
    if (/^(https:\/\/|data:image\/|\.{0,2}\/|[\w-]+\/)/.test(s) && !/^javascript:/i.test(s)) return s;
    return '';
  }

  /* ---------- action ---------- */
  function actAttrs(a, ctx) {
    if (!a || typeof a !== 'object') return '';
    var target = a.type === 'uri' ? String(a.uri || '') : a.type === 'message' ? String(a.text || '') : a.type === 'postback' ? String(a.displayText || a.data || '') : '';
    var i = ctx.actions.length; ctx.actions.push(a);
    var tip = a.type === 'uri' ? '開啟：' + target : a.type === 'message' ? '傳送：「' + target + '」' : '回傳：' + target;
    return ' data-fr-act="' + i + '" data-fr-kind="' + esc(a.type) + '" data-fr-target="' + esc(target) + '" data-fr-label="' + esc(a.label || '') + '" role="button" tabindex="0" title="' + esc(tip) + '"';
  }

  /* ---------- 元件 ---------- */
  /** 子元件在父 box 中的通用樣式：flex、margin（第一個子元件不套用）、gravity、position／offset */
  function itemStyle(c, parent, first, st) {
    var horiz = parent === 'horizontal' || parent === 'baseline';
    var f = c.flex != null ? Number(c.flex) : (horiz ? 1 : 0);
    if (c.type === 'separator') f = 0;
    if (c.type === 'filler') f = c.flex != null ? Number(c.flex) : 1;
    if (c.type === 'box' && (horiz ? c.width : c.height) && c.flex == null) f = 0;
    st.flex = f > 0 ? f + ' 1 0' : '0 0 auto';
    if (f > 0 && horiz) st['min-width'] = '0';
    if (c.margin != null && !first) { var m = len(c.margin, SPACE); if (m) st[horiz ? 'margin-left' : 'margin-top'] = m; }
    if (c.gravity && horiz) st['align-self'] = c.gravity === 'center' ? 'center' : c.gravity === 'bottom' ? 'flex-end' : 'flex-start';
    if (c.position === 'absolute') st.position = 'absolute';
    ['Top', 'Bottom', 'Start', 'End'].forEach(function (k) {
      var v = len(c['offset' + k], SPACE); if (v == null) return;
      st[k === 'Start' ? 'left' : k === 'End' ? 'right' : k.toLowerCase()] = v;
      if (!st.position) st.position = 'relative';
    });
    return st;
  }
  function boxHTML(c, parent, first, ctx) {
    var st = {}, layout = c.layout === 'horizontal' || c.layout === 'baseline' ? c.layout : 'vertical';
    st['flex-direction'] = layout === 'vertical' ? 'column' : 'row';
    if (layout === 'baseline') st['align-items'] = 'baseline';
    if (c.alignItems) st['align-items'] = c.alignItems;
    if (c.justifyContent) st['justify-content'] = c.justifyContent;
    var bg = color(c.backgroundColor); if (bg) st['background-color'] = bg;
    var g = c.background;
    if (g && g.type === 'linearGradient' && color(g.startColor) && color(g.endColor)) {
      var ang = /^-?\d+(?:\.\d+)?deg$/.test(String(g.angle)) ? g.angle : '0deg';
      st['background-image'] = 'linear-gradient(' + ang + ',' + g.startColor + (color(g.centerColor) ? ',' + g.centerColor + ' ' + (len(g.centerPosition) || '50%') : '') + ',' + g.endColor + ')';
    }
    var bw = len(c.borderWidth, BORDER);
    if (bw && bw !== '0px') { st.border = bw + ' solid ' + (color(c.borderColor) || '#000000'); }
    var cr = len(c.cornerRadius, SPACE); if (cr) { st['border-radius'] = cr; st.overflow = 'hidden'; }
    ['width', 'maxWidth', 'height', 'maxHeight'].forEach(function (k) { var v = len(c[k]); if (v) st[k.replace(/W|H/, function (x) { return '-' + x.toLowerCase(); })] = v; });
    var pa = len(c.paddingAll, SPACE); if (pa) st.padding = pa;
    ['Top', 'Bottom', 'Start', 'End'].forEach(function (k) { var v = len(c['padding' + k], SPACE); if (v) st['padding-' + (k === 'Start' ? 'left' : k === 'End' ? 'right' : k.toLowerCase())] = v; });
    if (parent) itemStyle(c, parent, first, st);
    var gap = len(c.spacing, SPACE);
    var kids = (Array.isArray(c.contents) ? c.contents : []).map(function (ch, i) {
      var h = comp(ch, layout, i === 0, ctx);
      // spacing：相鄰元件間距；子元件自帶 margin 時以 margin 為準
      if (i > 0 && gap && gap !== '0px' && (ch.margin == null) && ch.type !== 'filler' && ch.position !== 'absolute') h = h.replace(/^<(\w+)( class="[^"]*")?( style=")?/, function (m0, tag, cls, s) { return '<' + tag + (cls || '') + ' style="' + (layout === 'vertical' ? 'margin-top:' : 'margin-left:') + gap + ';' + (s ? '' : '"'); });
      return h;
    }).join('');
    return '<div class="fr-box fr-' + layout + (c.action ? ' fr-act' : '') + '"' + styleAttr(st) + actAttrs(c.action, ctx) + '>' + kids + '</div>';
  }
  function spanHTML(s) {
    var st = {}, col = color(s.color);
    if (col) st.color = col;
    if (s.weight === 'bold') st['font-weight'] = '700';
    var sz = TEXT[s.size] || (PX_RE.test(String(s.size)) ? parseFloat(s.size) : null); if (sz) st['font-size'] = sz + 'px';
    if (s.style === 'italic') st['font-style'] = 'italic';
    if (s.decoration === 'underline' || s.decoration === 'line-through') st['text-decoration'] = s.decoration;
    return '<span' + styleAttr(st) + '>' + esc(s.text) + '</span>';
  }
  function textHTML(c, parent, first, ctx) {
    var st = {}, sz = TEXT[c.size] || (PX_RE.test(String(c.size)) ? parseFloat(c.size) : TEXT.md);
    st['font-size'] = sz + 'px';
    st.color = color(c.color) || '#111111';
    if (c.weight === 'bold') st['font-weight'] = '700';
    if (c.style === 'italic') st['font-style'] = 'italic';
    if (c.decoration === 'underline' || c.decoration === 'line-through') st['text-decoration'] = c.decoration;
    st['text-align'] = c.align === 'end' ? 'right' : c.align === 'center' ? 'center' : 'left';
    if (c.lineSpacing && PX_RE.test(String(c.lineSpacing))) st['line-height'] = 'calc(1.4em + ' + c.lineSpacing + ')';
    var cls = 'fr-text ' + (c.wrap ? 'fr-wrap' : 'fr-nowrap');
    var ml = parseInt(c.maxLines, 10);
    if (c.wrap && ml > 0) { cls += ' fr-clamp'; st['-webkit-line-clamp'] = String(ml); st['line-clamp'] = String(ml); }
    if (parent) itemStyle(c, parent, first, st);
    var inner = Array.isArray(c.contents) && c.contents.length ? c.contents.map(spanHTML).join('') : esc(c.text);
    return '<div class="' + cls + (c.action ? ' fr-act' : '') + '"' + styleAttr(st) + actAttrs(c.action, ctx) + '>' + inner + '</div>';
  }
  function imageHTML(c, parent, first, ctx, o) {
    var st = {}, wrap = {}, src = imgUrl(c.url, o);
    var w = c.size === 'full' ? '100%' : IMG[c.size] ? IMG[c.size] + 'px' : len(c.size) || IMG.md + 'px';
    var m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(c.aspectRatio || '1:1'));
    wrap.width = w; wrap['max-width'] = '100%';
    if (m) wrap['aspect-ratio'] = m[1] + ' / ' + m[2];
    var bg = color(c.backgroundColor); if (bg) wrap['background-color'] = bg;
    wrap['align-self'] = c.align === 'start' ? 'flex-start' : c.align === 'end' ? 'flex-end' : 'center';
    if (parent) itemStyle(c, parent, first, wrap);
    if (c.size === 'full') wrap['align-self'] = 'stretch';
    st['object-fit'] = c.aspectMode === 'cover' ? 'cover' : 'contain';
    return '<div class="fr-img' + (c.action ? ' fr-act' : '') + '"' + styleAttr(wrap) + actAttrs(c.action, ctx) + '>' + (src ? '<img alt="" loading="lazy" src="' + esc(src) + '"' + styleAttr(st) + '>' : '') + '</div>';
  }
  function buttonHTML(c, parent, first, ctx) {
    var st = {}, sty = c.style === 'primary' || c.style === 'secondary' ? c.style : 'link', col = color(c.color);
    st.height = c.height === 'sm' ? '40px' : '52px';
    if (sty === 'primary') { st['background-color'] = col || '#17C950'; st.color = '#FFFFFF'; }
    else if (sty === 'secondary') { st['background-color'] = col || '#DCDFE5'; st.color = '#111111'; }
    else st.color = col || '#42659A';
    if (parent) itemStyle(c, parent, first, st);
    return '<div class="fr-button fr-' + sty + ' fr-act"' + styleAttr(st) + actAttrs(c.action, ctx) + '><span>' + esc((c.action && c.action.label) || '') + '</span></div>';
  }
  function comp(c, parent, first, ctx) {
    if (!c || typeof c !== 'object') return '';
    switch (c.type) {
      case 'box': return boxHTML(c, parent, first, ctx);
      case 'text': return textHTML(c, parent, first, ctx);
      case 'image': return imageHTML(c, parent, first, ctx, ctx.o);
      case 'button': return buttonHTML(c, parent, first, ctx);
      case 'separator': {
        var st = {}, m = len(c.margin, SPACE), horiz = parent === 'horizontal' || parent === 'baseline';
        st['background-color'] = color(c.color) || '#E5E5E5';
        if (horiz) { st.width = '1px'; st['align-self'] = 'stretch'; } else st.height = '1px';
        st.flex = '0 0 auto';
        if (m && !first) st[horiz ? 'margin-left' : 'margin-top'] = m;
        return '<div class="fr-sep"' + styleAttr(st) + '></div>';
      }
      case 'filler': return '<div class="fr-filler"' + styleAttr(itemStyle(c, parent, first, {})) + '></div>';
      case 'spacer': { var sp = {}; sp[parent === 'horizontal' ? 'width' : 'height'] = len(c.size, SPACE) || '8px'; sp.flex = '0 0 auto'; return '<div class="fr-filler"' + styleAttr(sp) + '></div>'; }
      default: return '';
    }
  }

  /* ---------- bubble／訊息 ---------- */
  function newCtx(o) { return { actions: [], o: o }; }
  function bubbleHTML(b, o, ctx) {
    o = assign(assign({}, DEF), o); ctx = ctx || newCtx(o);
    if (!b || b.type !== 'bubble') return '';
    var w = BUBBLE[b.size] || BUBBLE.mega, styles = b.styles || {};
    var blocks = ['header', 'hero', 'body', 'footer'].map(function (k) {
      var c = b[k]; if (!c) return '';
      var bs = styles[k] || {}, st = {}, bg = color(bs.backgroundColor);
      if (bg) st['background-color'] = bg;
      var sepTop = bs.separator && k !== 'header' ? '<div class="fr-sep" style="height:1px;background-color:' + esc(color(bs.separatorColor) || '#E5E5E5') + '"></div>' : '';
      var inner;
      if (k === 'hero' && c.type === 'image') inner = imageHTML(assign(assign({}, c), { size: 'full' }), null, true, ctx, o);
      else inner = comp(c, null, true, ctx);
      return sepTop + '<div class="fr-block fr-' + k + '"' + styleAttr(st) + '>' + inner + '</div>';
    }).join('');
    return '<div class="fr-bubble' + (b.action ? ' fr-act' : '') + '" style="width:' + w + 'px"' + actAttrs(b.action, ctx) + '>' + blocks + '</div>';
  }
  /** 文字訊息泡泡：網址只標示、不產生連結 */
  function textBubbleHTML(t) {
    return '<div class="fr-tb">' + esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<span class="fr-u">$1</span>') + '</div>';
  }
  function messageHTML(m, o, ctx) {
    if (!m || typeof m !== 'object') return '';
    if (m.type === 'flex') return bubbleHTML(m.contents, o, ctx);
    if (m.type === 'text') return textBubbleHTML(m.text);
    if (m.type === 'image') return '<div class="fr-pic"><img alt="" src="' + esc(imgUrl(m.previewImageUrl || m.originalContentUrl, o)) + '"></div>';
    return '';
  }
  function nowText() { var d = new Date(), h = d.getHours(), mm = d.getMinutes(); return (h < 12 ? '上午 ' : '下午 ') + ((h % 12) || 12) + ':' + (mm < 10 ? '0' : '') + mm; }
  /** 單一收件人的聊天室內容 */
  function chatHTML(msgs, o) {
    var ctx = newCtx(o), list = Array.isArray(msgs) ? msgs : msgs ? [msgs] : [];
    var rows = list.map(function (m, i) {
      return '<div class="fr-line">' + messageHTML(m, o, ctx) + (i === list.length - 1 ? '<span class="fr-tm">' + esc(o.time || nowText()) + '</span>' : '') + '</div>';
    }).join('');
    var alt = '', first = list.filter(function (m) { return m && m.type === 'flex'; })[0];
    if (o.showAlt && first && first.altText) alt = '<div class="fr-alt"><b>通知列預覽</b>' + esc(first.altText) + '</div>';
    var av = '<span class="fr-av"' + (o.logo ? ' style="background-image:url(&quot;' + esc(o.logo) + '&quot;)"' : '') + '>' + (o.logo ? '' : 'G') + '</span>';
    return {
      html: '<div class="fr-chat"><span class="fr-day">今天</span>' + (list.length ? '<div class="fr-row">' + av + '<div class="fr-col"><p class="fr-from">' + esc(o.oaName) + '</p>' + rows + '</div></div>' : '<p class="fr-empty">沒有可預覽的訊息</p>') + alt + '</div>',
      actions: ctx.actions
    };
  }
  /** input → 收件人清單 [{ name, sub, messages }] */
  function normalize(input) {
    if (!input) return [];
    if (!Array.isArray(input)) input = [input];
    if (input.length && input[0] && Array.isArray(input[0].messages)) return input.map(function (r) { return { name: r.name || '', sub: r.sub || '', messages: r.messages }; });
    return [{ name: '', sub: '', messages: input }];
  }
  function navHTML(list, i, o) {
    if (o && o.nav === false) return '';
    if (list.length < 2) return list[0] && list[0].name ? '<div class="fr-nav one"><b class="fr-who">' + esc(list[0].name) + '</b>' + (list[0].sub ? '<span class="fr-sub">' + esc(list[0].sub) + '</span>' : '') + '</div>' : '';
    var r = list[i];
    return '<div class="fr-nav"><button type="button" class="fr-arrow" data-fr-nav="-1" aria-label="上一位"' + (i === 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<div class="fr-id"><b class="fr-who">' + esc(r.name || '收件人 ' + (i + 1)) + '</b>' + (r.sub ? '<span class="fr-sub">' + esc(r.sub) + '</span>' : '') + '</div>' +
      '<span class="fr-count" aria-live="polite">' + (i + 1) + '／' + list.length + '</span>' +
      '<button type="button" class="fr-arrow" data-fr-nav="1" aria-label="下一位"' + (i === list.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>';
  }
  function stageHTML(list, i, o) {
    var c = chatHTML(list[i] ? list[i].messages : [], o);
    return { html: navHTML(list, i, o) + '<div class="fr-screen"><div class="fr-bar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><b>' + esc(o.oaName) + '</b></div>' + c.html + '</div><p class="fr-hint" role="status" aria-live="polite" hidden></p>', actions: c.actions };
  }
  function opts(o) {
    o = assign(assign({}, DEF), o || {});
    o.theme = o.theme === 'light' ? 'light' : 'dark';
    var F = typeof CONSULT_FLEX !== 'undefined' ? CONSULT_FLEX : (typeof window !== 'undefined' && window.CONSULT_FLEX);
    if (!o.flexAssetBase && F && F.CONFIG) o.flexAssetBase = F.CONFIG.assetBase;
    return o;
  }
  /** 字串版（Node 測試、伺服器端）：回傳完整預覽 HTML */
  function toHTML(input, o) {
    o = opts(o);
    var list = normalize(input), i = Math.max(0, Math.min(list.length - 1, o.index | 0));
    return '<div class="fr" data-theme="' + o.theme + '">' + stageHTML(list, i, o).html + '</div>';
  }
  function hintText(el) {
    var k = el.getAttribute('data-fr-kind'), t = el.getAttribute('data-fr-target') || '', l = el.getAttribute('data-fr-label');
    var who = l ? '「' + l + '」' : '卡片';
    if (k === 'uri') return who + '將開啟 ' + t + '（預覽不跳轉）';
    if (k === 'message') return who + '會由學姊端送出文字「' + t + '」（預覽不送出）';
    return who + '動作：' + t + '（預覽不執行）';
  }

  /**
   * 掛載預覽：container 內容整個取代；回傳控制器
   */
  function renderFlexPreview(container, input, o) {
    if (!container) return null;
    o = opts(o);
    var list = normalize(input), state = { i: Math.max(0, Math.min(list.length - 1, o.index | 0)), alive: true, x0: null };
    var rootEl = container.ownerDocument.createElement('div');
    rootEl.className = 'fr'; rootEl.setAttribute('data-theme', o.theme); rootEl.tabIndex = -1;
    container.innerHTML = ''; container.appendChild(rootEl);
    function fit() {
      if (!o.fit) return;
      var scr = rootEl.querySelector('.fr-screen'); if (!scr) return;
      scr.style.zoom = '';
      var avail = rootEl.clientWidth, need = scr.scrollWidth;
      if (avail && need > avail) scr.style.zoom = String(Math.max(0.6, Math.floor(avail / need * 100) / 100));
    }
    function paint() {
      var s = stageHTML(list, state.i, o);
      rootEl.innerHTML = s.html; fit();
    }
    function go(i) {
      if (!list.length) return;
      var n = Math.max(0, Math.min(list.length - 1, i));
      if (n === state.i) return;
      state.i = n; paint();
      if (typeof o.onChange === 'function') o.onChange(n);
    }
    function hint(el) {
      var h = rootEl.querySelector('.fr-hint'); if (!h) return;
      h.textContent = hintText(el); h.hidden = false;
      Array.prototype.forEach.call(rootEl.querySelectorAll('.fr-on'), function (x) { x.classList.remove('fr-on'); });
      el.classList.add('fr-on');
    }
    function onClick(ev) {
      var nav = ev.target.closest && ev.target.closest('[data-fr-nav]');
      if (nav && rootEl.contains(nav)) { ev.preventDefault(); go(state.i + Number(nav.getAttribute('data-fr-nav'))); var b = rootEl.querySelector('[data-fr-nav="' + nav.getAttribute('data-fr-nav') + '"]'); if (b && !b.disabled) b.focus(); return; }
      var a = ev.target.closest && ev.target.closest('[data-fr-act]');
      if (a && rootEl.contains(a)) { ev.preventDefault(); ev.stopPropagation(); hint(a); }
    }
    function onKey(ev) {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { if (ev.target.closest && ev.target.closest('input,textarea,select')) return; go(state.i + (ev.key === 'ArrowLeft' ? -1 : 1)); return; }
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest) { var a = ev.target.closest('[data-fr-act]'); if (a) { ev.preventDefault(); hint(a); } }
    }
    function onTs(ev) { state.x0 = ev.touches && ev.touches[0] ? ev.touches[0].clientX : null; }
    function onTe(ev) {
      if (state.x0 == null || !ev.changedTouches || !ev.changedTouches[0]) return;
      var dx = ev.changedTouches[0].clientX - state.x0; state.x0 = null;
      if (Math.abs(dx) > 48) go(state.i + (dx < 0 ? 1 : -1));
    }
    var win = container.ownerDocument.defaultView;
    rootEl.addEventListener('click', onClick); rootEl.addEventListener('keydown', onKey);
    rootEl.addEventListener('touchstart', onTs, { passive: true }); rootEl.addEventListener('touchend', onTe);
    if (win) win.addEventListener('resize', fit);
    paint();
    return {
      el: rootEl,
      get index() { return state.i; },
      get count() { return list.length; },
      go: go, next: function () { go(state.i + 1); }, prev: function () { go(state.i - 1); },
      update: function (next, keepIndex) { list = normalize(next); state.i = keepIndex === false ? 0 : Math.max(0, Math.min(list.length - 1, state.i)); paint(); },
      setTheme: function (t) { o.theme = t === 'light' ? 'light' : 'dark'; rootEl.setAttribute('data-theme', o.theme); },
      destroy: function () { state.alive = false; rootEl.removeEventListener('click', onClick); rootEl.removeEventListener('keydown', onKey); rootEl.removeEventListener('touchstart', onTs); rootEl.removeEventListener('touchend', onTe); if (win) win.removeEventListener('resize', fit); if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl); }
    };
  }

  return { VERSION: VERSION, renderFlexPreview: renderFlexPreview, toHTML: toHTML, bubbleHTML: function (b, o) { return bubbleHTML(b, opts(o)); }, messageHTML: function (m, o) { return messageHTML(m, opts(o), newCtx(opts(o))); }, normalize: normalize, hintText: hintText, SIZES: { TEXT: TEXT, SPACE: SPACE, BORDER: BORDER, BUBBLE: BUBBLE, IMG: IMG } };
});
