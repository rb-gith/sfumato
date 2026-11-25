'use strict';

/* =========================================================
   Sfumato — colour wheel, palettes, colours from a photo (PWA)
   Palettes and settings live in this device's localStorage.
   Photos are only read in memory and never saved.
   Nothing is sent anywhere.
   ========================================================= */

const PAL_KEY = 'sfumato-palettes';
const SET_KEY = 'sfumato-settings';
const COFFEE_URL = 'https://buymeacoffee.com/gionzana';
const MORE_APPS_URL = 'https://rb-gith.github.io/';
const MAX_COLOURS = 8;

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const mod360 = a => ((a % 360) + 360) % 360;
const isHex = c => typeof c === 'string' && /^#[0-9A-F]{6}$/.test(c);
const pad = n => String(n).padStart(2, '0');
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/* ---------- Colour maths ---------- */
/* Painter's wheel (red, yellow, blue): wheel angle ↔ screen hue, so opposite red is green.
   One anchor for each of Itten's 12 colours, every 30°: red, red-orange, orange, yellow-orange, yellow,
   yellow-green, green, blue-green, blue, blue-violet, violet, red-violet. */
const RYB = [[0, 0], [30, 15], [60, 30], [90, 45], [120, 60], [150, 90], [180, 120], [210, 190], [240, 222], [270, 255], [300, 280], [330, 320], [360, 360]];
function lerpTable(x, from, to) {
  x = mod360(x);
  for (let i = 1; i < RYB.length; i++) {
    const a = RYB[i - 1], b = RYB[i];
    if (x <= b[from]) return a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  }
  return x;
}
const angleToHue = a => settings.mode === 'painter' ? mod360(lerpTable(a, 0, 1)) : mod360(a);
const hueToAngle = h => settings.mode === 'painter' ? mod360(lerpTable(h, 1, 0)) : mod360(h);

function hsvToRgb(h, s, v) {
  h = mod360(h) / 60;
  const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [mod360(h * 60), max ? d / max : 0, max];
}
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
/* Text on a colour: dark on light colours, white on dark ones */
const inkOn = hex => { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1E1E1E' : '#FFFFFF'; };

/* ---------- Settings ---------- */
/* Ways of matching colours: the main colour is always at 0°, the others at these offsets */
const HARMONIES = [
  { key: 'opposite', offs: [0, 180] },
  { key: 'neighbours', offs: [0, -30, 30] },
  { key: 'wideNeighbours', offs: [0, -30, 30, -60, 60] },
  { key: 'triad', offs: [0, 120, 240] },
  { key: 'split', offs: [0, 150, 210] },
  { key: 'narrowTriangle', offs: [0, 165, 195] },
  { key: 'square', offs: [0, 90, 180, 270] },
  { key: 'rectangle', offs: [0, 60, 180, 240] },
  { key: 'doubleSplit', offs: [0, -30, 30, 150, 210] },
  { key: 'hexagon', offs: [0, 60, 120, 180, 240, 300] },
  { key: 'lightDark', offs: [0] },
];
/* Version 1 saved the harmony as a number in its shorter list */
const OLD_HARMONIES = ['opposite', 'neighbours', 'triad', 'split', 'square', 'rectangle', 'lightDark'];
const harmonyIndex = key => Math.max(0, HARMONIES.findIndex(h => h.key === key));
function cleanSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  const num = (v, a, b, d) => (typeof v === 'number' && v >= a && v <= b ? v : d);
  const key = typeof s.harmonyKey === 'string' && HARMONIES.some(h => h.key === s.harmonyKey) ? s.harmonyKey
    : Number.isInteger(s.harmony) && OLD_HARMONIES[s.harmony] ? OLD_HARMONIES[s.harmony] : 'opposite';
  return {
    lang: s.lang === 'en' || s.lang === 'it' ? s.lang : null,
    mode: s.mode === 'screen' ? 'screen' : 'painter',
    harmonyKey: key,
    ldRow: Number.isInteger(s.ldRow) && s.ldRow >= 0 && s.ldRow <= 2 ? s.ldRow : 0,
    a: num(s.a, 0, 360, 0),
    s: num(s.s, 0, 1, 0.8),
    v: num(s.v, 0.05, 1, 0.9),
    lastBackup: typeof s.lastBackup === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.lastBackup) ? s.lastBackup : null,
  };
}
let settings = cleanSettings(null);
try { settings = cleanSettings(JSON.parse(localStorage.getItem(SET_KEY))); } catch (e) { /* defaults */ }
let saveTimer;
function saveSettings(now) {
  clearTimeout(saveTimer);
  const write = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* storage blocked */ } };
  if (now) write(); else saveTimer = setTimeout(write, 300);
}
const phoneLang = navigator.language || '';
let lang = settings.lang || (/^it\b/i.test(phoneLang) ? 'it' : 'en');
const tr = (key, ...args) => args.reduce((s, a) => s.replace('{}', () => a), TEXT[lang][key]);
const locale = () => (phoneLang.toLowerCase().startsWith(lang) ? phoneLang : lang === 'it' ? 'it-IT' : 'en-GB');
document.documentElement.lang = lang;

