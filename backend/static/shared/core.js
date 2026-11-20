'use strict';
/* Shared helpers, icons and visual primitives for the three SANAD portals. */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const G = '#1E9E5A';
const TIER_COLOR = { critical: '#E5484D', watch: '#C98A06', routine: '#1E9E5A' };
const FEAT_ICON = { genetic_flag: 'dna', family_history: 'users', obesity: 'gauge', diabetes: 'drop', screening_overdue: 'clock', age: 'user' };
const REASON_ICON = { genetic: 'dna', family: 'users', obesity: 'gauge', diabetes: 'drop', overdue: 'clock' };
const PREP_ICON = { caffeine: 'cup', clothing: 'shirt', deodorant: 'drop', id: 'idcard', early: 'clock', reports: 'file', metal: 'gem', meds: 'pill', kit: 'box' };
const OUTCOME_ICON = { normal: 'check', followup: 'search', referred: 'send' };

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  sget(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  sset(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} }
};

const PORTAL = document.body.dataset.portal;
const UI = {
  lang: store.get('sanad.lang.' + PORTAL, PORTAL === 'app' ? 'en' : 'en'),
  token: store.sget('sanad.token.' + PORTAL),
  onAuthLost: null
};

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isAr = () => UI.lang === 'ar';
const locFor = l => (l === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB');
const nm = (o, l = UI.lang) => (l === 'ar' ? o.name_ar || o.name : o.name);
const pct = r => Math.round(r * 100);
const fmtN = (v, d = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function t(path, params, lang = UI.lang) {
  const pick = l => path.split('.').reduce((o, k) => (o == null ? o : o[k]), I18N[l]);
  let v = pick(lang);
  if (v == null) v = pick('en');
  if (v == null) return path;
  if (typeof v === 'string' && params) v = v.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return v;
}

function D(iso) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
  return new Date(iso);
}
const dfmt = (iso, o, l = UI.lang) => new Intl.DateTimeFormat(locFor(l), o).format(D(iso));
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dayDiff(iso) {
  const a = D(iso), n = new Date();
  return Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
}
function dayLabel(iso, l = UI.lang) {
  const k = dayDiff(iso);
  if (k === 0) return t('common.today', null, l);
  if (k === 1) return t('common.tomorrow', null, l);
  return dfmt(iso, { weekday: 'short', day: 'numeric', month: 'short' }, l);
}
const shortDate = (iso, l) => dfmt(iso, { day: 'numeric', month: 'short' }, l);

function initials(o, l = UI.lang) {
  const parts = nm(o, l).replace(/^(Dr\.|د\.)\s*/, '').split(' ').filter(Boolean);
  const ch = w => (l === 'ar' ? w.replace(/^ال/, '') : w)[0] || '';
  return (ch(parts[0]) + (parts.length > 1 ? ch(parts[parts.length - 1]) : '')).toUpperCase();
}

function evText(e) {
  if (!e) return '';
  const p = { ...e.params };
  if (p.relation) p.relation = t('rel.' + p.relation);
  if (p.test) p.test = t('clinical.tests.' + p.test);
  return esc(t('clinical.ev.' + e.key, p));
}

/* ---------------- icons ---------------- */
const ICONS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.4c2.1.8 3.5 2.8 3.5 5.6"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4 3.4-7 7.5-7s7.5 3 7.5 7"/>',
  logout: '<path d="M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5"/><path d="M9.5 16 5.5 12l4-4M5.5 12h10"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  activity: '<path d="M3 12h4l3-7.5 4 15 3-7.5h4"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5V3h6v1.5M9 11h6M9 15h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.6-4.9"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  dna: '<path d="M8 3c0 5 8 7 8 12 0 2.6-1.4 4.6-3 6M16 3c0 5-8 7-8 12 0 2.6 1.4 4.6 3 6"/><path d="M9.2 7h5.6M8.6 12h6.8M9.2 17h5.6"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
  chart: '<path d="M3.5 20.5h17"/><path d="M7 16.5v-5M11.5 16.5V6M16 16.5v-8M20 16.5v-3"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  megaphone: '<path d="M3.5 10v4a1 1 0 0 0 1 1H7l7 4.5v-15L7 9H4.5a1 1 0 0 0-1 1z"/><path d="M18 9a4 4 0 0 1 0 6M7 15l1.5 5"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.1"/>',
  steth: '<path d="M5 3v5a5 5 0 0 0 10 0V3"/><path d="M10 13v2.5a5.5 5.5 0 0 0 11 0V13"/><circle cx="21" cy="11" r="2"/>',
  send: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4 17-6.5z"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  cup: '<path d="M4 9h13v4.5A5.5 5.5 0 0 1 11.5 19h-2A5.5 5.5 0 0 1 4 13.5V9z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5v2.5M12.5 3.5v2.5"/>',
  shirt: '<path d="M8 3.5 3.5 6.5l2 5 2-1v10.5h9V10.5l2 1 2-5L16 3.5a4 4 0 0 1-8 0z"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.7-2.3 3-2.3s2.5.8 3 2.3M15 10h3M15 13.5h3"/>',
  drop: '<path d="M12 3.5s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/>',
  gauge: '<path d="M4 17.5a8 8 0 1 1 16 0"/><path d="m12 17.5 3.5-5"/><circle cx="12" cy="17.5" r="1.2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  pill: '<rect x="2.6" y="8.5" width="18.8" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m8.5 8.5 7 7"/>',
  box: '<path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9L12 3z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>',
  gem: '<path d="M6.5 4h11l3.5 5-9 11L3 9l3.5-5z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  sms: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  building: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-5h6v5M8 11h2M14 11h2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.6 5.4 3.6 8.5s-1.2 6-3.6 8.5c-2.4-2.5-3.6-5.4-3.6-8.5S9.6 6 12 3.5z"/>',
  del: '<path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7z"/><path d="m12.5 9.5 5 5M17.5 9.5l-5 5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sparkle: '<path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9L11 3.5z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>'
};
const icon = (n, s = 22, cls = '') =>
  `<svg class="i ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------------- primitives ---------------- */
function heartArt(size, id = 'h') {
  return `<svg class="heart" width="${size}" height="${size}" viewBox="0 0 240 240" aria-hidden="true">
  <defs>
    <radialGradient id="hg${id}" cx="36%" cy="30%" r="82%"><stop offset="0" stop-color="#B4F5CF"/><stop offset=".33" stop-color="#43CD86"/><stop offset=".74" stop-color="#15894B"/><stop offset="1" stop-color="#0A5430"/></radialGradient>
    <filter id="hb${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="hs${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <ellipse cx="120" cy="228" rx="72" ry="9" fill="#0F1411" opacity=".14" filter="url(#hs${id})"/>
  <g class="beat">
    <path d="M120 212C62 170 20 134 20 86 20 52 46 28 78 28c19 0 34 9 42 24 8-15 23-24 42-24 32 0 58 24 58 58 0 48-42 84-100 126z" fill="url(#hg${id})"/>
    <ellipse cx="80" cy="66" rx="30" ry="15" transform="rotate(-32 80 66)" fill="#fff" opacity=".55" filter="url(#hb${id})"/>
    <path d="M152 170c22-18 40-40 46-66" stroke="#fff" stroke-opacity=".2" stroke-width="10" stroke-linecap="round" fill="none" filter="url(#hb${id})"/>
    <path class="pulse-line" d="M44 114h40l10-22 14 46 12-34 8 10h68" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </g></svg>`;
}

function wave(w, h, beats, id) {
  const mid = h * 0.62, seg = (w - 8) / beats;
  const shape = [[.18, 0], [.24, -.12], [.30, 0], [.38, 0], [.42, .10], [.46, -.85], [.50, .35], [.54, 0], [.66, 0], [.74, -.18], [.82, 0], [1, 0]];
  let d = `M0 ${mid}`;
  for (let b = 0; b < beats; b++) shape.forEach(([px, py]) => { d += ` L${(b * seg + px * seg).toFixed(1)} ${(mid + py * h * .56).toFixed(1)}`; });
  const ex = (w - 8).toFixed(1);
  return `<svg class="wave" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <defs><linearGradient id="wg${id}" x1="0" x2="1"><stop offset="0" stop-color="${G}" stop-opacity=".12"/><stop offset=".65" stop-color="${G}" stop-opacity=".85"/><stop offset="1" stop-color="${G}"/></linearGradient></defs>
    <path class="draw" d="${d}" fill="none" stroke="url(#wg${id})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle class="wring" cx="${ex}" cy="${mid}" r="3.5" fill="none" stroke="${G}" stroke-width="1.5"/>
    <circle cx="${ex}" cy="${mid}" r="3.5" fill="${G}"/></svg>`;
}

function ring(frac, size, sw, color, inner) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, frac))), h = size / 2;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="#E6EBE8" stroke-width="${sw}"/>
    <circle class="ring-fg" cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${off}" transform="rotate(-90 ${h} ${h})"/>
  </svg><div class="ring-in">${inner}</div></div>`;
}

