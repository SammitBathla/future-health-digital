'use strict';
/* Doctor portal: residents who booked through the ADPHC programme, with the full
   clinical picture behind each referral, and a form to record the checkup outcome. */

const S = { me: null, list: null, tab: 'upcoming', sel: null, detail: null, result: null, notes: '', known: null, fresh: new Set(), accounts: null, acct: null, sig: '', view: 'referral', condFilter: 'all', ai: {}, ask: {} };

const FEAT_REASON = { genetic_flag: 'genetic', family_history: 'family', obesity: 'obesity', diabetes: 'diabetes', screening_overdue: 'overdue' };

function srcLabel(id) {
  const parts = id.split(':'), k = parts[0], v = parts[1];
  const d = S.detail, R = d && d.record;
  switch (k) {
    case 'S': return t('ai.src.' + v);
    case 'F': return v === 'age' ? t('ai.src.age') : t('reasons.' + FEAT_REASON[v]);
    case 'C': return t('record.cond.' + v);
    case 'M': return (R && R.medications[+v] && R.medications[+v].name) || id;
    case 'A': return v === 'none' ? t('record.tiles.none') : t('record.allergy.' + v);
    case 'L': return t('record.labs.' + v);
    case 'E': return `${t('record.ev.' + parts[2])} · ${shortDate(v)}`;
    case 'H': { const h = d && d.clinical.history[+v]; return h ? `${t('clinical.tests.' + h.test)} · ${h.date.slice(0, 4)}` : id; }
    case 'R': return t('rel.' + v);
  }
  return id;
}

function aiCard(a) {
  const st = S.ai[a.id] || { status: 'idle' };
  const res = st.res;
  let body;
  if (st.status === 'loading') body = aiLoading();
  else if (st.status === 'error') body = aiError(st.code, 'aiBrief');
  else if (st.status === 'done') {
    const D = res.data;
    body = `${D.headline ? `<p class="ai-headline">${esc(D.headline.text)}</p><span class="ai-src">${D.headline.sources.map(id => `<span class="src" tabindex="0" title="${esc(res.evidence[id] || id)}">${icon('file', 11)}${esc(srcLabel(id))}</span>`).join('')}</span>` : ''}
      ${aiSection(t('ai.sec.summary'), 'clipboard', D.summary, res, srcLabel)}
      ${aiSection(t('ai.sec.signals'), 'search', D.screening_signals, res, srcLabel)}
      ${aiSection(t('ai.sec.checks'), 'shield', D.visit_checks, res, srcLabel)}
      ${aiSection(t('ai.sec.questions'), 'users', D.questions, res, srcLabel)}
      ${aiNotes(t('ai.sec.gaps'), 'info', D.gaps)}
      ${aiFooter(res)}`;
  } else {
    body = `<p class="ai-intro">${t('ai.doctorIntro')}</p><button class="btn-primary" data-act="aiBrief">${icon('sparkle', 18)}${t('ai.generate')}</button>`;
  }
  return `<div class="card ai-card">
    <div class="ai-hd"><span class="ai-logo">${icon('sparkle', 18)}</span><div class="grow"><b>${t('ai.doctorTitle')}</b><small>${t('ai.doctorSub')}</small></div>
      ${st.status === 'done' ? `<div class="ai-actions">${aiBadge(res.verification)}<button class="btn-small ghost" data-act="aiBrief" data-id="refresh">${icon('refresh', 13)}${t('ai.regenerate')}</button></div>` : ''}</div>
    ${body}
    <div class="ai-ask"><h4>${icon('sparkle', 16, 'g')}${t('ai.askTitle')}</h4>${aiAskBlock(S.ask[a.id], t('ai.askPh'), t('ai.suggestDoctor'), srcLabel, 'ai.notInRecord')}</div>
  </div>`;
}