/* ---------- Palettes ---------- */
function cleanPalette(p) {
  if (!p || typeof p !== 'object') return null;
  const colors = (Array.isArray(p.colors) ? p.colors : []).map(c => String(c).toUpperCase()).filter(isHex).slice(0, MAX_COLOURS);
  if (!colors.length) return null;
  return {
    id: String(p.id || uid()).slice(0, 40),
    name: (typeof p.name === 'string' ? p.name.trim().replace(/\s+/g, ' ').slice(0, 60) : '') || 'Palette',
    colors,
    source: p.source === 'photo' ? 'photo' : 'wheel',
    created: Number(p.created) || Date.now(),
  };
}
const cleanPalettes = list => {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map(cleanPalette).filter(p => p && !seen.has(p.id) && seen.add(p.id));
};
let palettes = [];
try { palettes = cleanPalettes(JSON.parse(localStorage.getItem(PAL_KEY))); } catch (e) { /* start empty */ }
let askedPersist = false;
function savePalettes() {
  try { localStorage.setItem(PAL_KEY, JSON.stringify(palettes)); }
  catch (e) { toast(tr('saveFailed')); return false; }
  if (!askedPersist && navigator.storage && navigator.storage.persist) { askedPersist = true; navigator.storage.persist().catch(() => {}); }
  return true;
}
const paletteById = id => palettes.find(p => p.id === id);

/* ---------- The wheel's current colours ---------- */
const harmony = () => HARMONIES[harmonyIndex(settings.harmonyKey)];
/* Light and dark: the main colour mixed with white (tints), grey (tones) or black (shades), from pale to pure */
const LD_MIX = [[255, 255, 255], [128, 128, 128], [0, 0, 0]];
const LD_STEPS = [0.15, 0.32, 0.49, 0.66, 0.83, 1];
function lightDarkRow(row) {
  const base = hsvToRgb(angleToHue(settings.a), settings.s, settings.v);
  const from = LD_MIX[row];
  return LD_STEPS.map(t => rgbToHex(from.map((x, i) => Math.round(x + (base[i] - x) * t))));
}
function wheelColours() {
  const { a, s, v } = settings;
  if (harmony().key === 'lightDark') return lightDarkRow(settings.ldRow);
  return harmony().offs.map(o => rgbToHex(hsvToRgb(angleToHue(a + o), s, v)));
}

/* ---------- Navigation: each page is a history entry, so the phone's back button works ---------- */
const ui = { photo: null, wheelSize: 300, nextName: '' };
history.scrollRestoration = 'manual';
const depth = () => (history.state && history.state.d) || 0;
function go(hash) { history.pushState({ d: depth() + 1 }, '', '#' + hash); render(); }
function back() {
  if (depth() > 0) { history.back(); return; }
  history.replaceState({ d: 0 }, '', location.pathname + location.search);
  render();
}
function switchTab(tab) {
  history.replaceState({ d: depth() }, '', tab === 'wheel' ? location.pathname + location.search : '#' + tab);
  render();
}
addEventListener('popstate', render);
function currentRoute() {
  const [name, arg] = location.hash.slice(1).split('/');
  return { name: name || 'wheel', arg: arg ? decodeURIComponent(arg) : null };
}

/* ---------- Rendering ---------- */
const app = $('#app');
const sheet = $('#sheet');
let lastKey = null;
function render() {
  const key = location.hash;
  const same = key === lastKey;
  const y = scrollY;
  if (!same && sheet.open) sheet.close();
  const { name, arg } = currentRoute();
  let tab = null;
  if (name === 'wheel') { app.innerHTML = wheelHtml(); tab = 'wheel'; }
  else if (name === 'photo') { app.innerHTML = photoHtml(); tab = 'photo'; }
  else if (name === 'palettes') { app.innerHTML = palettesHtml(); tab = 'palettes'; }
  else if (name === 'learn') { app.innerHTML = learnHtml(); tab = 'learn'; }
  else if (name === 'palette' && paletteById(arg)) app.innerHTML = paletteHtml(paletteById(arg));
  else if (name === 'menu') app.innerHTML = menuHtml();
  else { back(); return; }
  lastKey = key;
  $('#tabs').hidden = !tab;
  ['wheel', 'photo', 'palettes', 'learn'].forEach(t => {
    const b = $('#tab-' + t);
    b.textContent = tr('tab' + t[0].toUpperCase() + t.slice(1));
    b.setAttribute('aria-current', tab === t ? 'page' : 'false');
  });
  scrollTo(0, same ? y : 0);
  if (name === 'wheel') setupWheel();
  if (name === 'photo' && ui.photo) setupPhoto();
}

const menuIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const creditHtml = () => `<footer class="credit">
  <p>${tr('madeBy')} · <a href="${COFFEE_URL}" target="_blank" rel="noopener">${tr('coffee')}</a></p>
  <p>${tr('moreApps', `<a href="${MORE_APPS_URL}" target="_blank" rel="noopener">${tr('moreAppsLink')}</a>`)}</p>
</footer>`;
const topbar = title => `<header class="topbar"><h1>${esc(title)}</h1>
  <button class="icon-btn" data-act="menu" aria-label="${tr('menu')}">${menuIcon}</button></header>`;

/* Small picture of a harmony: a dotted ring with the dots where the matching colours sit.
   Light and dark gets a circle that is half white, half dark instead. */