function segRing(parts, size, sw, inner) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, h = size / 2, total = parts.reduce((a, p) => a + p.v, 0) || 1;
  let acc = 0;
  const segs = parts.map(p => {
    const full = c * p.v / total, len = Math.max(0, full - (p.v ? 4 : 0));
    const s = `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${sw}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${h} ${h})"/>`;
    acc += full;
    return s;
  }).join('');
  return `<div class="seg-ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="#EEF1EF" stroke-width="${sw}"/>${segs}</svg><div class="ring-in">${inner}</div></div>`;
}

function bars(items, { h = 150, max } = {}) {
  max = max || Math.max(...items.map(i => i.v), 1);
  return `<div class="bars" style="height:${h}px">${items.map((it, i) => {
    const tag = it.act ? 'button' : 'div';
    const attrs = it.act ? `data-act="${it.act}" data-id="${esc(it.id)}" aria-label="${esc(it.aria || it.label)}"` : '';
    const height = it.v > 0 ? Math.max(6, (it.v / max) * 100) : 0;
    return `<${tag} class="bar-col" ${attrs}>${it.top != null ? `<em>${esc(it.top)}</em>` : ''}<div class="bar-track"><i style="--i:${i};height:${height}%;background:linear-gradient(180deg,${it.color}AA,${it.color})"></i></div><span>${esc(it.label ?? '')}</span></${tag}>`;
  }).join('')}</div>`;
}