async function runBrief(refresh) {
  const id = S.sel;
  S.ai[id] = { status: 'loading' };
  renderDossier(false);
  try {
    const res = await api(`/api/doctor/appointment/${encodeURIComponent(id)}/ai/brief`, { method: 'POST', body: JSON.stringify({ lang: UI.lang, refresh }) });
    S.ai[id] = { status: 'done', res };
  } catch (e) {
    S.ai[id] = { status: 'error', code: e.code };
  }
  if (S.sel === id) renderDossier(false);
}

async function runAsk(q) {
  const id = S.sel;
  q = (q || '').trim();
  if (q.length < 3) return;
  S.ask[id] = { q, asked: q, status: 'loading' };
  renderDossier(false);
  try {
    const res = await api(`/api/doctor/appointment/${encodeURIComponent(id)}/ai/ask`, { method: 'POST', body: JSON.stringify({ question: q, lang: UI.lang }) });
    S.ask[id] = { q: '', asked: q, status: 'done', res };
  } catch (e) {
    S.ask[id] = { q, asked: q, status: 'error', code: e.code };
  }
  if (S.sel === id) renderDossier(false);
}

const COND_ICON = { t2dm: 'drop', prediabetes: 'drop', gestational_dm: 'drop', dyslipidemia: 'drop', obesity: 'gauge', htn: 'heart', asthma: 'activity', sleep_apnea: 'activity' };
const EV_ICON = { gp: 'steth', specialist: 'user', er: 'alert', admission: 'building', surgery: 'activity', vaccination: 'shield', screening: 'search' };
const ym = s => dfmt(s.length === 7 ? s + '-01' : s, { month: 'short', year: 'numeric' });