function harmonyIcon(offs, isLightDark) {
  if (isLightDark) return '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="10" class="ring"/><circle cx="14" cy="14" r="6.5" class="line"/><path d="M14 7.5a6.5 6.5 0 0 1 0 13z" class="pt"/></svg>';
  const pts = offs.map(d => { const r = (d - 90) * Math.PI / 180; return [14 + 10 * Math.cos(r), 14 + 10 * Math.sin(r)]; });
  let s = '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="10" class="ring"/>';
  pts.forEach(p => { s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.4" class="pt"/>`; });
  return s + '</svg>';
}

/* ---------- Wheel ---------- */
function wheelHtml() {
  const h = harmony();
  ui.wheelSize = Math.round(Math.min(320, Math.max(220, innerWidth - 64)));
  return `<div class="view with-tabs">
    ${topbar(tr('appName'))}
    <div class="seg mode" role="group" aria-label="${tr('wheelType')}">
      <button data-act="mode" data-mode="painter" aria-pressed="${settings.mode === 'painter'}">${tr('painter')}</button>
      <button data-act="mode" data-mode="screen" aria-pressed="${settings.mode === 'screen'}">${tr('screen')}</button>
    </div>
    <p class="mode-note">${tr(settings.mode === 'painter' ? 'painterNote' : 'screenNote')}</p>
    <div class="harmonies" id="harmonies" role="group" aria-label="${tr('harmony')}">
      ${HARMONIES.map(x => `<button data-act="harmony" data-key="${x.key}" aria-label="${tr(x.key)}" aria-pressed="${x.key === h.key}">${harmonyIcon(x.offs, x.key === 'lightDark')}</button>`).join('')}
    </div>
    <p class="harmony-name">${tr(h.key)}</p>
    <div class="wheel" id="wheel" style="width:${ui.wheelSize}px;height:${ui.wheelSize}px" role="slider" aria-label="${tr('wheelLabel')}" tabindex="0">
      <canvas id="wheel-canvas" width="${ui.wheelSize}" height="${ui.wheelSize}"></canvas>
      <svg id="wheel-dots" viewBox="0 0 ${ui.wheelSize} ${ui.wheelSize}" aria-hidden="true"></svg>
    </div>
    <label class="bright">
      <span class="sr-only">${tr('brightness')}</span>
      <span class="bright-end">${tr('dark')}</span>
      <input type="range" id="bright" min="5" max="100" step="1" value="${Math.round(settings.v * 100)}">
      <span class="bright-end">${tr('bright')}</span>
    </label>
    ${h.key === 'lightDark' ? '<div class="ld" id="ld"></div>' : ''}
    <div class="swatches" id="swatches"></div>
    <p class="hint">${tr('tapToCopy')}</p>
    <button class="btn primary wide" data-act="save-wheel">${tr('savePalette')}</button>
    <button class="fact" id="fact" data-act="next-fact">${factInner()}</button>
  </div>`;
}

/* ---------- "Did you know?" colour facts ---------- */
/* Facts start at a random place; a fact linked to the chosen button or wheel shows when you pick it */
ui.fact = Math.floor(Math.random() * FACTS.length);
function factInner() {
  const f = FACTS[ui.fact];
  return `<span class="fact-label">${tr('didYouKnow')}</span>
    <span class="fact-text">${esc(f[lang])}</span>
    <span class="fact-src">${tr('source')}: ${esc(f.src)}</span>
    <span class="fact-more">${tr('anotherFact')} ›</span>`;
}
function showFactFor(tag) {
  const linked = FACTS.map((f, i) => (f.tag === tag ? i : -1)).filter(i => i >= 0);
  if (!linked.length) return;
  /* With two facts for the same button, they take turns */
  const pos = linked.indexOf(ui.fact);
  ui.fact = linked[(pos + 1) % linked.length];
}
function nextFact() {
  ui.fact = (ui.fact + 1) % FACTS.length;
  const card = $('#fact');
  if (card) card.innerHTML = factInner();
}

let wheelCache = { key: '', data: null };
function drawWheel() {
  const cv = $('#wheel-canvas');
  if (!cv) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const size = ui.wheelSize, px = Math.round(size * dpr);
  if (cv.width !== px) { cv.width = px; cv.height = px; }
  const key = `${settings.mode}|${px}|${Math.round(settings.v * 100)}`;
  const ctx = cv.getContext('2d');
  if (wheelCache.key === key) { ctx.putImageData(wheelCache.data, 0, 0); return; }
  const img = ctx.createImageData(px, px), d = img.data, c = px / 2, R = c - 1;
  /* The hue at each wheel angle, computed once per degree step */
  const hues = new Float32Array(721);
  for (let i = 0; i <= 720; i++) hues[i] = angleToHue(i / 2);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, dist = Math.hypot(dx, dy);
      if (dist > R + 1) continue;
      const ang = mod360(Math.atan2(dy, dx) * 180 / Math.PI + 90);
      const [r, g, b] = hsvToRgb(hues[Math.round(ang * 2)], Math.min(1, dist / R), settings.v);
      const i = (y * px + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(255 * clamp(R + 1 - dist, 0, 1));
    }
  }
  ctx.putImageData(img, 0, 0);
  wheelCache = { key, data: img };
}
function paintSelection() {
  const svg = $('#wheel-dots');
  if (!svg) return;
  const size = ui.wheelSize, c = size / 2, R = c - 1;
  const h = harmony();
  const cols = wheelColours();
  const pos = off => { const r = (settings.a + off - 90) * Math.PI / 180; return [c + R * settings.s * Math.cos(r), c + R * settings.s * Math.sin(r)]; };
  let out = '';
  const isLD = h.key === 'lightDark';
  /* Matching dots first, then the main dot on top */
  if (!isLD) h.offs.slice(1).forEach((o, i) => {
    const [x, y] = pos(o);
    out += `<circle cx="${x}" cy="${y}" r="10.5" class="dot-ring"/><circle cx="${x}" cy="${y}" r="9" fill="${cols[i + 1]}" class="dot"/>`;
  });
  const [mx, my] = pos(0);
  const mainCol = rgbToHex(hsvToRgb(angleToHue(settings.a), settings.s, settings.v));
  if (isLD) paintLightDark();
  out += `<circle cx="${mx}" cy="${my}" r="15.5" class="dot-ring"/><circle cx="${mx}" cy="${my}" r="14" fill="${mainCol}" class="dot"/>`;
  svg.innerHTML = out;
  $('#swatches').innerHTML = cols.map(hex => `<button class="swatch" data-act="copy" data-hex="${hex}">
      <span class="chip" style="background:${hex}"></span><span class="code">${hex}</span></button>`).join('');
  const range = $('#bright');
  if (range) range.style.setProperty('--track', `linear-gradient(90deg, #000, ${rgbToHex(hsvToRgb(angleToHue(settings.a), settings.s, 1))})`);
  $('#wheel').setAttribute('aria-valuetext', cols.join(', '));
}
/* Light and dark: a grey column from white to black, and three rows from the grey to the chosen colour */
function paintLightDark() {
  const box = $('#ld');
  if (!box) return;
  const greys = Array.from({ length: 12 }, (_, i) => { const g = Math.round(255 * (1 - i / 11)); return `<i style="background:rgb(${g},${g},${g})"></i>`; }).join('');
  const rows = [['tints', 'plusWhite'], ['tones', 'plusGrey'], ['shades', 'plusBlack']].map(([name, hint], r) => `
    <button class="ld-row" data-act="ld-row" data-row="${r}" aria-pressed="${settings.ldRow === r}">
      <span class="ld-cells">${lightDarkRow(r).map(c => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="ld-name"><b>${tr(name)}</b>${tr(hint)}</span>
    </button>`).join('');
  box.innerHTML = `<div class="ld-greys" aria-hidden="true">${greys}</div><div class="ld-rows">${rows}</div>`;
}
function setupWheel() {
  /* Keep the chosen picture button in view in the sideways row */
  const on = $('#harmonies [aria-pressed="true"]');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  drawWheel();
  paintSelection();
  const wheel = $('#wheel');
  let dragging = false;
  const move = ev => {
    const r = wheel.getBoundingClientRect();
    const dx = ev.clientX - r.left - r.width / 2, dy = ev.clientY - r.top - r.height / 2;
    settings.a = mod360(Math.atan2(dy, dx) * 180 / Math.PI + 90);
    settings.s = clamp(Math.hypot(dx, dy) / (r.width / 2 - 1), 0, 1);
    paintSelection();
    saveSettings();
  };
  wheel.addEventListener('pointerdown', ev => { dragging = true; wheel.setPointerCapture(ev.pointerId); move(ev); });
  wheel.addEventListener('pointermove', ev => { if (dragging) move(ev); });
  const stop = () => { dragging = false; };
  wheel.addEventListener('pointerup', stop);
  wheel.addEventListener('pointercancel', stop);
  /* Arrow keys turn the wheel, for keyboards and screen readers */
  wheel.addEventListener('keydown', ev => {
    const step = { ArrowRight: [5, 0], ArrowLeft: [-5, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[ev.key];
    if (!step) return;
    ev.preventDefault();
    settings.a = mod360(settings.a + step[0]);
    settings.s = clamp(settings.s + step[1], 0, 1);
    paintSelection();
    saveSettings();
  });
  let raf = 0;
  $('#bright').addEventListener('input', ev => {
    settings.v = clamp(Number(ev.target.value) / 100, 0.05, 1);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { drawWheel(); paintSelection(); });
    saveSettings();
  });
}

/* ---------- Saving a palette (bottom panel with Save on top) ---------- */
function openSaveSheet(colors, source) {
  const n = palettes.length + 1;
  const name = source === 'photo' ? tr('photoName', n) : tr('defaultName', n);
  sheet.innerHTML = `<form id="save-form" method="dialog" novalidate>
    <div class="sheet-bar">
      <button type="button" class="bar-btn" data-act="sheet-close">${tr('cancel')}</button>
      <h3>${tr('savePalette')}</h3>
      <button class="save-btn">${tr('save')}</button>
    </div>
    <div class="strip big">${colors.map(c => `<i style="background:${c}"></i>`).join('')}</div>
    <label class="field"><span>${tr('name')}</span>
      <input type="text" name="name" value="${esc(name)}" maxlength="60" autocomplete="off" enterkeyhint="done"></label>
    <p class="error" id="name-error" hidden>${tr('nameError')}</p>
  </form>`;
  ui.pending = { colors, source };
  sheet.showModal();
  const input = sheet.querySelector('input');
  input.focus();
  input.select();
}
function submitSave(form) {
  const name = form.elements.name.value.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) { $('#name-error').hidden = false; form.elements.name.focus(); return; }
  const p = cleanPalette({ id: uid(), name, colors: ui.pending.colors, source: ui.pending.source, created: Date.now() });
  palettes.unshift(p);
  if (!savePalettes()) { palettes.shift(); return; }
  sheet.close();
  toast(tr('saved', name));
}
function openRenameSheet(p) {
  sheet.innerHTML = `<form id="rename-form" method="dialog" novalidate data-id="${esc(p.id)}">
    <div class="sheet-bar">
      <button type="button" class="bar-btn" data-act="sheet-close">${tr('cancel')}</button>
      <h3>${tr('rename')}</h3>
      <button class="save-btn">${tr('save')}</button>
    </div>
    <label class="field"><span>${tr('name')}</span>
      <input type="text" name="name" value="${esc(p.name)}" maxlength="60" autocomplete="off" enterkeyhint="done"></label>
    <p class="error" id="name-error" hidden>${tr('nameError')}</p>
    <div class="btns"><button type="button" class="btn danger" data-act="delete-palette">${tr('delete')}</button></div>
  </form>`;
  sheet.showModal();
}
function submitRename(form) {
  const p = paletteById(form.dataset.id);
  if (!p) return;
  const name = form.elements.name.value.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) { $('#name-error').hidden = false; return; }
  const before = p.name;
  p.name = name;
  if (!savePalettes()) { p.name = before; return; }
  sheet.close();
  render();
}
function deletePalette(p) {
  if (!confirm(tr('confirmDelete', p.name))) return;
  const i = palettes.indexOf(p);
  palettes.splice(i, 1);
  if (!savePalettes()) { palettes.splice(i, 0, p); return; }
  sheet.close();
  toast(tr('deleted'));
  back();
}