function hbars(items) {
  const max = Math.max(...items.map(i => i.v), 1);
  return `<div class="hbars">${items.map((it, i) => `<div><div class="hb-top"><span>${esc(it.label)}</span><b class="num">${esc(it.value ?? fmtN(it.v))}</b></div>
    <div class="hb-bar"><i style="--w:${Math.max(2, it.v / max * 100)}%;--i:${i};--c:${it.color || G}"></i></div>${it.sub ? `<small class="hb-sub">${it.sub}</small>` : ''}</div>`).join('')}</div>`;
}

const dots = (n, tier) =>
  `<div class="dots" style="--tc:${TIER_COLOR[tier]}" role="img" aria-label="${esc(t('clinical.outOf', { n }))}">${Array.from({ length: 100 }, (_, i) => `<i class="${i < n ? 'on' : ''}" style="--i:${i}"></i>`).join('')}</div>`;

const banner = (body, ic = 'info', cls = '') => `<div class="banner ${cls}">${icon(ic, 22)}<div class="grow">${body}</div></div>`;

const langBtn = () => `<button class="icbtn" data-act="lang" aria-label="${esc(t('common.lang'))}"><span class="lang-txt">${isAr() ? 'EN' : 'ع'}</span></button>`;

const GEN = { grandmother: 0, mother: 0, father: 0, aunt: 0, uncle: 0, self: 1, sister: 1, brother: 1, daughter: 2, son: 2 };
function familyTree(nodes, mode, selfLabel) {
  const rows = [[], [], []];
  [{ rel: 'self' }, ...nodes].forEach(n => rows[GEN[n.rel] ?? 1].push(n));
  const node = n => {
    if (n.rel === 'self') return `<div class="node self"><span class="nc">${icon('user', 22)}</span><span class="nl">${esc(selfLabel)}</span></div>`;
    const label = t('rel.' + n.rel);
    if (mode === 'invite') return `<button class="node pick ${n.selected ? 'on' : ''}" data-act="invite" data-id="${n.rel}" aria-pressed="${!!n.selected}"><span class="nc">${icon('user', 22)}<i class="tick">${icon('check', 12)}</i></span><span class="nl">${label}</span></button>`;
    return `<div class="node ${n.affected ? 'aff' : ''}"><span class="nc">${icon('user', 22)}</span><span class="nl">${label}</span>${n.affected ? `<span class="dx">${t('clinical.dxAt', { age: n.age })}</span>` : ''}</div>`;
  };
  return `<div class="tree">${rows.filter(r => r.length).map(r => `<div class="gen">${r.map(node).join('')}</div>`).join('')}</div>`;
}

