'use strict';
/* DoH / ADPHC programme console: who is flagged, invite them with matched doctors,
   and follow each resident through booking to outcome. */

const S = { page: 'overview', ov: null, rows: null, filter: 'all', drawer: null, mode: null, match: {}, sel: {}, detail: {}, chan: { app: true, sms: true }, sig: '', ai: {}, pask: { q: '' } };

const FEAT_REASON = { genetic_flag: 'genetic', family_history: 'family', obesity: 'obesity', diabetes: 'diabetes', screening_overdue: 'overdue' };

function srcLabel(id, res) {
  const parts = id.split(':'), k = parts[0], v = parts[1];
  const c = S.drawer && S.detail[S.drawer];
  switch (k) {
    case 'S': return t('ai.src.' + v);
    case 'F': return v === 'age' ? t('ai.src.age') : t('reasons.' + FEAT_REASON[v]);
    case 'R': return t('rel.' + v);
    case 'H': { const h = c && c.history[+v]; return h ? `${t('clinical.tests.' + h.test)} · ${h.date.slice(0, 4)}` : id; }
    case 'D': { const m = /Matched doctor: (.+?) \(/.exec((res && res.evidence[id]) || ''); return m ? m[1] : id; }
    case 'P': { const r = S.rows && S.rows.find(x => x.mrn === v); return r ? nm(r) : id; }
    case 'K': return v === 'declined' ? t('status.declined') : t(`doh.kpi.${v}.t`);
    case 'G': return t({ stage: 'doh.stageTitle', cases: 'doh.casesTitle', obesity: 'doh.obesityTitle' }[v]);
  }
  return id;
}

function aiExplainCard(r) {
  const st = S.ai[r.mrn] || { status: 'idle' };
  const res = st.res, label = id => srcLabel(id, res);
  let body;
  if (st.status === 'loading') body = aiLoading();
  else if (st.status === 'error') body = aiError(st.code, 'aiExplain', r.mrn);
  else if (st.status === 'done') {
    const D = res.data;
    body = `${D.headline ? `<p class="ai-headline">${esc(D.headline.text)}</p>` : ''}
      ${aiSection(t('ai.sec.why'), 'activity', D.why_flagged, res, label)}
      ${aiSection(t('ai.sec.confidence'), 'shield', D.confidence ? [D.confidence] : [], res, label)}
      ${aiSection(t('ai.sec.outreach'), 'send', D.outreach, res, label)}
      ${aiNotes(t('ai.sec.caveats'), 'info', D.caveats)}
      ${aiFooter(res)}`;
  } else {
    body = `<p class="ai-intro">${t('ai.dohIntro')}</p><button class="btn-primary" data-act="aiExplain" data-id="${r.mrn}">${icon('sparkle', 18)}${t('ai.explain')}</button>`;
  }
  return `<div class="card ai-card">
    <div class="ai-hd"><span class="ai-logo">${icon('sparkle', 18)}</span><div class="grow"><b>${t('ai.dohTitle')}</b><small>${t('ai.dohSub')}</small></div>
      ${st.status === 'done' ? `<div class="ai-actions">${aiBadge(res.verification)}<button class="btn-small ghost" data-act="aiExplain" data-id="${r.mrn}" data-refresh="1">${icon('refresh', 13)}${t('ai.regenerate')}</button></div>` : ''}</div>
    ${body}</div>`;
}

function programmeAskCard() {
  const st = S.pask;
  const extra = st.status === 'done' && st.res.data.residents && st.res.data.residents.length
    ? `<div class="ai-follow"><small>${t('ai.residentsLbl')}</small><div class="chips-wrap">${st.res.data.residents.map(m => { const r = S.rows && S.rows.find(x => x.mrn === m); return r ? `<button class="chip" data-act="open" data-id="${m}"><span class="av sm av-${r.tier}" style="width:20px;height:20px;font-size:9px">${esc(initials(r))}</span>${esc(nm(r))}</button>` : ''; }).join('')}</div></div>`
    : '';
  return `<div class="card ai-card" style="margin-bottom:18px">
    <div class="ai-hd"><span class="ai-logo">${icon('sparkle', 18)}</span><div class="grow"><b>${t('ai.progTitle')}</b><small>${t('ai.progSub')}</small></div></div>
    ${aiAskBlock(st, t('ai.progPh'), t('ai.suggestDoh'), id => srcLabel(id, st.res), 'ai.notInData', extra)}
  </div>`;
}

async function runExplain(mrn, refresh) {
  S.ai[mrn] = { status: 'loading' };
  renderDrawer(false);
  try {
    const res = await api(`/api/doh/resident/${encodeURIComponent(mrn)}/ai/explain`, { method: 'POST', body: JSON.stringify({ lang: UI.lang, refresh }) });
    S.ai[mrn] = { status: 'done', res };
  } catch (e) {
    S.ai[mrn] = { status: 'error', code: e.code };
  }
  if (S.drawer === mrn) renderDrawer(false);
}

async function runProgrammeAsk(q) {
  q = (q || '').trim();
  if (q.length < 3) return;
  S.pask = { q, asked: q, status: 'loading' };
  render(false);
  try {
    const res = await api('/api/doh/ai/ask', { method: 'POST', body: JSON.stringify({ question: q, lang: UI.lang }) });
    S.pask = { q: '', asked: q, status: 'done', res };
  } catch (e) {
    S.pask = { q, asked: q, status: 'error', code: e.code };
  }
  render(false);
}
const INVITABLE = ['flagged', 'routine', 'declined', 'snoozed'];
const FILTER = { all: () => true, flagged: r => r.status === 'flagged', invited: r => ['notified', 'snoozed', 'declined'].includes(r.status), booked: r => r.status === 'booked', seen: r => r.status === 'completed' };

/* ---------------- login ---------------- */
function loginView() {
  return `<div class="lang-corner">${langBtn()}</div>
  <div class="login"><form class="login-card" data-form="login" autocomplete="off">
    <div class="logo-dot"></div>
    <h1>${t('doh.loginTitle')}</h1><p class="muted">${t('doh.loginSub')}</p>
    <div class="field"><label for="staff">${t('doh.staffId')}</label><input id="staff" value="ADPHC-0142" readonly></div>
    <div class="field"><label for="pinIn">${t('doh.pin')}</label><input id="pinIn" type="password" inputmode="numeric" maxlength="4" autocomplete="one-time-code" required></div>
    <p class="fine" id="loginMsg">${t('common.pinHint', { pin: '2026' })}</p>
    <button class="btn-primary wide" type="submit">${t('common.signIn')}</button>
  </form></div>`;
}

/* ---------------- shell ---------------- */
function shell(body) {
  const needs = S.rows ? S.rows.filter(r => r.status === 'flagged').length : 0;
  return `<div class="shell">
    <aside class="side">
      <div class="brand"><span class="logo-dot"></span><div><b>Sabq Kashf</b><small>${t('doh.sub')}</small></div></div>
      <button class="navlink ${S.page === 'overview' ? 'on' : ''}" data-act="page" data-id="overview">${icon('grid', 20)}${t('doh.nav.overview')}</button>
      <button class="navlink ${S.page === 'outreach' ? 'on' : ''}" data-act="page" data-id="outreach">${icon('megaphone', 20, 'flip')}${t('doh.nav.outreach')}${needs ? `<span class="count num">${needs}</span>` : ''}</button>
      <div class="side-foot">
        <div class="me-chip"><span class="av sm av-ink">${icon('building', 18)}</span><div><b>${t('doh.user')}</b><small class="num">ADPHC-0142</small></div></div>
        <div class="side-actions">${langBtn()}<button class="icbtn" data-act="signOut" aria-label="${esc(t('common.signOut'))}">${icon('logout', 20, 'flip')}</button></div>
        <button class="textbtn" data-act="reset">${icon('refresh', 14)}<span>${t('doh.reset')}</span></button>
      </div>
    </aside>
    <main class="main" id="main">${body}</main>
  </div>`;
}

const kpi = (k, ic, v, alert) => `<div class="card kpi ${alert ? 'alert' : ''}"><div class="k-lbl"><span class="k-ic">${icon(ic, 18)}</span>${t(`doh.kpi.${k}.t`)}</div>
  <div class="big"><span data-count="${v}">${v}</span></div><small>${t(`doh.kpi.${k}.s`)}</small></div>`;

function overview() {
  const O = S.ov;
  if (!O) return skeleton();
  const k = O.kpi, f = O.funnel, steps = ['flagged', 'invited', 'booked', 'seen'];
  const e = O.stage.early_pct;
  return `<div class="page-hd"><div><h1>${t('doh.ovTitle')}</h1><p>${t('doh.ovSub')}</p></div><span class="live"><i></i>${t('doh.live')}</span></div>
  <div class="grid g4">${kpi('flagged', 'alert', k.flagged, k.flagged > 0)}${kpi('invited', 'send', k.invited)}${kpi('booked', 'calendar', k.booked)}${kpi('seen', 'checkCircle', k.seen)}</div>
  <div style="margin-bottom:18px">${k.flagged
    ? `<div class="banner">${icon('megaphone', 22, 'flip')}<div class="grow"><p>${t('doh.insight', { n: k.flagged })}</p></div><button class="btn-ghost" data-act="page" data-id="outreach">${t('doh.insightCta')}</button></div>`
    : banner(`<p>${t('doh.allInvited')}</p>`, 'checkCircle')}</div>
  ${programmeAskCard()}
  <div class="grid g3">
    <div class="card"><div class="ct">${t('doh.funnelTitle')}</div>
      ${hbars(steps.map((s, i) => ({ label: t('doh.funnel.' + s), v: f[s], color: i === 3 ? G : '#7FD1A6', sub: i && f[steps[i - 1]] ? `<span class="num">${Math.round(f[s] / f[steps[i - 1]] * 100)}%</span> ${t('doh.ofPrev')}` : '' })))}
    </div>
    <div class="card"><div class="ct">${t('doh.mixTitle')}</div>
      <div class="mix">${segRing(['critical', 'watch', 'routine'].map(x => ({ v: O.tiers[x], color: TIER_COLOR[x] })), 150, 16, `<b class="num">${O.residents}</b><small>${t('doh.residents')}</small>`)}
        <div class="legend">${['critical', 'watch', 'routine'].map(x => `<span><i style="background:${TIER_COLOR[x]}"></i>${t('tiers.' + x)} <b class="num">${O.tiers[x]}</b></span>`).join('')}</div></div>
      <p class="fine">${t('doh.mixSub')}</p>
    </div>
    <div class="card"><div class="ct">${t('doh.modelTitle')}</div>
      <div class="model-row"><div><div class="mid-num">${O.population.breast.critical}%</div><span>${t('visit.breast_mammogram.T')}</span></div>
        <div><div class="mid-num">${O.population.colorectal.critical}%</div><span>${t('visit.crc_fit.T')}</span></div></div>
      <p class="fine">${t('doh.modelSub')}</p>
    </div>
  </div>
  <div class="grid g3">
    <div class="card"><div class="ct">${t('doh.stageTitle')}</div>
      <div class="stage-nums"><div><div class="mid-num">${e}%</div><span>${t('doh.early')}</span></div><div><div class="mid-num late">${100 - e}%</div><span>${t('doh.late')}</span></div></div>
      <div class="stage-bar"><i class="e" style="--w:${e}%"></i><i class="l" style="--w:${100 - e}%"></i><span class="target" style="left:${O.stage.target}%"><em>${t('doh.target', { n: O.stage.target })}</em></span></div>
      <p class="fine">${t('doh.stageSrc')}</p></div>
    <div class="card"><div class="ct">${t('doh.casesTitle')}</div>
      ${hbars(O.cases_by_site.map(([s, v], i) => ({ label: t('doh.sites')[s] || s, v, color: i === 0 ? TIER_COLOR.critical : '#F2A4A6' })))}
      <p class="fine">${t('doh.casesSrc')}</p></div>
    <div class="card"><div class="ct">${t('doh.obesityTitle')}</div>
      ${bars(O.obesity_by_age.map(([a, v], i) => ({ label: a, v, top: v + '%', color: i === 3 ? TIER_COLOR.watch : '#E6C46C' })), { h: 170, max: 55 })}
      <p class="fine">${t('doh.obesitySrc')}</p></div>
  </div>
  <p class="fine">${icon('info', 14)}${t('common.demo')}</p>`;
}

function statusDetail(r) {
  if (r.status === 'booked' && r.appointment) return t('doh.bookedWith', { date: dayLabel(r.appointment.date), time: r.appointment.time, doctor: nm(r.appointment.doctor) });
  if (r.status === 'completed' && r.appointment) return t('doh.seenOutcome', { outcome: t(`outcome.${r.appointment.outcome}.t`), date: shortDate(r.appointment.outcome_at) });
  if (r.invite) return t('doh.invitedOn', { date: shortDate(r.invite.sent_at) });
  return '';
}

function outreach() {
  if (!S.rows) return skeleton();
  const counts = Object.fromEntries(Object.keys(FILTER).map(k => [k, S.rows.filter(FILTER[k]).length]));
  const rows = S.rows.filter(FILTER[S.filter]);
  return `<div class="page-hd"><div><h1>${t('doh.outTitle')}</h1><p>${t('doh.outSub')}</p></div><span class="live"><i></i>${t('doh.live')}</span></div>
  <div class="fchips">${Object.keys(FILTER).map(k => `<button class="fchip ${S.filter === k ? 'on' : ''}" data-act="filter" data-id="${k}" aria-pressed="${S.filter === k}">${t('doh.filters.' + k)}<span class="num">${counts[k]}</span></button>`).join('')}</div>
  <div class="rt">
    <div class="rt-head"><span>${t('doh.cols.resident')}</span><span>${t('doh.cols.priority')}</span><span>${t('doh.cols.reasons')}</span><span>${t('doh.cols.check')}</span><span>${t('doh.cols.status')}</span><span></span></div>
    ${rows.map(r => `<div class="rt-row ${S.drawer === r.mrn ? 'sel' : ''}" data-act="open" data-id="${r.mrn}" role="button" tabindex="0">
      <div class="who"><span class="av av-${r.tier}">${esc(initials(r))}</span><div><b>${esc(nm(r))}</b><small><span class="num">${r.age}</span> · ${t('clinical.sex.' + r.sex)} · ${t('areas.' + r.area)}</small></div></div>
      <div class="prio"><span class="pill ${r.tier}">${t('tiers.' + r.tier)}</span><span class="num">${pct(r.risk)}%</span></div>
      <div class="chips-wrap">${r.reasons.map(x => `<span class="rchip">${icon(REASON_ICON[x], 13)}${t('reasons.' + x)}</span>`).join('')}</div>
      <div class="cell-2"><b>${t(`visit.${r.visit_type}.T`)}</b><small>${t(`visit.${r.visit_type}.s`)}</small></div>
      <div class="st-cell"><span class="pill s-${r.status}">${t('status.' + r.status)}</span><small>${esc(statusDetail(r))}</small></div>
      <div class="act-cell">${INVITABLE.includes(r.status)
        ? `<button class="btn-small" data-act="invite" data-id="${r.mrn}">${icon('send', 14, 'flip')}${r.status === 'declined' || r.status === 'snoozed' ? t('doh.inviteAgain') : t('doh.invite')}</button>`
        : `<button class="btn-small ghost" data-act="open" data-id="${r.mrn}">${t('doh.view')}</button>`}</div>
    </div>`).join('')}
  </div>
  <p class="fine">${icon('lock', 14)}${t('doh.privacyNote')}</p>`;
}

function skeleton() {
  return `<div class="sk" style="height:70px;margin-bottom:22px;max-width:420px"></div><div class="grid g4">${'<div class="sk" style="height:180px"></div>'.repeat(4)}</div><div class="grid g3">${'<div class="sk" style="height:240px"></div>'.repeat(3)}</div>`;
}

/* ---------------- drawer ---------------- */
function drawerHead(r) {
  return `<div class="dr-hd"><span class="av lg av-${r.tier}">${esc(initials(r))}</span>
    <div class="grow"><b>${esc(nm(r))}</b><small><span class="num">${r.age}</span> · ${t('clinical.sex.' + r.sex)} · ${t('areas.' + r.area)} · ${t('langs.' + r.lang)}</small></div>
    <button class="icbtn" data-act="closeDrawer" aria-label="${esc(t('common.close'))}">${icon('x', 20)}</button></div>`;
}

function recCard(r) {
  return `<div class="card"><div class="ct">${t('doh.recommended')}</div>
    <div class="rec"><span class="k-ic">${icon('heart', 20)}</span><div><b>${t(`visit.${r.visit_type}.T`)}</b><small>${t(`visit.${r.visit_type}.s`)}</small></div></div>
    <div class="chips-wrap" style="margin-top:14px"><span class="pill ${r.tier}">${t('tiers.' + r.tier)} · <span class="num">${pct(r.risk)}%</span></span>${r.reasons.map(x => `<span class="rchip">${icon(REASON_ICON[x], 13)}${t('reasons.' + x)}</span>`).join('')}</div></div>`;
}

function riskSection(r) {
  const c = S.detail[r.mrn];
  if (!c) return '<div class="sk" style="height:220px;margin-bottom:14px"></div><div class="sk" style="height:260px;margin-bottom:14px"></div>';
  const n = pct(c.risk);
  const facts = c.factors.filter(f => f.feature !== 'age');
  const sources = [...new Set(facts.map(f => f.source))];
  const unverified = facts.length - c.confidence.verified;
  const time = dfmt(c.accessed_at, { hour: 'numeric', minute: '2-digit' });
  return `<div class="card">
    <div class="ct-row"><div><div class="ct">${t('clinical.riskTitle')}</div><div class="ct-sub">${t('clinical.site.' + c.cancer_type)}</div></div><span class="pill ${c.tier}">${t('tiers.' + c.tier)}</span></div>
    <div class="risk-hero">
      <div><div class="big"><span data-count="${n}">${n}</span><sup>%</sup></div><div class="big-lbl">${t('clinical.likelihoodOf', { site: t('clinical.siteShort.' + c.cancer_type) })}</div></div>
      <div class="dots-wrap">${dots(n, c.tier)}<small>${t('clinical.outOf', { n })}</small></div>
    </div></div>
  <div class="card"><div class="ct-row"><div class="ct">${t('clinical.whyTitle')}</div>${icon('activity', 20, 'g')}</div>${factorList(c.factors)}</div>
  <div class="card"><div class="ct">${t('clinical.familyTitle')}</div>
    ${c.relatives.some(x => x.affected) ? familyTree(c.relatives, 'clinical', nm(c).split(' ')[0]) : `<p class="muted">${t('clinical.noFamily')}</p>`}</div>
  <div class="card"><div class="ct">${t('clinical.historyTitle')}</div>${historyTrack(c)}</div>
  <div class="card"><div class="ct">${t('clinical.trust.title')}</div>
    <div class="trow"><span class="k-ic ${unverified ? 'warn' : ''}">${icon(unverified ? 'alert' : 'checkCircle', 18)}</span><div><b>${t('clinical.trust.verified', { v: c.confidence.verified, t: facts.length })}</b>
      <small>${t('clinical.confidence')}: ${t('clinical.conf.' + c.confidence.level)}${unverified ? ` · <span class="selfrep">${t('clinical.trust.needsVerify', { n: unverified })}</span>` : ''}</small></div></div>
    <div class="trow"><span class="k-ic">${icon('file', 18)}</span><div><b>${t('clinical.trust.sources')}</b>
      <div class="chips-wrap" style="margin-top:6px">${sources.map(s => `<span class="chip grey">${t('clinical.sources.' + s)}</span>`).join('')}</div></div></div>
    <div class="trow"><span class="k-ic">${icon('shield', 18)}</span><div><b>${t('clinical.trust.guideline')}</b></div></div>
    <div class="trow"><span class="k-ic">${icon('steth', 18)}</span><div><b>${t('clinical.trust.notDx')}</b></div></div>
    <p class="fine">${icon('lock', 13)}${t('clinical.trust.logged', { time: esc(time) })}</p>
  </div>`;
}

async function loadDetail(mrn) {
  if (S.detail[mrn]) return;
  S.detail[mrn] = await api('/api/doh/resident/' + encodeURIComponent(mrn));
  if (S.drawer === mrn) renderDrawer(false, true);
}

function inviteDrawer(r) {
  const m = S.match[r.mrn];
  const sel = S.sel[r.mrn] || new Set();
  const L = r.lang;
  const type = t(`visit.${r.visit_type}.t`, null, L);
  return `${drawerHead(r)}${aiExplainCard(r)}${riskSection(r)}${recCard(r)}
  <div class="card"><div class="ct">${t('doh.doctorsTitle')}</div><div class="ct-sub">${t('doh.doctorsSub')}</div>
    ${!m ? '<div class="sk" style="height:200px;margin-top:12px"></div>' : m.doctors.map(d => `<button class="docpick ${sel.has(d.id) ? 'on' : ''}" data-act="toggleDoc" data-id="${d.id}" aria-pressed="${sel.has(d.id)}">
      <span class="cbox">${icon('check', 14)}</span><span class="av sm">${esc(initials(d))}</span>
      <span class="grow"><b>${esc(nm(d))}</b><small>${t('specialties.' + d.specialty)} · ${t('clinics.' + d.clinic)}</small>
        <span class="chips-wrap">${d.lang_match ? `<span class="chip">${icon('check', 11)}${t('doh.speaks', { lang: t('langs.' + r.lang) })}</span>` : ''}${d.near ? `<span class="chip">${icon('pin', 11)}${t('doh.near')}</span>` : ''}${d.next ? `<span class="chip grey">${t('doh.nextSlot', { date: dayLabel(d.next.date) })}</span>` : ''}</span></span>
    </button>`).join('')}
  </div>
  <div class="card"><div class="ct">${t('doh.previewTitle', { name: esc(nm(r).split(' ')[0]) })}</div>
    <div class="phone-prev" dir="${L === 'ar' ? 'rtl' : 'ltr'}" lang="${L}">
      <div class="np"><span class="app-ic">${icon('heart', 18)}</span><span><small>${t('app.pushFrom', null, L)}</small><b>${esc(t('app.push', { type }, L))}</b></span></div>
      <div class="np"><span class="app-ic" style="background:var(--g-soft);color:var(--g)">${icon('building', 18)}</span><span><small>${t('app.from', null, L)}</small><b>${esc(t('app.heading', { type }, L))}</b></span></div>
    </div></div>
  <div class="card"><div class="ct">${t('doh.channels')}</div>
    <div class="toggle-row"><span>${icon('phone', 18)}${t('doh.appNotif')}</span><button class="switch ${S.chan.app ? 'on' : ''}" data-act="chan" data-id="app" aria-pressed="${S.chan.app}" aria-label="${esc(t('doh.appNotif'))}"><i></i></button></div>
    <div class="toggle-row"><span>${icon('sms', 18)}${t('doh.sms')}</span><button class="switch ${S.chan.sms ? 'on' : ''}" data-act="chan" data-id="sms" aria-pressed="${S.chan.sms}" aria-label="${esc(t('doh.sms'))}"><i></i></button></div>
  </div>
  <button class="btn-primary wide" data-act="send" ${sel.size && (S.chan.app || S.chan.sms) ? '' : 'disabled'}>${icon('send', 18, 'flip')}${t('doh.send')}</button>
  <p class="fine center">${sel.size ? '' : t('doh.needDoctor')}</p>`;
}

function viewDrawer(r) {
  const st = r.status, a = r.appointment;
  const order = ['flagged', 'notified', 'booked', 'completed'];
  const reached = st === 'declined' || st === 'snoozed' ? 1 : Math.max(0, order.indexOf(st));
  const steps = [
    { k: 'flagged', ic: 'activity', title: t('doh.ev.flagged') },
    { k: 'invited', ic: 'send', title: st === 'declined' ? t('doh.ev.declined') : st === 'snoozed' ? t('doh.ev.snoozed') : t('doh.ev.invited'), sub: r.invite ? esc(dfmt(r.invite.sent_at, { day: 'numeric', month: 'short' })) : '' },
    { k: 'booked', ic: 'calendar', title: a ? t('doh.ev.booked', { doctor: esc(nm(a.doctor)) }) : t('status.booked'), sub: a ? `${esc(dfmt(a.date, { weekday: 'short', day: 'numeric', month: 'short' }))} · <span class="num">${a.time}</span>` : '' },
    { k: 'seen', ic: 'checkCircle', title: a && a.outcome ? t('doh.ev.seen', { outcome: t(`outcome.${a.outcome}.t`) }) : t('status.completed'), sub: a && a.outcome_at ? esc(shortDate(a.outcome_at)) : '' }
  ];
  return `${drawerHead(r)}
  <div class="card"><div class="ct">${t('doh.journeyTitle')}</div>
    <ol class="steps">${steps.map((s, i) => `<li class="${i <= reached ? 'done' : i === reached + 1 ? 'now' : ''}"><span class="sd">${icon(i <= reached ? 'check' : s.ic, 14)}</span><div><b>${s.title}</b>${s.sub ? `<small>${s.sub}</small>` : ''}</div></li>`).join('')}</ol></div>
  ${st === 'notified' ? `<div style="margin-bottom:14px">${banner(`<p>${t('doh.waiting', { name: esc(nm(r).split(' ')[0]) })}</p>`, 'clock', 'dark')}</div>` : ''}
  ${aiExplainCard(r)}
  ${riskSection(r)}
  ${recCard(r)}
  ${INVITABLE.includes(st) ? `<button class="btn-primary wide" data-act="invite" data-id="${r.mrn}">${icon('send', 18, 'flip')}${t('doh.inviteAgain')}</button>` : ''}
  <p class="fine center">${icon('lock', 14)}${t('doh.privacyNote')}</p>`;
}

function renderDrawer(opening = false, anim = false) {
  const host = $('#drawerHost');
  const r = S.drawer && S.rows && S.rows.find(x => x.mrn === S.drawer);
  if (!r) { host.innerHTML = ''; host.className = ''; return; }
  const scroll = $('.drawer', host)?.scrollTop || 0;
  host.className = opening ? 'opening' : '';
  host.innerHTML = `<div class="drawer-bg" data-act="closeDrawer"></div><aside class="drawer" role="dialog" aria-modal="true">${S.mode === 'invite' ? inviteDrawer(r) : viewDrawer(r)}</aside>`;
  if (!opening) $('.drawer', host).scrollTop = scroll;
  runAnim(host, opening || anim);
}

/* ---------------- render + data ---------------- */
function render(anim = true) {
  applyDir();
  const root = $('#root');
  if (!UI.token) { root.innerHTML = loginView(); $('#drawerHost').innerHTML = ''; return; }
  const prev = anim ? 0 : window.scrollY;
  const focused = document.activeElement && document.activeElement.id === 'askIn' ? document.activeElement.selectionStart : null;
  root.innerHTML = shell(S.page === 'overview' ? overview() : outreach());
  runAnim(root, anim);
  if (!anim) window.scrollTo(0, prev);
  if (focused != null && $('#askIn')) { const el = $('#askIn'); el.focus(); el.setSelectionRange(focused, focused); }
  renderDrawer(false);
}

async function load(anim) {
  const [ov, rows] = await Promise.all([api('/api/doh/overview'), api('/api/doh/residents')]);
  const sig = JSON.stringify([ov, rows]);
  if (sig === S.sig) return;
  S.sig = sig; S.ov = ov; S.rows = rows;
  render(anim);
}

let poller = null;
function start() {
  render();
  load(true).catch(() => {});
  clearInterval(poller);
  poller = setInterval(() => { if (UI.token && S.mode !== 'invite') load(false).catch(() => {}); }, 4000);
}

async function openInvite(mrn) {
  S.drawer = mrn; S.mode = 'invite';
  renderDrawer(true);
  loadDetail(mrn).catch(() => {});
  if (!S.match[mrn]) {
    S.match[mrn] = await api('/api/doh/match/' + encodeURIComponent(mrn));
    S.sel[mrn] = new Set(S.match[mrn].doctors.map(d => d.id));
  }
  if (S.drawer === mrn) renderDrawer(false);
}

async function send() {
  const r = S.rows.find(x => x.mrn === S.drawer);
  const channels = Object.keys(S.chan).filter(k => S.chan[k]);
  try {
    await api('/api/doh/invite', { method: 'POST', body: JSON.stringify({ mrn: r.mrn, doctors: [...S.sel[r.mrn]], channels }) });
  } catch (e) { toast(e.message, 'alert'); return; }
  toast(t('doh.sent', { name: nm(r) }), 'send');
  S.mode = 'view';
  S.sig = '';
  await load(false);
}

function closeDrawer() { S.drawer = null; S.mode = null; renderDrawer(); render(false); }

function signOut() {
  if (UI.token) fetch(API_BASE + '/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + UI.token } }).catch(() => {});
  setToken(null); clearInterval(poller);
  Object.assign(S, { ov: null, rows: null, drawer: null, mode: null, sig: '' });
  render();
}
UI.onAuthLost = signOut;

document.addEventListener('input', e => { if (e.target.id === 'askIn') S.pask.q = e.target.value; });

document.addEventListener('submit', async e => {
  if (e.target.dataset.form === 'ask') { e.preventDefault(); runProgrammeAsk($('#askIn').value); return; }
  if (e.target.dataset.form !== 'login') return;
  e.preventDefault();
  try {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ pin: $('#pinIn').value }) });
    setToken(r.token); start();
  } catch {
    $('#loginMsg').innerHTML = `<span class="err">${t('common.pinWrong')}</span>`;
    $('#pinIn').value = ''; $('#pinIn').focus();
  }
});

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'lang': setLangPref(isAr() ? 'en' : 'ar'); render(false); break;
    case 'signOut': signOut(); break;
    case 'page': S.page = id; S.drawer = null; S.mode = null; render(); window.scrollTo(0, 0); break;
    case 'filter': S.filter = id; render(false); break;
    case 'open': {
      const r = S.rows.find(x => x.mrn === id);
      if (r.status === 'flagged') openInvite(id);
      else { S.drawer = id; S.mode = 'view'; render(false); renderDrawer(true); loadDetail(id).catch(() => {}); }
      break;
    }
    case 'invite': openInvite(id); break;
    case 'closeDrawer': closeDrawer(); break;
    case 'toggleDoc': { const s = S.sel[S.drawer]; s.has(id) ? s.delete(id) : s.add(id); renderDrawer(false); break; }
    case 'chan': S.chan[id] = !S.chan[id]; renderDrawer(false); break;
    case 'send': send(); break;
    case 'aiExplain': runExplain(id, !!el.dataset.refresh); break;
    case 'askSuggest': runProgrammeAsk(id); break;
    case 'reset': await api('/api/doh/reset', { method: 'POST' }); S.sig = ''; S.drawer = null; S.mode = null; S.detail = {}; S.ai = {}; await load(false); toast(t('doh.resetDone'), 'refresh'); break;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.drawer) closeDrawer();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.rt-row')) { e.preventDefault(); e.target.click(); }
});

if (UI.token) start(); else render();