/* ---------- Palettes list and one palette ---------- */
const stripHtml = (colors, cls = '') => `<div class="strip ${cls}">${colors.map(c => `<i style="background:${c}"></i>`).join('')}</div>`;
function palettesHtml() {
  return `<div class="view with-tabs">
    ${topbar(tr('tabPalettes'))}
    ${palettes.length ? `<div class="plist">${palettes.map(p => `<button class="pcard" data-act="open-palette" data-id="${esc(p.id)}">
        <span class="pname"><span>${esc(p.name)}</span><small>${tr('colours', p.colors.length)}</small></span>
        ${stripHtml(p.colors)}
      </button>`).join('')}</div>` : `<p class="empty">${tr('noPalettes')}</p>`}
    ${creditHtml()}
  </div>`;
}
function paletteHtml(p) {
  return `<div class="view">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="${tr('back')}">‹</button>
      <h2>${esc(p.name)}</h2>
      <button class="link-btn" data-act="rename" data-id="${esc(p.id)}">${tr('edit')}</button>
    </header>
    <div class="big-swatches">${p.colors.map(c => `<button class="big-swatch" data-act="copy" data-hex="${c}" style="background:${c};color:${inkOn(c)}">${c}</button>`).join('')}</div>
    <p class="hint">${tr('tapToCopy')}</p>
    <div class="btns">
      <button class="btn primary grow" data-act="share" data-id="${esc(p.id)}">${tr('share')}</button>
      <button class="btn grow" data-act="copy-codes" data-id="${esc(p.id)}">${tr('copyCodes')}</button>
    </div>
    <button class="btn wide" data-act="open-wheel" data-id="${esc(p.id)}">${tr('openOnWheel')}</button>
  </div>`;
}
/* "Open on the wheel": the palette's first colour becomes the main colour */
function openOnWheel(p) {
  const [h, s, v] = rgbToHsv(...hexToRgb(p.colors[0]));
  settings.a = hueToAngle(h);
  settings.s = s;
  settings.v = clamp(v, 0.05, 1);
  saveSettings(true);
  history.replaceState({ d: 0 }, '', location.pathname + location.search);
  render();
}