function historyTrack(p) {
  const today = new Date(), start = new Date(today); start.setFullYear(today.getFullYear() - 3);
  const span = today - start;
  const raw = d => ((D(d) - start) / span) * 100;
  const pos = d => Math.max(6, Math.min(94, raw(d)));
  const last = p.history.length ? p.history[p.history.length - 1].date : null;
  const years = [0, 1, 2].map(i => today.getFullYear() - 2 + i).map(y => ({ y, x: raw(`${y}-01-01`) })).filter(o => o.x > 4 && o.x < 88);
  return `<div class="track">
    <div class="track-line"></div>
    ${p.overdue ? `<div class="track-gap" style="left:${last ? pos(last) : 0}%"></div>` : ''}
    ${p.history.map(e => `<div class="tev" style="left:${pos(e.date)}%"><span>${t('clinical.tests.' + e.test)}<em>${t('clinical.results.' + e.result)}</em></span><i></i></div>`).join('')}
    <div class="tnow"><i></i></div>
  </div>
  <div class="track-years">${years.map(o => `<span style="left:${o.x}%">${o.y}</span>`).join('')}<span style="left:100%">${t('common.today')}</span></div>
  ${p.overdue ? `<div class="gap-note">${icon('alert', 15)}${p.last_screened_months == null ? t('clinical.noHistory') : t('clinical.gap', { n: p.last_screened_months })}</div>` : ''}`;
}