function spark(series, lab, color) {
  const w = 220, h = 58, pad = 7;
  const vals = series.map(s => s[1]);
  const refs = [lab.hi, lab.lo].filter(v => v != null);
  let min = Math.min(...vals, ...refs), max = Math.max(...vals, ...refs);
  if (max === min) { max += 1; min -= 1; }
  const span = max - min;
  min -= span * 0.12; max += span * 0.12;
  const x = i => pad + (i * (w - pad * 2)) / Math.max(1, vals.length - 1);
  const y = v => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  const id = 'sp' + lab.key;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${refs.map(r => `<line x1="0" x2="${w}" y1="${y(r).toFixed(1)}" y2="${y(r).toFixed(1)}" stroke="#9AA39D" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`).join('')}
    <path d="${area}" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 2.6}" fill="${i === pts.length - 1 ? color : '#fff'}" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`).join('')}
  </svg>`;
}

function refText(lab) {
  if (lab.hi != null && lab.lo != null) return `${lab.lo}–${lab.hi}`;
  return lab.hi != null ? `< ${lab.hi}` : `≥ ${lab.lo}`;
}

function evRef(e) {
  if (e.type === 'vaccination') return t('record.vaccine.' + e.ref);
  if (e.type === 'surgery') return t('record.proc.' + e.ref);
  if (e.type === 'screening') return t('clinical.tests.' + e.ref);
  return t('record.cond.' + e.ref);
}

function recordView(a) {
  const R = a.record;
  const current = R.conditions.filter(c => c.status !== 'resolved');
  const conds = R.conditions.filter(c => S.condFilter === 'all' || (S.condFilter === 'resolved' ? c.status === 'resolved' : c.status !== 'resolved'));
  const last = R.events[0];
  const years = [];
  R.events.forEach(e => { const y = e.date.slice(0, 4); const g = years.find(x => x.y === y); g ? g.items.push(e) : years.push({ y, items: [e] }); });
  const tile = (ic, label, value, sub, alert) => `<div class="card kpi mini ${alert ? 'alert' : ''}"><div class="k-lbl"><span class="k-ic">${icon(ic, 17)}</span>${label}</div><div class="mini-val">${value}</div><small>${sub}</small></div>`;
  return `<div class="grid g4">
      ${tile('clipboard', t('record.tiles.conditions'), `<span class="num" data-count="${current.length}">${current.length}</span>`, t('record.tiles.ofTotal', { n: R.conditions.length }))}
      ${tile('pill', t('record.tiles.meds'), `<span class="num" data-count="${R.medications.length}">${R.medications.length}</span>`, t('record.tiles.current'))}
      ${tile('alert', t('record.tiles.allergies'), `<span class="num">${R.allergies.length}</span>`, R.allergies.length ? R.allergies.map(x => t('record.allergy.' + x.key)).join(', ') : t('record.tiles.none'), R.allergies.length > 0)}
      ${tile('calendar', t('record.tiles.lastVisit'), `<span class="mini-date">${esc(ym(last.date))}</span>`, t('record.ev.' + last.type))}
    </div>
    ${R.allergies.length ? `<div class="allergy">${icon('alert', 20)}<div><b>${t('record.allergyTitle')}</b><p>${R.allergies.map(x => `<span>${t('record.allergy.' + x.key)} <em>· ${t('record.reaction.' + x.reaction)}</em></span>`).join('')}</p></div></div>` : ''}
    <div class="grid g2">
      <div class="card"><div class="ct-row"><div class="ct">${t('record.condTitle')}</div>
        <div class="seg-mini">${['all', 'active', 'resolved'].map(k => `<button class="${S.condFilter === k ? 'on' : ''}" data-act="condFilter" data-id="${k}" aria-pressed="${S.condFilter === k}">${t('record.filters.' + k)}</button>`).join('')}</div></div>
        ${conds.map(c => `<div class="row-item"><span class="k-ic st-${c.status}">${icon(COND_ICON[c.key] || 'clipboard', 17)}</span>
          <div class="grow"><b>${t('record.cond.' + c.key)}</b><small>${c.until ? `${esc(ym(c.since))} – ${esc(ym(c.until))}` : t('record.since', { d: esc(ym(c.since)) })}</small></div>
          <span class="code num">${c.icd}</span><span class="pill cs-${c.status}">${t('record.status.' + c.status)}</span></div>`).join('')}
      </div>
      <div class="card"><div class="ct">${t('record.medTitle')}</div>
        ${R.medications.map(m => `<div class="row-item"><span class="k-ic">${icon('pill', 17)}</span>
          <div class="grow"><b><span dir="ltr">${esc(m.name)} ${esc(m.dose)}</span></b><small>${t('record.freq.' + m.freq)} · ${t('record.forCond', { c: t('record.cond.' + m.for) })}</small></div>
          <small class="muted">${esc(ym(m.since))}</small></div>`).join('')}
      </div>
    </div>
    <div class="card"><div class="ct-row"><div class="ct">${t('record.labsTitle')}</div>${icon('activity', 20, 'g')}</div>
      <div class="labs">${R.labs.map(l => {
        const color = l.flag === 'normal' ? G : l.flag === 'high' ? TIER_COLOR.critical : TIER_COLOR.watch;
        const s = l.series;
        return `<div class="lab"><div class="lab-top"><span>${t('record.labs.' + l.key)}</span><span class="lflag lf-${l.flag}">${t('record.flag.' + l.flag)}</span></div>
          <div class="lab-val"><b class="num">${s[s.length - 1][1]}</b><small>${esc(l.unit)}</small></div>
          ${spark(s, l, color)}
          <div class="lab-range"><span>${esc(ym(s[0][0]))}</span><span>${t('record.ref')} <span class="num">${refText(l)}</span></span><span>${esc(ym(s[s.length - 1][0]))}</span></div></div>`;
      }).join('')}</div>
    </div>
    <div class="card"><div class="ct">${t('record.timelineTitle')}</div>
      <ol class="tl">${years.map(g => `<li class="tl-year num">${g.y}</li>${g.items.map(e => `<li class="tl-ev"><span class="tl-ic ev-${e.type}">${icon(EV_ICON[e.type], 16)}</span>
        <div><b>${t('record.ev.' + e.type)} · ${evRef(e)}</b><small>${esc(dfmt(e.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</small></div></li>`).join('')}`).join('')}</ol>
    </div>
    <p class="fine">${icon('lock', 13)}${t('record.doctorOnly')} · ${t('record.source')}</p>`;
}

/* ---------------- login ---------------- */
function loginView() {
  return `<div class="lang-corner">${langBtn()}</div>
  <div class="login"><form class="login-card" data-form="login" autocomplete="off">
    <div class="logo-dot"></div>
    <h1>${t('doctor.loginTitle')}</h1><p class="muted">${t('doctor.loginSub')}</p>
    ${(S.accounts || []).map(a => `<button type="button" class="acct ${S.acct === a.id ? 'on' : ''}" data-act="pickAcct" data-id="${a.id}" aria-pressed="${S.acct === a.id}">
      <span class="av sm">${esc(initials(a))}</span><span class="grow"><b>${esc(nm(a))}</b><small>${t('specialties.' + a.specialty)}</small></span>
      ${a.upcoming ? `<span class="tag">${t('doctor.upcomingN', { n: a.upcoming })}</span>` : ''}</button>`).join('')}
    ${S.acct ? `<div class="field"><label for="pinIn">PIN</label><input id="pinIn" type="password" inputmode="numeric" maxlength="4" autocomplete="one-time-code" required></div>
      <p class="fine" id="loginMsg">${t('common.pinHint', { pin: '2222' })}</p>
      <button class="btn-primary wide" type="submit">${t('common.signIn')}</button>` : ''}
  </form></div>`;
}

/* ---------------- shell ---------------- */
function shell(body) {
  return `<div class="shell">${sideHTML()}<main class="main">${body}</main></div>`;
}

function sideHTML() {
  const up = (S.list || []).filter(a => a.status === 'booked').length;
  const done = (S.list || []).filter(a => a.status === 'completed').length;
  const d = S.me;
  return `<aside class="side">
      <div class="brand"><span class="logo-dot"></span><div><b>SANAD</b><small>${t('doctor.sub')}</small></div></div>
      <button class="navlink ${S.tab === 'upcoming' ? 'on' : ''}" data-act="tab" data-id="upcoming">${icon('calendar', 20)}${t('doctor.nav.upcoming')}${up ? `<span class="count num">${up}</span>` : ''}</button>
      <button class="navlink ${S.tab === 'completed' ? 'on' : ''}" data-act="tab" data-id="completed">${icon('checkCircle', 20)}${t('doctor.nav.completed')}${done ? `<span class="count num">${done}</span>` : ''}</button>
      <div class="side-foot">
        ${d ? `<div class="me-chip"><span class="av sm">${esc(initials(d))}</span><div><b>${esc(nm(d))}</b><small>${t('specialties.' + d.specialty)}</small></div></div>` : ''}
        <div class="side-actions">${langBtn()}<button class="icbtn" data-act="signOut" aria-label="${esc(t('common.signOut'))}">${icon('logout', 20, 'flip')}</button></div>
      </div>
    </aside>`;
}

function helloSub() {
  const up = (S.list || []).filter(a => a.status === 'booked').length;
  const done = (S.list || []).filter(a => a.status === 'completed').length;
  return S.tab === 'upcoming' ? t('doctor.helloSub', { n: up }) : t('doctor.helloSubDone', { n: done });
}

const visible = () => (S.list || []).filter(a => (S.tab === 'upcoming' ? a.status === 'booked' : a.status === 'completed'));

function listPane() {
  const items = visible();
  if (S.tab === 'completed') items.reverse();
  if (!items.length) return `<div class="empty">${icon('calendar', 26)}<b>${t('doctor.empty')}</b><p>${t('doctor.emptyText')}</p></div>`;
  let lastGroup = '';
  return items.map(a => {
    const g = dayLabel(a.date);
    const head = g !== lastGroup ? `<div class="ap-group">${esc(g)}</div>` : '';
    lastGroup = g;
    const p = a.patient;
    return `${head}<button class="ap-item ${S.sel === a.id ? 'sel' : ''}" data-act="select" data-id="${a.id}" aria-pressed="${S.sel === a.id}">
      <span class="ap-time">${a.time}</span><span class="av sm av-${p.tier}">${esc(initials(p))}</span>
      <span class="grow"><b>${esc(nm(p))}</b><small>${t(`visit.${a.visit_type}.T`)}</small></span>
      ${S.fresh.has(a.id) ? `<span class="newb">${t('common.isNew')}</span>` : ''}</button>`;
  }).join('');
}

function dossier() {
  if (!S.sel) return `<div class="empty" style="padding:60px 28px">${icon('clipboard', 28)}<p>${t('doctor.select')}</p></div>`;
  const a = S.detail;
  if (!a) return `<div class="sk" style="height:150px;margin-bottom:18px"></div><div class="grid g2"><div class="sk" style="height:220px"></div><div class="sk" style="height:220px"></div></div><div class="sk" style="height:260px"></div>`;
  const c = a.clinical, p = a.patient, r = pct(c.risk);
  return `<div class="card">
    <div class="dz-hd"><span class="av lg av-${p.tier}">${esc(initials(p))}</span>
      <div class="grow"><h2>${esc(nm(p))}</h2><small><span class="num">${p.age}</span> · ${t('clinical.sex.' + p.sex)} · <span class="num">${p.mrn}</span> · ${t('areas.' + p.area)} · ${t('langs.' + p.lang)}</small></div>
      <div class="dz-meta"><span class="appt-chip">${icon('calendar', 16)}${esc(dfmt(a.date, { weekday: 'short', day: 'numeric', month: 'short' }))} · <span class="num">${a.time}</span></span>
        <span class="chk ${a.confirmed ? 'yes' : 'no'}">${icon(a.confirmed ? 'checkCircle' : 'clock', 15)}${a.confirmed ? t('doctor.confirmedByPatient') : t('doctor.notConfirmed')}</span></div>
    </div>
    <div class="referral">${icon('building', 16)}${t('doctor.referral', { date: a.invited_at ? esc(dfmt(a.invited_at, { day: 'numeric', month: 'short' })) : '—' })}</div>
  </div>
  ${aiCard(a)}
  <div class="view-switch" role="tablist">${[['referral', 'activity'], ['record', 'file']].map(([k, ic]) =>
    `<button role="tab" class="${S.view === k ? 'on' : ''}" data-act="view" data-id="${k}" aria-selected="${S.view === k}">${icon(ic, 17)}${t('doctor.views.' + k)}</button>`).join('')}</div>
  ${S.view === 'record' ? recordView(a) : referralView(a, c, p, r)}`;
}

function referralView(a, c, p, r) {
  return `<div class="grid g2">
    <div class="card"><div class="risk-hero">
      <div><div class="big"><span data-count="${r}">${r}</span><sup>%</sup></div><div class="big-lbl">${t('clinical.likelihood')}</div><span class="pill ${c.tier}" style="margin-top:14px">${t('tiers.' + c.tier)}</span></div>
      <div class="dots-wrap">${dots(r, c.tier)}<small>${t('clinical.outOf', { n: r })}</small></div></div></div>
    <div class="card"><div class="ct">${t('doctor.visitReason')}</div>
      <div class="reason-big">${t('clinical.actions.' + c.suggestion)}</div>
      <div class="chips-wrap"><span class="chip">${icon('heart', 13)}${t(`visit.${a.visit_type}.T`)}</span><span class="chip grey">${icon('clock', 13)}${t('doctor.duration', { n: a.duration })}</span></div>
      <p class="fine" style="margin-top:14px">${t(`visit.${a.visit_type}.s`)}</p></div>
  </div>
  <div class="card"><div class="ct-row"><div class="ct">${t('clinical.whyTitle')}</div>${icon('activity', 20, 'g')}</div>${factorList(c.factors)}</div>
  <div class="grid g2">
    <div class="card"><div class="ct">${t('clinical.familyTitle')}</div>
      ${c.relatives.some(x => x.affected) ? familyTree(c.relatives, 'clinical', nm(p).split(' ')[0]) : `<p class="muted">${t('clinical.noFamily')}</p>`}</div>
    <div>
      <div class="card" style="margin-bottom:18px"><div class="ct">${t('clinical.historyTitle')}</div>${historyTrack(c)}</div>
      <div class="tiles">
        <div class="tile"><span>${t('clinical.confidence')}</span><b>${t('clinical.conf.' + c.confidence.level)}</b><small>${t('clinical.confSub', { v: c.confidence.verified, t: c.confidence.total })}</small></div>
        <div class="tile"><span>${t('clinical.lastScreened')}</span><b>${c.last_screened_months == null ? t('clinical.never') : t('clinical.monthsAgo', { n: c.last_screened_months })}</b><small>${c.history.length ? t('clinical.tests.' + c.history[c.history.length - 1].test) : ''}</small></div>
      </div>
    </div>
  </div>
  ${outcomeCard(a)}`;
}

function outcomeCard(a) {
  if (a.status === 'completed' && a.outcome) {
    const o = a.outcome;
    return banner(`<b>${t(`outcome.${o.result}.t`)} · ${t(`outcome.${o.result}.s`)}</b>${o.notes ? `<p style="margin-top:6px;opacity:.9">${esc(o.notes)}</p>` : ''}<small>${t('doctor.completedAt', { date: esc(shortDate(o.at)), time: esc(dfmt(o.at, { hour: 'numeric', minute: '2-digit' })) })}</small>`, OUTCOME_ICON[o.result], 'dark');
  }
  return `<div class="card"><div class="ct">${t('doctor.outcomeTitle')}</div>
    <div class="oc-opts">${['normal', 'followup', 'referred'].map(k => `<button class="oc-opt o-${k} ${S.result === k ? 'on' : ''}" data-act="result" data-id="${k}" aria-pressed="${S.result === k}">
      <span class="k-ic">${icon(OUTCOME_ICON[k], 18)}</span><b>${t(`outcome.${k}.t`)}</b><small>${t(`outcome.${k}.s`)}</small></button>`).join('')}</div>
    <div class="notes"><label for="notes">${t('doctor.notes')}</label><textarea id="notes" maxlength="600" placeholder="${esc(t('doctor.notesPh'))}">${esc(S.notes)}</textarea></div>
    <div class="oc-foot"><span class="fine" style="margin:0">${S.result ? '' : t('doctor.pickResult')}</span>
      <button class="btn-primary" data-act="complete" ${S.result ? '' : 'disabled'}>${icon('check', 18)}${t('doctor.complete')}</button></div>
  </div>`;
}

function page() {
  return `<div class="page-hd"><div><h1>${t('doctor.hello', { name: S.me ? nm(S.me) : '' })}</h1>
      <p id="helloSub">${helloSub()}</p></div>
    <span class="live"><i></i>${esc(dfmt(ymd(new Date()), { weekday: 'long', day: 'numeric', month: 'long' }))}</span></div>
  <div class="dpane"><div class="aplist" id="listPane">${S.list ? listPane() : '<div class="sk" style="height:300px"></div>'}</div>
  <section class="dossier" id="dossier">${dossier()}</section></div>`;
}

/* ---------------- render + data ---------------- */
function render(anim = true) {
  applyDir();
  const root = $('#root');
  if (!UI.token) { root.innerHTML = loginView(); return; }
  const prev = anim ? 0 : window.scrollY;
  root.innerHTML = shell(page());
  runAnim(root, anim);
  if (!anim) window.scrollTo(0, prev);
}

function renderList() {
  const pane = $('#listPane');
  if (pane) pane.innerHTML = listPane();
  const side = $('.side');
  if (side) side.outerHTML = sideHTML();
  const sub = $('#helloSub');
  if (sub) sub.textContent = helloSub();
}

function renderDossier(anim) {
  const box = $('#dossier');
  if (!box) return;
  box.innerHTML = dossier();
  runAnim(box, anim);
}

async function loadList(first) {
  const list = await api('/api/doctor/appointments');
  const sig = JSON.stringify(list);
  if (sig === S.sig) return;
  S.sig = sig;
  const ids = new Set(list.map(a => a.id));
  if (S.known) {
    list.filter(a => !S.known.has(a.id) && a.status === 'booked').forEach(a => {
      S.fresh.add(a.id);
      toast(t('doctor.newBooking', { name: nm(a.patient), date: dayLabel(a.date), time: a.time }), 'bell');
    });
  }
  S.known = ids;
  S.list = list;
  if (first) {
    render(true);
    if (!S.sel) { const firstUp = list.find(a => a.status === 'booked'); if (firstUp) select(firstUp.id); }
  } else {
    renderList();
  }
}

async function select(id, silent) {
  S.sel = id; S.detail = null; S.result = null; S.notes = '';
  S.fresh.delete(id);
  if (!silent) { renderList(); renderDossier(false); }
  const d = await api('/api/doctor/appointment/' + encodeURIComponent(id));
  if (S.sel !== id) return;
  S.detail = d;
  renderDossier(true);
}

let poller = null;
async function start() {
  S.me = await api('/api/doctor/me');
  render();
  await loadList(true);
  clearInterval(poller);
  poller = setInterval(() => { if (UI.token) loadList(false).catch(() => {}); }, 4000);
}

async function complete() {
  const id = S.sel;
  try {
    await api(`/api/doctor/appointment/${encodeURIComponent(id)}/complete`, { method: 'POST', body: JSON.stringify({ result: S.result, notes: S.notes }) });
  } catch (e) { toast(e.message, 'alert'); return; }
  toast(t('doctor.toastDone'));
  S.detail = await api('/api/doctor/appointment/' + encodeURIComponent(id));
  S.sig = '';
  await loadList(false);
  renderDossier(false);
}

function signOut() {
  if (UI.token) fetch(API_BASE + '/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + UI.token } }).catch(() => {});
  setToken(null); clearInterval(poller);
  Object.assign(S, { me: null, list: null, sel: null, detail: null, known: null, fresh: new Set(), sig: '', acct: null });
  boot();
}
UI.onAuthLost = signOut;

async function boot() {
  if (UI.token) return start().catch(() => {});
  S.accounts = await api('/api/demo/accounts');
  render();
}

document.addEventListener('submit', async e => {
  if (e.target.dataset.form === 'ask') { e.preventDefault(); runAsk($('#askIn').value); return; }
  if (e.target.dataset.form !== 'login') return;
  e.preventDefault();
  try {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ id: S.acct, pin: $('#pinIn').value }) });
    setToken(r.token); start();
  } catch {
    $('#loginMsg').innerHTML = `<span class="err">${t('common.pinWrong')}</span>`;
    $('#pinIn').value = ''; $('#pinIn').focus();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'notes') S.notes = e.target.value;
  if (e.target.id === 'askIn' && S.sel) S.ask[S.sel] = { ...(S.ask[S.sel] || {}), q: e.target.value };
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'lang': setLangPref(isAr() ? 'en' : 'ar'); render(false); break;
    case 'pickAcct': S.acct = id; render(false); setTimeout(() => $('#pinIn')?.focus(), 0); break;
    case 'signOut': signOut(); break;
    case 'tab': {
      S.tab = id;
      const first = visible()[0];
      S.sel = null; S.detail = null;
      render();
      if (first) select(first.id);
      break;
    }
    case 'select': select(id); break;
    case 'result': S.result = id; renderDossier(false); break;
    case 'view': S.view = id; renderDossier(true); break;
    case 'aiBrief': runBrief(id === 'refresh'); break;
    case 'askSuggest': runAsk(id); break;
    case 'condFilter': S.condFilter = id; renderDossier(false); break;
    case 'complete': complete(); break;
  }
});

boot();