/* A picture of the palette: one band per colour with its code */
function paletteImage(p) {
  const W = 1080, head = 150, band = Math.round(Math.max(150, Math.min(260, 1100 / p.colors.length))), foot = 90;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = head + band * p.colors.length + foot;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#F4F4F4'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#1E1E1E'; ctx.font = '600 56px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText(p.name, 60, head / 2 + 6, W - 120);
  p.colors.forEach((c, i) => {
    const y = head + i * band;
    ctx.fillStyle = c; ctx.fillRect(0, y, W, band);
    ctx.fillStyle = inkOn(c); ctx.font = '500 48px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(c, 60, y + band / 2);
  });
  ctx.fillStyle = '#6B6B6B'; ctx.font = '400 34px system-ui, sans-serif';
  ctx.fillText(tr('madeWith'), 60, cv.height - foot / 2);
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
async function sharePalette(p) {
  const blob = await paletteImage(p);
  if (!blob) { toast(tr('copyFailed')); return; }
  const fileName = (p.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'palette') + '.png';
  const file = new File([blob], fileName, { type: 'image/png' });
  const text = `${p.name}\n${p.colors.join(' ')}`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: p.name, text }); } catch (e) { /* closed by the user */ }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast(tr('imageSaved'));
}
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); return; } catch (e) { /* try the old way */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  toast(ok ? msg : tr('copyFailed'));
}

