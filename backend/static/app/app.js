'use strict';
/* Resident app. Shows invitations, doctor choice, booking, preparation and results —
   never risk scores, family history or genetic results. */

const TABS = [['home', 'home'], ['visit', 'calendar'], ['family', 'users'], ['me', 'shield']];
const S = {
  me: null, tab: 'home', screen: null, // screen: invite | doctors | slots | booked
  doctors: null, slots: null, doc: null, day: null, time: null,
  prep: new Set(), invite: new Set(['sister', 'daughter']),
  sheet: null, accounts: null, acct: null, lastSig: ''
};
const pin = makePin(code => doLogin(code));

/* ---------------- views ---------------- */
function header(a, b) {
  return `<header class="hdr"><div class="hello"><span>${esc(a)}</span><b>${esc(b)}</b></div>
    <div class="hdr-ic">${langBtn()}<button class="icbtn" data-act="signOut" aria-label="${esc(t('common.signOut'))}">${icon('logout', 20, 'flip')}</button></div></header>`;
}
const topnav = (title, back) => `<div class="topnav"><button class="icbtn" data-act="${back}" aria-label="${esc(t('common.back'))}">${icon('chevL', 22, 'flip')}</button><h2>${esc(title)}</h2><span class="sp"></span></div>`;
const vType = () => S.me.visit_type;
const typeLower = () => t(`visit.${vType()}.t`);
const firstName = () => nm(S.me).split(' ')[0];

function welcome() {
  return `<div class="scroll enter">
    <div class="hdr" style="align-items:center"><div class="brand"><span class="logo-dot"></span><b>SANAD</b></div>${langBtn()}</div>
    <h1 class="hero-title"><span>${t('app.tag1')}</span>${t('app.tag2')}</h1>
    <div class="welcome-art floaty">${heartArt(230, 'w')}</div>
    <button class="btn-primary wide" data-act="openAccounts">${icon('phone', 18)}${t('app.signInMobile')}</button>
    <p class="fine center" style="margin-top:16px">${t('common.demo')}</p>
  </div>`;
}

function sheetHTML() {
  if (S.sheet === 'accounts') {
    return `<div class="sheet-bg" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true">
      <div class="grab"></div><h3>${t('app.chooseAccount')}</h3>
      ${(S.accounts || []).map(a => `<button class="acct" data-act="pickAcct" data-id="${a.id}">
        <span class="av sm">${esc(initials(a))}</span><span class="grow"><b>${esc(nm(a))}</b><small class="num">${esc(a.phone)}</small></span>
        ${a.pending ? `<span class="pill s-notified">${t('app.newInvite')}</span>` : icon('chevR', 18, 'flip')}</button>`).join('')}
    </div>`;
  }
  const a = S.accounts.find(x => x.id === S.acct);
  return `<div class="sheet-bg" data-act="closeSheet"></div><div class="sheet center" role="dialog" aria-modal="true">
    <div class="grab"></div><h3>${t('app.pinTitle')}</h3>
    <p class="muted">${esc(nm(a))} · <span class="num">${esc(a.phone)}</span></p>
    <p class="muted" id="pinHint" data-hint="${esc(t('common.pinHint', { pin: '1111' }))}">${t('common.pinHint', { pin: '1111' })}</p>
    ${keypadHTML()}</div>`;
}