function factorList(factors) {
  return factors.map(f => `<div class="factor f-${f.level}">
    <span class="f-ic">${icon(FEAT_ICON[f.feature], 18)}</span>
    <div class="f-body"><b>${evText(f)}</b>
      <small>${t('clinical.sources.' + f.source)}${f.date ? ` · ${esc(dfmt(f.date, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''} ·
        ${f.verified ? `<span class="ver">${icon('check', 11)}${t('clinical.verified')}</span>` : `<span class="selfrep">${t('clinical.selfReported')}</span>`}</small>
      <div class="impact"><i style="--w:${f.share}%"></i></div></div>
    <span class="f-lvl">${t('clinical.impact.' + f.level)}</span></div>`).join('');
}

/* ---------------- api, toast, motion ---------------- */
const API_BASE = window.SANAD_API || '';
async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Portal': PORTAL, ...(UI.token ? { Authorization: 'Bearer ' + UI.token } : {}) } });
  if ((res.status === 401 || res.status === 403) && path !== '/api/login') {
    if (UI.onAuthLost) UI.onAuthLost();
    throw new Error('auth');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(body.error || 'request failed'); e.status = res.status; e.code = body.code; throw e; }
  return body;
}

/* ---------------- SANAD Assist (grounded generative AI) ---------------- */
function aiLoading(small) {
  return `<div class="ai-loading ${small ? 'small' : ''}" role="status"><span class="ai-orb"></span><div><b>${t(small ? 'ai.asking' : 'ai.working')}</b>
    ${small ? '' : `<ol class="ai-steps"><li>${t('ai.step1')}</li><li>${t('ai.step2')}</li><li>${t('ai.step3')}</li></ol>`}</div></div>`;
}

function aiBadge(v) {
  const ok = !v.removed && !v.figures_flagged;
  return `<span class="ai-verify ${ok ? 'ok' : 'warn'}">${icon(ok ? 'checkCircle' : 'alert', 15)}${t('ai.verified', { v: v.verified, n: v.statements })}${v.removed ? ` · ${t('ai.removed', { n: v.removed })}` : ''}${v.figures_flagged ? ` · ${t('ai.figFlag', { n: v.figures_flagged })}` : ''}</span>`;
}

function aiStatement(it, res, label) {
  const imp = it.importance ? `<span class="imp imp-${it.importance}">${t('ai.imp.' + it.importance)}</span>` : '';
  return `<li class="ai-st">${imp}<p>${esc(it.text)}${it.figures_ok === false ? ` <span class="ai-fig">${icon('alert', 11)}${t('ai.checkFigure')}</span>` : ''}</p>
    <span class="ai-src">${it.sources.map(id => `<span class="src" tabindex="0" title="${esc(res.evidence[id] || id)}">${icon('file', 11)}${esc(label(id))}</span>`).join('')}</span></li>`;
}

function aiSection(title, ic, items, res, label) {
  if (!items || !items.length) return '';
  return `<div class="ai-sec"><h4>${icon(ic, 16)}${title}</h4><ul>${items.map(it => aiStatement(it, res, label)).join('')}</ul></div>`;
}

function aiNotes(title, ic, notes) {
  if (!notes || !notes.length) return '';
  return `<div class="ai-sec"><h4>${icon(ic, 16)}${title}</h4><ul class="ai-notes">${notes.map(n => `<li>${esc(n.text)}</li>`).join('')}</ul></div>`;
}

function aiFooter(res) {
  return `<p class="fine ai-foot">${icon('sparkle', 13)}${t('ai.footer', { model: esc(res.model), time: esc(dfmt(res.generated_at, { hour: 'numeric', minute: '2-digit' })) })}</p>`;
}

function aiError(code, retryAct, retryId = '') {
  return `<div class="ai-err">${icon('alert', 18)}<p>${t('ai.err.' + (code || 'api'))}</p>${retryAct ? `<button class="btn-small ghost" data-act="${retryAct}" data-id="${esc(retryId)}">${t('ai.retry')}</button>` : ''}</div>`;
}

function aiAskBlock(state, placeholder, suggestions, label, notFoundKey, extra = '') {
  const st = state || { q: '' };
  let out = '';
  if (st.status === 'loading') out = aiLoading(true);
  else if (st.status === 'error') out = aiError(st.code);
  else if (st.status === 'done') {
    const r = st.res, d = r.data, found = (d.in_record ?? d.in_data) !== false && d.answer.length;
    out = `<div class="ai-answer"><div class="ai-q">${icon('user', 14)}${esc(st.asked)}</div>
      ${found ? `${aiBadge(r.verification)}<ul>${d.answer.map(it => aiStatement(it, r, label)).join('')}</ul>${extra}`
        : `<p class="ai-none">${icon('lock', 14)}${t(notFoundKey)}</p>`}
      ${d.follow_ups && d.follow_ups.length ? `<div class="ai-follow"><small>${t('ai.followUps')}</small><div class="chips-wrap">${d.follow_ups.map(q => `<button class="chip grey" data-act="askSuggest" data-id="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>` : ''}
      ${aiFooter(r)}</div>`;
  }
  return `<form class="ask-row" data-form="ask"><input id="askIn" maxlength="500" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(st.q || '')}" aria-label="${esc(placeholder)}">
      <button class="btn-small" type="submit" ${st.status === 'loading' ? 'disabled' : ''}>${icon('send', 14, 'flip')}${t('ai.ask')}</button></form>
    ${st.status === 'done' || st.status === 'loading' ? '' : `<div class="chips-wrap ai-sugg">${suggestions.map(q => `<button class="chip grey" data-act="askSuggest" data-id="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
    ${out}`;
}

function setToken(tok) { UI.token = tok; store.sset('sanad.token.' + PORTAL, tok); }
function setLangPref(l) { UI.lang = l; store.set('sanad.lang.' + PORTAL, l); }
function applyDir() { document.documentElement.lang = UI.lang; document.documentElement.dir = isAr() ? 'rtl' : 'ltr'; }

function toast(msg, ic = 'check') {
  const el = $('#toast');
  el.innerHTML = `${icon(ic, 18)}<span>${esc(msg)}</span>`;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3000);
}

function runAnim(root, anim) {
  anim = anim && !reduced;
  root.classList.toggle('still', !anim);
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
    if (!anim) { el.textContent = fmtN(to, dec); return; }
    const t0 = performance.now(), dur = 1000;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtN(to * e, dec);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  root.querySelectorAll('.ring-fg').forEach(el => {
    if (!anim) { el.style.transition = 'none'; el.style.strokeDashoffset = el.dataset.off; return; }
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.strokeDashoffset = el.dataset.off; }));
  });
  root.querySelectorAll('path.draw').forEach(p => {
    const L = p.getTotalLength();
    p.style.strokeDasharray = L;
    p.style.strokeDashoffset = anim ? L : 0;
    if (anim) requestAnimationFrame(() => requestAnimationFrame(() => {
      p.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.3,.7,.2,1)';
      p.style.strokeDashoffset = 0;
    }));
  });
}

/* PIN keypad used by the app sheet and both web logins */
function keypadHTML() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return `<div class="pin-dots" id="pinDots" aria-live="polite">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>
    <div class="keypad">${keys.map(k => k === '' ? '<span></span>' :
      `<button type="button" data-act="key" data-id="${k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? icon('del', 24) : k}</button>`).join('')}</div>`;
}

function makePin(onComplete) {
  const st = { pin: '', err: false };
  st.update = () => {
    const box = $('#pinDots'); if (!box) return;
    box.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < st.pin.length));
    const hint = $('#pinHint');
    if (hint) hint.innerHTML = st.err ? `<span class="err">${t('common.pinWrong')}</span>` : hint.dataset.hint;
  };
  st.press = k => {
    if (k === 'del') st.pin = st.pin.slice(0, -1);
    else if (st.pin.length < 4) st.pin += k;
    st.err = false;
    st.update();
    if (st.pin.length === 4) setTimeout(() => onComplete(st.pin), 160);
  };
  st.fail = () => {
    st.pin = ''; st.err = true; st.update();
    const box = $('#pinDots'); if (!box) return;
    box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
  };
  st.reset = () => { st.pin = ''; st.err = false; };
  return st;
}