/* ---------- Colours from a photo ---------- */
function photoHtml() {
  const ph = ui.photo;
  if (!ph) {
    return `<div class="view with-tabs">
      ${topbar(tr('photoTitle'))}
      <button class="pick-photo" data-act="pick-photo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/></svg>
        <span>${ui.reading ? tr('reading') : tr('choosePhoto')}</span>
      </button>
      <p class="hint center">${tr('photoNote')}</p>
    </div>`;
  }
  return `<div class="view with-tabs">
    ${topbar(tr('photoTitle'))}
    <div class="photo" id="photo" style="aspect-ratio:${ph.w} / ${ph.h}">
      <canvas id="photo-canvas" width="${ph.w}" height="${ph.h}"></canvas>
      <div id="pins"></div>
    </div>
    <p class="hint">${tr('photoHint')}</p>
    <div class="count">
      <button class="round-btn" data-act="fewer" aria-label="${tr('fewer')}" ${ph.pins.length <= 2 ? 'disabled' : ''}>−</button>
      <div class="strip" id="photo-strip"></div>
      <button class="round-btn" data-act="more" aria-label="${tr('moreColours')}" ${ph.pins.length >= MAX_COLOURS ? 'disabled' : ''}>+</button>
    </div>
    <div id="photo-codes" class="codes"></div>
    <div class="btns">
      <button class="btn grow" data-act="pick-photo">${tr('anotherPhoto')}</button>
      <button class="btn primary grow" data-act="save-photo">${tr('savePalette')}</button>
    </div>
  </div>`;
}
/* The photo is shrunk to at most 900 px and kept only in memory */
function loadPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  ui.reading = true;
  if (currentRoute().name === 'photo') render();
  img.onload = () => {
    const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    ui.photo = { canvas: cv, data: ctx.getImageData(0, 0, w, h).data, w, h, pins: [] };
    ui.reading = false;
    findColours(5);
    if (currentRoute().name !== 'photo') switchTab('photo'); else render();
  };
  img.onerror = () => { URL.revokeObjectURL(url); ui.reading = false; render(); toast(tr('photoFailed')); };
  img.src = url;
}
/* The average colour of a small square around a point of the photo */
function colourAt(x, y) {
  const { data, w, h } = ui.photo;
  const cx = Math.round(x * (w - 1)), cy = Math.round(y * (h - 1));
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const px = clamp(cx + dx, 0, w - 1), py = clamp(cy + dy, 0, h - 1), i = (py * w + px) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  return rgbToHex([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
}
/* The photo's main colours: group similar pixels (k-means), then pin the pixel closest to each group */
function findColours(k) {
  const { data, w, h } = ui.photo;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4000)));
  const pts = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4;
    pts.push([data[i], data[i + 1], data[i + 2], x, y]);
  }
  const dist = (p, c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
  /* Start from well-spread colours: each new start is the pixel farthest from the ones chosen so far */
  const cents = [pts[Math.floor(pts.length / 2)].slice(0, 3)];
  while (cents.length < k) {
    let best = null, bestD = -1;
    for (const p of pts) { const d = Math.min(...cents.map(c => dist(p, c))); if (d > bestD) { bestD = d; best = p; } }
    cents.push(best.slice(0, 3));
  }
  const assign = new Int32Array(pts.length);
  for (let it = 0; it < 12; it++) {
    const sums = cents.map(() => [0, 0, 0, 0]);
    pts.forEach((p, i) => {
      let bi = 0, bd = Infinity;
      cents.forEach((c, j) => { const d = dist(p, c); if (d < bd) { bd = d; bi = j; } });
      assign[i] = bi;
      const s = sums[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    sums.forEach((s, j) => { if (s[3]) cents[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  const sizes = cents.map((_, j) => assign.reduce((n, a) => n + (a === j), 0));
  /* Each pin goes on a pixel close to its group's colour, preferring the middle of where that colour sits,
     and never right on the photo's edge */
  const pins = cents.map((c, j) => {
    let mx = 0, my = 0, n = 0;
    pts.forEach((p, i) => { if (assign[i] === j) { mx += p[3]; my += p[4]; n++; } });
    if (!n) return null;
    mx /= n; my /= n;
    const mx0 = w * 0.05, my0 = h * 0.05;
    let best = null, bs = Infinity;
    pts.forEach((p, i) => {
      if (assign[i] !== j) return;
      const edge = p[3] < mx0 || p[3] > w - mx0 || p[4] < my0 || p[4] > h - my0 ? 1e6 : 0;
      const score = dist(p, c) + 0.05 * ((p[3] - mx) ** 2 + (p[4] - my) ** 2) + edge;
      if (score < bs) { bs = score; best = p; }
    });
    return { x: best[3] / Math.max(1, w - 1), y: best[4] / Math.max(1, h - 1), size: sizes[j] };
  }).filter(Boolean).sort((a, b) => b.size - a.size);
  pins.forEach(p => { p.hex = colourAt(p.x, p.y); });
  ui.photo.pins = pins;
}
function paintPins() {
  const ph = ui.photo;
  $('#pins').innerHTML = ph.pins.map((p, i) => `<button class="pin" data-pin="${i}" style="left:${p.x * 100}%;top:${p.y * 100}%;background:${p.hex}" aria-label="${tr('pin', i + 1)}: ${p.hex}"></button>`).join('');
  $('#photo-strip').innerHTML = ph.pins.map(p => `<i style="background:${p.hex}"></i>`).join('');
  $('#photo-codes').innerHTML = ph.pins.map(p => `<button class="code-chip" data-act="copy" data-hex="${p.hex}">${p.hex}</button>`).join('');
}
function setupPhoto() {
  const ph = ui.photo;
  $('#photo-canvas').getContext('2d').drawImage(ph.canvas, 0, 0);
  paintPins();
  const box = $('#photo');
  let active = -1;
  const move = ev => {
    const r = box.getBoundingClientRect();
    const p = ph.pins[active];
    p.x = clamp((ev.clientX - r.left) / r.width, 0, 1);
    p.y = clamp((ev.clientY - r.top) / r.height, 0, 1);
    p.hex = colourAt(p.x, p.y);
    const el = box.querySelector(`[data-pin="${active}"]`);
    el.style.left = p.x * 100 + '%'; el.style.top = p.y * 100 + '%'; el.style.background = p.hex;
    $('#photo-strip').children[active].style.background = p.hex;
    const chip = $('#photo-codes').children[active];
    chip.textContent = p.hex; chip.dataset.hex = p.hex;
  };
  box.addEventListener('pointerdown', ev => {
    const pin = ev.target.closest('[data-pin]');
    if (!pin) return;
    ev.preventDefault();
    active = Number(pin.dataset.pin);
    box.setPointerCapture(ev.pointerId);
    pin.classList.add('dragging');
  });
  box.addEventListener('pointermove', ev => { if (active >= 0) move(ev); });
  const stop = () => {
    if (active < 0) return;
    const el = box.querySelector(`[data-pin="${active}"]`);
    if (el) el.classList.remove('dragging');
    active = -1;
  };
  box.addEventListener('pointerup', stop);
  box.addEventListener('pointercancel', stop);
}

/* ---------- Learn: colour theory and the physics of light ---------- */
/* An approximate screen colour for a wavelength of light, for drawing the spectrum strip */
function wavelengthRgb(w) {
  let r = 0, g = 0, b = 0;
  if (w < 440) { r = (440 - w) / 60; b = 1; }
  else if (w < 490) { g = (w - 440) / 50; b = 1; }
  else if (w < 510) { g = 1; b = (510 - w) / 20; }
  else if (w < 580) { r = (w - 510) / 70; g = 1; }
  else if (w < 645) { r = 1; g = (645 - w) / 65; }
  else r = 1;
  /* The eye is less sensitive at both ends, so the strip fades there */
  const f = w < 420 ? 0.3 + 0.7 * (w - 380) / 40 : w > 700 ? 0.3 + 0.7 * (750 - w) / 50 : 1;
  return `rgb(${Math.round(255 * r * f)},${Math.round(255 * g * f)},${Math.round(255 * b * f)})`;
}
function primaryWheelSvg() {
  const C = 60, R = 56, r0 = 36, mode = settings.mode;
  settings.mode = 'painter';
  let s = '';
  for (let i = 0; i < 12; i++) {
    const a = i * 30, t1 = (a - 15 - 90) * Math.PI / 180, t2 = (a + 15 - 90) * Math.PI / 180;
    const p = (r, t) => `${(C + r * Math.cos(t)).toFixed(1)},${(C + r * Math.sin(t)).toFixed(1)}`;
    s += `<path d="M${p(r0, t1)}L${p(R, t1)}A${R},${R} 0 0 1 ${p(R, t2)}L${p(r0, t2)}A${r0},${r0} 0 0 0 ${p(r0, t1)}Z" fill="${rgbToHex(hsvToRgb(angleToHue(a), 0.9, 0.95))}" stroke="#fff" stroke-width="1"/>`;
  }
  settings.mode = mode;
  const pt = a => { const t = (a - 90) * Math.PI / 180; return `${(C + 30 * Math.cos(t)).toFixed(1)},${(C + 30 * Math.sin(t)).toFixed(1)}`; };
  s += `<polygon points="${pt(0)} ${pt(120)} ${pt(240)}" fill="none" stroke="#1E1E1E" stroke-width="1.8"/>`;
  s += `<polygon points="${pt(60)} ${pt(180)} ${pt(300)}" fill="none" stroke="#1E1E1E" stroke-width="1.2" stroke-dasharray="3 2.5"/>`;
  return `<svg viewBox="0 0 120 120" class="learn-wheel" aria-hidden="true">${s}</svg>`;
}
function spectrumSvg(L) {
  let s = '';
  for (let w = 380; w <= 750; w += 2) s += `<rect x="${((w - 380) / 370 * 300).toFixed(1)}" y="0" width="2.2" height="28" fill="${wavelengthRgb(w)}"/>`;
  [400, 500, 600, 700].forEach(w => {
    const x = (w - 380) / 370 * 300;
    s += `<line x1="${x}" x2="${x}" y1="28" y2="33" stroke="#6B6B6B"/><text x="${x}" y="44" text-anchor="middle" class="ax">${w} nm</text>`;
  });
  s += `<text x="0" y="58" class="ax">← ${esc(L.ultraviolet)}</text><text x="300" y="58" text-anchor="end" class="ax">${esc(L.infrared)} →</text>`;
  return `<svg viewBox="0 0 300 62" class="learn-spectrum" aria-hidden="true">${s}</svg>`;
}
function learnHtml() {
  const L = LEARN[lang];
  const src = t => `<p class="learn-src">${L.sources}: ${esc(t)}</p>`;
  const swatch = cs => cs.map(c => `<i style="background:${c}"></i>`).join('');
  return `<div class="view with-tabs learn">
    ${topbar(L.title)}
    <p class="learn-intro">${esc(L.intro)}</p>
    <section class="learn-sec">
      <h3>1 · ${esc(L.primaryTitle)}</h3>
      <div class="learn-row">${primaryWheelSvg()}<p>${esc(L.primaryText)}</p></div>
      <p class="learn-key">${esc(L.primaryKey)}</p>
      ${src(L.primarySrc)}
    </section>
    <section class="learn-sec">
      <h3>2 · ${esc(L.warmTitle)}</h3>
      <div class="warmcool">
        <div><span class="wc-dots">${swatch(['#E62E2E', '#E6772E', '#E6C02E'])}</span><span>${esc(L.warm)}</span></div>
        <div><span class="wc-dots">${swatch(['#3DA34A', '#2E65E6', '#7F3DC8'])}</span><span>${esc(L.cool)}</span></div>
      </div>
      <p>${esc(L.warmText)}</p>
      ${src(L.warmSrc)}
    </section>
    <section class="learn-sec">
      <h3>3 · ${esc(L.lightTitle)}</h3>
      ${spectrumSvg(L)}
      <p>${esc(L.lightText)}</p>
      ${src(L.lightSrc)}
    </section>
    <section class="learn-sec">
      <h3>4 · ${esc(L.mixTitle)}</h3>
      <div class="mixes">
        <figure><svg viewBox="0 0 100 86" class="mix light" aria-hidden="true"><g><circle cx="38" cy="34" r="22" fill="#FF0000"/><circle cx="62" cy="34" r="22" fill="#00FF00"/><circle cx="50" cy="54" r="22" fill="#0000FF"/></g></svg><figcaption>${esc(L.mixLight)}</figcaption></figure>
        <figure><svg viewBox="0 0 100 86" class="mix paint" aria-hidden="true"><g><circle cx="38" cy="34" r="22" fill="#00FFFF"/><circle cx="62" cy="34" r="22" fill="#FF00FF"/><circle cx="50" cy="54" r="22" fill="#FFFF00"/></g></svg><figcaption>${esc(L.mixPaint)}</figcaption></figure>
      </div>
      <p>${esc(L.mixText)}</p>
      ${src(L.mixSrc)}
    </section>
    <section class="learn-sec">
      <h3>5 · ${esc(L.harmTitle)}</h3>
      <p>${esc(L.harmText)}</p>
      <ul class="harm-list">${HARMONIES.map(h => `<li><span class="harm-ic">${harmonyIcon(h.offs, h.key === 'lightDark')}</span>
        <span><b>${tr(h.key)}</b> · ${esc(L.harm[h.key])}</span></li>`).join('')}</ul>
      ${src(L.harmSrc)}
    </section>
    ${creditHtml()}
  </div>`;
}

/* ---------- Menu: language, backup ---------- */
function menuHtml() {
  const last = settings.lastBackup ? ' ' + tr('backupLast', new Date(settings.lastBackup + 'T12:00').toLocaleDateString(locale(), { dateStyle: 'medium' })) : '';
  return `<div class="view menu">
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="${tr('back')}">‹</button>
      <h2>${tr('menu')}</h2>
    </header>
    <h3>${tr('language')}</h3>
    <div class="seg">
      <button data-act="lang" data-lang="en" aria-pressed="${lang === 'en'}">English</button>
      <button data-act="lang" data-lang="it" aria-pressed="${lang === 'it'}">Italiano</button>
    </div>
    <h3>${tr('backup')}</h3>
    <p class="note">${tr('backupNote')}${last}</p>
    <div class="btns">
      <button class="btn primary" data-act="export">${tr('exportBackup')}</button>
      <label class="btn">${tr('importBackup')}<input type="file" accept=".json,application/json" id="import-file" hidden></label>
    </div>
    ${creditHtml()}
  </div>`;
}
function exportBackup() {
  try {
    const blob = new Blob([JSON.stringify({ app: 'sfumato', version: 1, palettes }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sfumato-${todayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    settings.lastBackup = todayKey();
    saveSettings(true);
    toast(tr('backupSaved'));
    render();
  } catch (e) { toast(tr('backupFailed')); }
}
async function importBackup(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
    if (!parsed || parsed.app !== 'sfumato' || !Array.isArray(parsed.palettes)) throw new Error('bad');
  } catch (e) { toast(tr('notBackup')); return; }
  if (!confirm(tr('confirmImport'))) return;
  const before = palettes;
  palettes = cleanPalettes(parsed.palettes);
  if (!savePalettes()) { palettes = before; return; }
  settings.lastBackup = todayKey();
  saveSettings(true);
  toast(tr('backupRestored'));
  render();
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ---------- Events ---------- */
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'tab': switchTab(b.dataset.tab); break;
    case 'menu': go('menu'); break;
    case 'back': back(); break;
    case 'mode': {
      /* Switching wheels keeps the same colour: only its place on the wheel changes */
      const hue = angleToHue(settings.a);
      settings.mode = b.dataset.mode === 'screen' ? 'screen' : 'painter';
      settings.a = hueToAngle(hue);
      showFactFor(settings.mode);
      saveSettings(true);
      render();
      break;
    }
    case 'harmony':
      settings.harmonyKey = HARMONIES.some(h => h.key === b.dataset.key) ? b.dataset.key : 'opposite';
      showFactFor(settings.harmonyKey);
      saveSettings(true);
      render();
      break;
    case 'ld-row':
      settings.ldRow = clamp(Number(b.dataset.row) || 0, 0, 2);
      saveSettings(true);
      $('#ld').querySelectorAll('.ld-row').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      paintSelection();
      break;
    case 'next-fact': nextFact(); break;
    case 'copy': copyText(b.dataset.hex, tr('copied', b.dataset.hex)); break;
    case 'save-wheel': openSaveSheet(wheelColours(), 'wheel'); break;
    case 'sheet-close': sheet.close(); break;
    case 'open-palette': go('palette/' + encodeURIComponent(id)); break;
    case 'rename': { const p = paletteById(id); if (p) openRenameSheet(p); break; }
    case 'delete-palette': { const p = paletteById(sheet.querySelector('form').dataset.id); if (p) deletePalette(p); break; }
    case 'share': { const p = paletteById(id); if (p) sharePalette(p); break; }
    case 'copy-codes': { const p = paletteById(id); if (p) copyText(p.colors.join(' '), tr('copied', p.colors.join(' '))); break; }
    case 'open-wheel': { const p = paletteById(id); if (p) openOnWheel(p); break; }
    case 'pick-photo': $('#photo-file').click(); break;
    case 'fewer': if (ui.photo && ui.photo.pins.length > 2) { findColours(ui.photo.pins.length - 1); render(); } break;
    case 'more': if (ui.photo && ui.photo.pins.length < MAX_COLOURS) { findColours(ui.photo.pins.length + 1); render(); } break;
    case 'save-photo': if (ui.photo) openSaveSheet(ui.photo.pins.map(p => p.hex), 'photo'); break;
    case 'lang':
      lang = b.dataset.lang === 'it' ? 'it' : 'en';
      settings.lang = lang;
      saveSettings(true);
      document.documentElement.lang = lang;
      render();
      break;
    case 'export': exportBackup(); break;
  }
});
document.addEventListener('submit', ev => {
  ev.preventDefault();
  if (ev.target.id === 'save-form') submitSave(ev.target);
  else if (ev.target.id === 'rename-form') submitRename(ev.target);
});
document.addEventListener('input', ev => {
  if (ev.target.name === 'name' && $('#name-error')) $('#name-error').hidden = true;
});
document.addEventListener('change', ev => {
  if (ev.target.id === 'photo-file') {
    const file = ev.target.files[0];
    ev.target.value = '';
    loadPhoto(file);
  }
  if (ev.target.id === 'import-file') {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (file) importBackup(file);
  }
});
sheet.addEventListener('click', ev => { if (ev.target === sheet) sheet.close(); });
/* Redraw the wheel at the new size when the phone is turned */
let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (currentRoute().name === 'wheel' && !sheet.open) render(); }, 200);
});

/* ---------- Start ---------- */
render();

/* ---------- Offline support ---------- */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