function journey(idx) {
  return `<ol class="journey">${t('app.journey').map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><span class="jdot">${i < idx ? icon('check', 14) : ''}</span>${s}</li>`).join('')}</ol>`;
}

function home() {
  const me = S.me, ap = me.appointment, inv = me.invitation;
  if (ap && ap.status === 'completed') return homeResults();
  if (ap && ap.status === 'booked') return homeBooked();
  if (inv && (inv.status === 'notified' || inv.status === 'snoozed')) return homeInvite();
  return homeEmpty();
}

function homeEmpty() {
  const inv = S.me.invitation;
  return `${header(t('app.hi', { name: firstName() }), t('app.subNone'))}
  <div class="empty-hero"><div class="floaty">${heartArt(200, 'e')}</div>
    <h2>${t('app.emptyTitle')}</h2><p class="para">${t('app.emptyText')}</p>
    ${inv && inv.status === 'declined' ? `<button class="btn-soft" style="margin-top:18px" data-act="openInvite">${t('app.cta')}</button>` : ''}
  </div>
  <p class="fine center" style="margin-top:28px">${icon('info', 14)}${t('app.emptyHint')}</p>`;
}

function homeInvite() {
  const inv = S.me.invitation;
  return `${header(t('app.hi', { name: firstName() }), t('app.subInvite'))}
  <section class="hero">
    <div class="hero-num"><div class="big">1</div><div class="big-lbl">${t('app.newInvite')}</div></div>
    <div class="hero-art floaty">${heartArt(252, 'i')}</div>
    <button class="float notif" data-act="openInvite">
      <span class="sender"><span class="badge-ic">${icon('building', 16)}</span>${t('app.from')}<time>${esc(dayLabel(inv.sent_at))}</time></span>
      <h3>${inv.status === 'notified' ? '<span class="new-dot"></span>' : ''}${t('app.heading', { type: typeLower() })}</h3>
      <p>${t(`visit.${vType()}.s`)} · ${t('app.duration', { n: S.me.duration })}</p>
      <span class="go">${t('app.seeDetails')}${icon('chevR', 18, 'flip')}</span>
    </button>
  </section>
  <div class="card"><div class="ct">${t('app.journeyTitle')}</div>${journey(0)}</div>
  ${banner(`<p>${t('app.banner')}</p>`)}`;
}

function homeBooked() {
  const ap = S.me.appointment, days = Math.max(0, dayDiff(ap.date));
  const total = S.me.prep.length, done = S.me.prep.filter(k => S.prep.has(k)).length;
  return `${header(t('app.hi', { name: firstName() }), t('app.subBooked'))}
  <section class="hero">
    <div class="hero-num"><div class="big"><span data-count="${days}">${days}</span></div><div class="big-lbl">${t('app.daysTo')}</div></div>
    <div class="hero-art floaty">${heartArt(252, 'b')}</div>
    <div class="float f1"><div class="f-lbl">${t('app.visitLbl')}</div><div class="f-val">${esc(dfmt(ap.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</div>${wave(160, 42, 2, 'h')}</div>
    <div class="float f2"><div class="f-top"><span class="f-lbl">${t('app.prepLbl')}</span>${icon('clipboard', 18, 'g')}</div>
      <div class="f-status">${t('app.status')}: <b>${ap.confirmed ? t('app.confirmedLbl') : t('app.onTrack')}</b></div>
      <div class="f-big">${done}<small>/${total}</small></div></div>
  </section>
  <div class="card"><div class="ct">${t('app.journeyTitle')}</div>${journey(2)}</div>
  ${banner(`<p>${t('app.banner')}</p>`)}`;
}

function homeResults() {
  const ap = S.me.appointment, o = ap.outcome;
  const color = o.result === 'normal' ? G : TIER_COLOR.watch;
  return `${header(t('app.hi', { name: firstName() }), t('app.subDone'))}
  <div class="card" style="text-align:center;padding-top:26px">
    <div class="results-ring">${ring(1, 132, 10, color, `<span style="color:${color}">${icon(OUTCOME_ICON[o.result], 44)}</span>`)}</div>
    <div class="tag" style="margin-bottom:12px">${t('app.resultsTitle')}</div>
    <h2 style="font-size:24px;font-weight:500;margin:0 0 6px">${t(`outcome.${o.result}.patient`)}</h2>
    <p class="para">${t(`outcome.${o.result}.next`, { n: o.recall_years })}</p>
    <p class="fine center" style="margin-top:14px">${icon('steth', 14)}${t('app.seenBy', { doctor: esc(nm(ap.doctor)), date: esc(shortDate(o.at)) })}</p>
  </div>
  <div class="card"><div class="ct">${t('app.journeyTitle')}</div>${journey(4)}</div>
  ${banner(`<p>${t('app.banner')}</p>`)}`;
}

function inviteScreen() {
  const inv = S.me.invitation;
  const note = inv.status === 'snoozed' ? banner(`<p>${t('app.snoozed')}</p>`, 'clock', 'dark') : inv.status === 'declined' ? banner(`<p>${t('app.declined')}</p>`, 'info', 'dark') : '';
  return `<div class="scroll slide">${topnav(t('app.inviteTitle'), 'closeScreen')}
    <div class="sender-row"><span class="badge-ic">${icon('building', 22)}</span><div><b>${t('app.from')}</b><small>${t('app.sentOn', { date: esc(dfmt(inv.sent_at, { day: 'numeric', month: 'long' })) })}</small></div></div>
    <h1 class="inv-h">${t('app.heading', { type: typeLower() })}</h1>
    ${note}
    <div class="card"><div class="ct">${t('app.whyTitle')}</div><p class="para">${t('app.why')}</p></div>
    <div class="card"><div class="ct">${t('app.expectTitle')}</div>
      <div class="irow">${icon('heart', 20)}<div><b>${t(`visit.${vType()}.s`)}</b><small>${t(`visit.${vType()}.about`)}</small></div></div>
      <div class="irow">${icon('clock', 20)}<div><b>${t('app.duration', { n: S.me.duration })}</b></div></div>
      <div class="irow">${icon('calendar', 20)}<div><b>${t('app.chooseLine')}</b></div></div>
      <div class="irow last">${icon('lock', 20)}<div><b>${t('app.privateLine')}</b></div></div>
    </div>
    <button class="btn-primary wide" data-act="openDoctors">${icon('steth', 18)}${t('app.cta')}</button>
    ${inv.status === 'notified' ? `<div class="btn-row"><button class="btn-soft" data-act="respond" data-id="snooze">${t('app.snooze')}</button><button class="btn-soft" data-act="respond" data-id="decline">${t('app.decline')}</button></div>` : ''}
  </div>`;
}

function langChips(d) {
  return d.langs.map(l => `<span class="chip ${l === S.me.lang ? '' : 'grey'}">${l === S.me.lang ? icon('check', 12) : ''}${t('langs.' + l)}</span>`).join('');
}

function doctorsScreen() {
  const list = S.doctors;
  return `<div class="scroll slide">${topnav(t('app.doctorsTitle'), S.me.appointment && S.me.appointment.status === 'booked' ? 'closeScreen' : 'openInvite')}
    <p class="lead">${t('app.doctorsSub', { type: typeLower() })}</p>
    ${!list ? '<div class="sk" style="height:180px;margin-bottom:12px"></div><div class="sk" style="height:180px"></div>' : list.map(d => `
      <button class="doc" data-act="pickDoc" data-id="${d.id}">
        <span class="av lg">${esc(initials(d))}</span>
        <span class="doc-main"><b>${esc(nm(d))}</b><small>${t('specialties.' + d.specialty)}</small>
          <span class="doc-clinic">${icon('pin', 14)}${t('clinics.' + d.clinic)} · ${t('areas.' + d.area)}</span>
          <span class="doc-chips">${langChips(d)}${d.sex === 'F' ? `<span class="chip grey">${t('app.female')}</span>` : ''}${d.near ? `<span class="chip">${icon('pin', 12)}${t('app.near')}</span>` : ''}</span>
          <span class="doc-next"><span>${d.next ? t('app.nextLbl') : ''}</span><b>${d.next ? `${esc(dayLabel(d.next.date))} · <span class="num">${d.next.time}</span>` : ''}</b></span>
        </span></button>`).join('')}
  </div>`;
}

function slotsScreen() {
  const sl = S.slots;
  if (!sl) return `<div class="scroll slide">${topnav(t('app.slotsTitle'), 'openDoctors')}<div class="sk" style="height:90px;margin-bottom:14px"></div><div class="sk" style="height:200px"></div></div>`;
  const d = sl.doctor, day = sl.days.find(x => x.date === S.day);
  const label = S.time ? t('app.book', { date: dayLabel(S.day), time: S.time }) : t('app.pickFirst');
  return `<div class="scroll slide has-bar">${topnav(t('app.slotsTitle'), 'openDoctors')}
    <div class="mini-doc"><span class="av">${esc(initials(d))}</span><div><b>${esc(nm(d))}</b><small>${t('clinics.' + d.clinic)}</small></div></div>
    <div class="sec">${t('app.chooseDay')}</div>
    <div class="days">${sl.days.map(x => `<button class="day ${x.date === S.day ? 'on' : ''}" data-act="pickDay" data-id="${x.date}" ${x.times.length ? '' : 'disabled'} aria-pressed="${x.date === S.day}">
      <small>${esc(dfmt(x.date, { weekday: 'short' }))}</small><b>${esc(dfmt(x.date, { day: 'numeric' }))}</b><small>${esc(dfmt(x.date, { month: 'short' }))}</small></button>`).join('')}</div>
    <div class="sec">${t('app.chooseTime')}</div>
    ${day && day.times.length ? `<div class="times">${day.times.map(tm => `<button class="time ${tm === S.time ? 'on' : ''}" data-act="pickTime" data-id="${tm}" aria-pressed="${tm === S.time}">${tm}</button>`).join('')}</div>`
      : `<p class="muted">${t('app.noTimes')}</p>`}
  </div>
  <div class="bottom-bar"><button class="btn-primary wide" data-act="book" ${S.time ? '' : 'disabled'}>${icon('check', 18)}${esc(label)}</button></div>`;
}

function bookedScreen() {
  const ap = S.me.appointment;
  return `<div class="scroll enter"><div class="success">
    ${ring(1, 132, 10, G, `<span class="g">${icon('check', 52)}</span>`)}
    <h2>${t('app.bookedTitle')}</h2><p class="para">${t('app.bookedSub')}</p>
    <div class="card summary">
      <div class="irow">${icon('calendar', 20)}<div><b>${esc(dfmt(ap.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</b><small class="num">${ap.time}</small></div></div>
      <div class="irow">${icon('steth', 20)}<div><b>${esc(nm(ap.doctor))}</b><small>${t('specialties.' + ap.doctor.specialty)}</small></div></div>
      <div class="irow last">${icon('pin', 20)}<div><b>${t('clinics.' + ap.doctor.clinic)}</b><small>${t('areas.' + ap.doctor.area)}</small></div></div>
    </div>
    <button class="btn-primary wide" data-act="closeScreen">${t('app.done')}</button>
  </div></div>`;
}

function prepRing() {
  const total = S.me.prep.length, done = S.me.prep.filter(k => S.prep.has(k)).length;
  return ring(done / total, 50, 5, G, `<span class="num">${done}/${total}</span>`);
}

function visitTab() {
  const ap = S.me.appointment;
  if (!ap || ap.status !== 'booked') {
    const canBook = S.me.invitation && ['notified', 'snoozed', 'declined'].includes(S.me.invitation.status);
    return `${header(t('app.visitKicker'), t('app.visitTitle'))}
      <div class="empty">${icon('calendar', 26)}<b>${t('app.noVisit')}</b><p>${t('app.noVisitText')}</p>
      ${canBook ? `<button class="btn-small" data-act="openInvite">${t('app.cta')}</button>` : ''}</div>`;
  }
  return `${header(t('app.visitKicker'), t('app.visitTitle'))}
  <section class="center-num">
    <div class="big">${esc(dfmt(ap.date, { day: '2-digit' }))}</div>
    <div class="big-unit">${esc(dfmt(ap.date, { month: 'long' }))}</div>
    <div class="muted" style="margin-top:6px">${esc(dfmt(ap.date, { weekday: 'long' }))} · <span class="num">${ap.time}</span></div>
  </section>
  <div class="card">
    <div class="irow">${icon('heart', 20)}<div><b>${t(`visit.${vType()}.T`)}</b><small>${t(`visit.${vType()}.s`)}</small></div></div>
    <div class="irow">${icon('steth', 20)}<div><b>${esc(nm(ap.doctor))}</b><small>${t('specialties.' + ap.doctor.specialty)}</small></div></div>
    <div class="irow last">${icon('pin', 20)}<div><b>${t('clinics.' + ap.doctor.clinic)}</b><small>${t('areas.' + ap.doctor.area)}</small></div></div>
    <div class="chip-row">
      <button class="chip" data-act="toast" data-id="app.toastCal">${icon('calendar', 16)}${t('app.addCal')}</button>
      <button class="chip" data-act="toast" data-id="app.toastDir">${icon('pin', 16)}${t('app.directions')}</button>
    </div>
  </div>
  <div class="card">
    <div class="ct-row"><div class="ct">${t('app.getReady')}</div><div id="prepRing">${prepRing()}</div></div>
    <ul class="prep">${S.me.prep.map(k => `<li><button class="prep-item ${S.prep.has(k) ? 'on' : ''}" data-act="prep" data-id="${k}" aria-pressed="${S.prep.has(k)}">
      <span class="pi-ic">${icon(PREP_ICON[k], 20)}</span>
      <span class="pi-txt"><b>${t(`prep.${k}.t`)}</b><small>${t(`prep.${k}.s`)}</small></span>
      <span class="pi-check">${icon('check', 14)}</span></button></li>`).join('')}</ul>
  </div>
  ${ap.confirmed ? banner(`<p>${t('app.confirmed')}</p>`, 'check') : `<button class="btn-primary wide" data-act="confirm">${icon('check', 18)}${t('app.confirm')}</button>`}
  <button class="btn-link" style="display:block;margin:4px auto 0" data-act="openDoctors">${t('app.reschedule')}</button>`;
}

function familyTab() {
  return `${header(t('app.familyKicker'), t('app.familyTitle'))}
  <p class="lead">${t('app.familySub')}</p>
  <div class="card">${familyTree(S.me.relatives.map(rel => ({ rel, selected: S.invite.has(rel) })), 'invite', t('app.you'))}</div>
  <div class="card"><div class="ct">${t('app.msgLbl')}</div><div class="bubble">${t('app.msg')}</div></div>
  <button class="btn-primary wide" id="sendBtn" data-act="sendFamily" ${S.invite.size ? '' : 'disabled'}>${familyLabel()}</button>
  <p class="fine center">${icon('lock', 14)}${t('app.familyNote')}</p>`;
}
const familyLabel = () => `${icon('send', 18, 'flip')}${S.invite.size ? t('app.sendTo', { n: S.invite.size }) : t('app.sendNone')}`;

function meTab() {
  const parties = [
    { k: 'you', ic: 'user', see: ['visit'], hide: [] },
    { k: 'doctor', ic: 'steth', see: ['record'], hide: [] },
    { k: 'doh', ic: 'building', see: ['booking', 'risk', 'outcome'], hide: ['notes'] }
  ];
  return `${header(t('app.meKicker'), t('app.meTitle'))}
  <div class="card"><div class="ct">${t('app.meSub')}</div>
    ${parties.map(p => `<div class="party"><span class="pav ${p.k === 'you' ? 'pav-you' : ''}">${icon(p.ic, 20)}</span><div class="pbody"><b>${t('app.parties.' + p.k)}</b><div class="pchips">
      ${p.see.map(d => `<span class="dchip yes">${icon('check', 12)}${t('app.data.' + d)}</span>`).join('')}
      ${p.hide.map(d => `<span class="dchip no">${icon('lock', 12)}<span>${t('app.data.' + d)}</span></span>`).join('')}
    </div></div></div>`).join('')}
  </div>
  ${banner(`<p>${t('app.lawNote')}</p>`, 'shield')}
  <div class="card"><div class="ct">${t('app.settings')}</div>
    <div class="setrow"><span>${t('app.language')}</span><div class="seg">
      <button class="${isAr() ? '' : 'on'}" data-act="setLang" data-id="en">EN</button>
      <button class="${isAr() ? 'on' : ''}" data-act="setLang" data-id="ar">عربي</button></div></div>
    <div class="setrow"><span>${t('app.reminders')}</span><button class="switch on" data-act="switch" aria-pressed="true" aria-label="${esc(t('app.reminders'))}"><i></i></button></div>
  </div>`;
}

function navView() {
  const pending = S.me && S.me.invitation && S.me.invitation.status === 'notified';
  return `<nav class="nav" aria-label="Main">${TABS.map(([k, ic]) =>
    `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-id="${k}" aria-label="${k}" aria-current="${S.tab === k ? 'page' : 'false'}">${icon(ic, 22)}${k === 'home' && pending && S.tab !== 'home' ? '<span class="badge"></span>' : ''}</button>`).join('')}</nav>`;
}

function render(anim = true) {
  applyDir();
  const view = $('#view');
  const prev = anim ? 0 : ($('.scroll', view)?.scrollTop || 0);
  if (!UI.token) view.innerHTML = welcome();
  else if (!S.me) view.innerHTML = `<div class="scroll"><div style="height:110px"></div><div class="sk" style="height:300px;margin-bottom:14px"></div><div class="sk" style="height:120px"></div></div>`;
  else if (S.screen) view.innerHTML = { invite: inviteScreen, doctors: doctorsScreen, slots: slotsScreen, booked: bookedScreen }[S.screen]();
  else view.innerHTML = `<div class="scroll ${anim ? 'enter' : ''}">${{ home, visit: visitTab, family: familyTab, me: meTab }[S.tab]()}</div>${navView()}`;
  if (prev) $('.scroll', view).scrollTop = prev;
  runAnim(view, anim);
  renderSheet();
}

function renderSheet() {
  const frame = $('#frame');
  frame.querySelectorAll('.sheet,.sheet-bg').forEach(n => n.remove());
  if (S.sheet && S.accounts) frame.insertAdjacentHTML('beforeend', sheetHTML());
  if (S.sheet === 'pin') pin.update();
}

/* ---------------- data ---------------- */
async function loadMe(first = false) {
  const me = await api('/api/me');
  const sig = JSON.stringify(me);
  if (sig === S.lastSig) return;
  const prev = S.me;
  S.lastSig = sig;
  S.me = me;
  if (first) {
    S.prep = new Set(store.get('sanad.prep.' + store.sget('sanad.uid'), []));
    render(true);
    return;
  }
  const wasPending = prev && prev.invitation && prev.invitation.status === 'notified';
  const nowPending = me.invitation && me.invitation.status === 'notified';
  if (!S.screen) render(false);
  if (nowPending && !wasPending) showPush();
}

function showPush() {
  const el = $('#push');
  el.innerHTML = `<span class="app-ic">${icon('heart', 20)}</span><span><small>${t('app.pushFrom')}</small><b>${esc(t('app.push', { type: typeLower() }))}</b></span>`;
  el.classList.add('show');
  clearTimeout(showPush.timer);
  showPush.timer = setTimeout(() => el.classList.remove('show'), 6500);
}

let poller = null;
function startPolling() {
  clearInterval(poller);
  poller = setInterval(() => { if (UI.token) loadMe().catch(() => {}); }, 4000);
}

async function doLogin(code) {
  try {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ id: S.acct, pin: code }) });
    setToken(r.token);
    store.sset('sanad.uid', S.acct);
    S.sheet = null; S.tab = 'home'; S.screen = null; S.me = null; S.lastSig = '';
    render(); startPolling();
    await loadMe(true);
  } catch { pin.fail(); }
}

function signOut() {
  if (UI.token) fetch(API_BASE + '/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + UI.token } }).catch(() => {});
  setToken(null); clearInterval(poller);
  Object.assign(S, { me: null, screen: null, tab: 'home', sheet: null, lastSig: '' });
  render();
}
UI.onAuthLost = signOut;

/* ---------------- actions ---------------- */
async function openDoctors() {
  S.screen = 'doctors'; S.doctors = null; render();
  S.doctors = await api('/api/me/doctors');
  if (S.screen === 'doctors') render(false);
}

async function pickDoc(id) {
  S.screen = 'slots'; S.slots = null; S.doc = id; S.day = null; S.time = null; render();
  const sl = await api('/api/me/slots/' + encodeURIComponent(id));
  S.slots = sl;
  S.day = (sl.days.find(d => d.times.length) || sl.days[0]).date;
  if (S.screen === 'slots') render(false);
}

async function book() {
  try {
    await api('/api/me/book', { method: 'POST', body: JSON.stringify({ doctor: S.doc, date: S.day, time: S.time }) });
  } catch (e) {
    toast(e.message, 'alert');
    return pickDoc(S.doc);
  }
  S.lastSig = '';
  S.me = await api('/api/me');
  S.lastSig = JSON.stringify(S.me);
  S.screen = 'booked'; render();
}

function togglePrep(k, el) {
  S.prep.has(k) ? S.prep.delete(k) : S.prep.add(k);
  store.set('sanad.prep.' + store.sget('sanad.uid'), [...S.prep]);
  el.classList.toggle('on', S.prep.has(k));
  el.setAttribute('aria-pressed', S.prep.has(k));
  const box = $('#prepRing'), prevOff = box.querySelector('.ring-fg').style.strokeDashoffset;
  box.innerHTML = prepRing();
  const fg = box.querySelector('.ring-fg');
  fg.style.transition = 'none'; fg.style.strokeDashoffset = prevOff;
  requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.transition = ''; fg.style.strokeDashoffset = fg.dataset.off; }));
}

function toggleFamily(rel, el) {
  S.invite.has(rel) ? S.invite.delete(rel) : S.invite.add(rel);
  el.classList.toggle('on', S.invite.has(rel));
  el.setAttribute('aria-pressed', S.invite.has(rel));
  const btn = $('#sendBtn'); btn.innerHTML = familyLabel(); btn.disabled = !S.invite.size;
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'lang': setLangPref(isAr() ? 'en' : 'ar'); render(false); break;
    case 'setLang': setLangPref(id); render(false); break;
    case 'openAccounts': S.accounts = await api('/api/demo/accounts'); S.sheet = 'accounts'; renderSheet(); break;
    case 'pickAcct': S.acct = id; pin.reset(); S.sheet = 'pin'; renderSheet(); break;
    case 'closeSheet': S.sheet = null; renderSheet(); break;
    case 'key': pin.press(id); break;
    case 'signOut': signOut(); break;
    case 'tab': S.tab = id; S.screen = null; render(); break;
    case 'openInvite': $('#push').classList.remove('show'); if (S.me && S.me.invitation) { S.screen = 'invite'; render(); } break;
    case 'closeScreen': S.screen = null; S.tab = 'home'; render(); break;
    case 'openDoctors': openDoctors(); break;
    case 'pickDoc': pickDoc(id); break;
    case 'pickDay': S.day = id; S.time = null; render(false); break;
    case 'pickTime': S.time = id; render(false); break;
    case 'book': book(); break;
    case 'respond': {
      await api('/api/me/respond', { method: 'POST', body: JSON.stringify({ action: id }) });
      S.lastSig = ''; await loadMe(); S.screen = null; render();
      toast(t(id === 'snooze' ? 'app.snoozed' : 'app.declined'), id === 'snooze' ? 'clock' : 'info');
      break;
    }
    case 'confirm':
      await api('/api/me/confirm', { method: 'POST' });
      S.lastSig = ''; await loadMe(); toast(t('app.toastConfirm')); break;
    case 'prep': togglePrep(id, el); break;
    case 'invite': toggleFamily(id, el); break;
    case 'sendFamily': {
      const r = await api('/api/me/family', { method: 'POST', body: JSON.stringify({ relatives: [...S.invite] }) });
      toast(t('app.sent', { n: r.sent })); break;
    }
    case 'toast': toast(t(id)); break;
    case 'switch': el.classList.toggle('on'); el.setAttribute('aria-pressed', el.classList.contains('on')); break;
  }
});

document.addEventListener('keydown', e => {
  if (S.sheet === 'pin') {
    if (/^\d$/.test(e.key)) pin.press(e.key);
    else if (e.key === 'Backspace') pin.press('del');
  }
  if (e.key === 'Escape') {
    if (S.sheet) { S.sheet = null; renderSheet(); }
    else if (S.screen) { S.screen = null; render(); }
  }
});

render();
if (UI.token) { startPolling(); loadMe(true).catch(() => {}); }
