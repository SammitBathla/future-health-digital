// SANAD Family Relay — PATIENT app.
// Deliberately minimal: a patient sees an appointment, simple precautions,
// and an optional family invite — never family history, genetic results or
// a risk score. That detail is reserved for the Doctor and Insurer views.
let lang = localStorage.getItem("sanad_lang") || "en";
let charts = {};

const STR = {
  en: {
    brand: "Hi, Mariam!", brandSub: "Here's what's next for you",
    tabs: { home: "Home", appt: "Appointment", family: "Family", privacy: "Privacy" },

    home: {
      daysLabel: "DAYS TO GO", heroWhat: "Breast screening", heroWhen: "Thu, 3 Dec · 9:30 AM",
      statusPill: "Confirmed", quickTitle: "Before your visit",
      overlayLbl: "Next check", overlayVal: "Mammogram",
      precautions: [
        ["🥤", "No caffeine 24h before"], ["👕", "Wear a two-piece outfit"],
        ["🆔", "Bring Emirates ID"], ["⏰", "Arrive 15 min early"]
      ],
      remindTitle: "Reminders", remindText: "We'll text and call you 2 days and 2 hours before your visit.",
      goBtn: "See full appointment →",
      bannerTitle: "A quick check can catch things early", bannerText: "Most people who screen on time never need more than a routine visit."
    },

    appt: {
      title: "Your appointment", sub: "Everything you need for this visit",
      typeLbl: "Type", dateLbl: "Date", timeLbl: "Time", placeLbl: "Clinic", withLbl: "Seen by",
      doctorName: "Dr. Fatima Al Suwaidi",
      prepTitle: "How to prepare",
      steps: [
        ["🥤", "No caffeine or chocolate", "For 24 hours before your scan"],
        ["👕", "Comfortable two-piece clothing", "Easier to change for the exam"],
        ["🧴", "Skip deodorant or powder that day", "Can affect image clarity"],
        ["🆔", "Bring your Emirates ID & insurance card", "Needed at reception"],
        ["⏰", "Arrive 15 minutes early", "For quick check-in"]
      ],
      confirm: "Confirm I'm coming", reschedule: "Reschedule",
      confirmedToast: "Thanks — see you there!", rescheduleToast: "Reschedule request sent to the clinic.",
      note: "Your doctor has already reviewed what's needed. This screen only shows what to do — nothing more."
    },

    family: {
      title: "Family Relay", sub: "Screening can matter to your family too — invite them, if you'd like",
      me: "You", meSub: "Appointment booked",
      sister: "Sister, 41", daughter: "Daughter, 19", mother: "Mother, 63", aunt: "Aunt, 55",
      sendBtn: "Send invitations", preview: "Message preview",
      msgText: "Hi — I'm booking a routine screening and thought you might want to as well. It's quick, optional, and private. Reply Yes to book, or No thanks.",
      sentToast: "Invitations sent to the people you selected.", choiceNote: "Totally optional. Nothing about your own visit is shared with them."
    },

    privacy: {
      title: "Who sees what", sub: "Your information is shared only where it helps your care",
      you: { who: "You", what: "Your appointment, date, and simple preparation tips." },
      doctor: { who: "Your doctor", what: "Your full health record — history, results, and clinical notes." },
      insurer: { who: "Insurance (anonymous)", what: "Overall numbers only — never your name or personal results." },
      note: "This matches UAE health-data rules: your personal results are never used for insurance pricing or visas.",
      settingsTitle: "Your choices", lang: "App language", reminders: "Appointment reminders", familyShare: "Allow family invitations"
    }
  },

  ar: {
    brand: "مرحبًا، مريم!", brandSub: "إليكِ ما هو قادم",
    tabs: { home: "الرئيسية", appt: "الموعد", family: "العائلة", privacy: "الخصوصية" },

    home: {
      daysLabel: "الأيام المتبقية", heroWhat: "فحص الثدي", heroWhen: "الخميس، ٣ ديسمبر · ٩:٣٠ صباحًا",
      statusPill: "مؤكد", quickTitle: "قبل زيارتك",
      overlayLbl: "الفحص القادم", overlayVal: "ماموغرام",
      precautions: [
        ["🥤", "لا كافيين قبل ٢٤ ساعة"], ["👕", "ارتدي طقمًا من قطعتين"],
        ["🆔", "أحضري الهوية الإماراتية"], ["⏰", "احضري قبل ١٥ دقيقة"]
      ],
      remindTitle: "التذكيرات", remindText: "سنرسل رسالة واتصال قبل يومين وقبل ساعتين من الموعد.",
      goBtn: "عرض تفاصيل الموعد ←",
      bannerTitle: "الفحص المبكر قد يكتشف الكثير", bannerText: "معظم من يفحصون في الوقت المناسب لا يحتاجون أكثر من زيارة روتينية."
    },

    appt: {
      title: "موعدك", sub: "كل ما تحتاجينه لهذه الزيارة",
      typeLbl: "النوع", dateLbl: "التاريخ", timeLbl: "الوقت", placeLbl: "العيادة", withLbl: "الطبيب",
      doctorName: "د. فاطمة السويدي",
      prepTitle: "كيف تستعدين",
      steps: [
        ["🥤", "لا كافيين أو شوكولاتة", "لمدة ٢٤ ساعة قبل الفحص"],
        ["👕", "ملابس مريحة من قطعتين", "لتسهيل تغيير الملابس للفحص"],
        ["🧴", "تجنبي مزيل العرق أو البودرة", "قد تؤثر على وضوح الصورة"],
        ["🆔", "أحضري الهوية وبطاقة التأمين", "مطلوبة عند الاستقبال"],
        ["⏰", "احضري قبل ١٥ دقيقة", "لتسجيل وصول سريع"]
      ],
      confirm: "أؤكد الحضور", reschedule: "إعادة الجدولة",
      confirmedToast: "شكرًا — نراكِ هناك!", rescheduleToast: "تم إرسال طلب إعادة الجدولة للعيادة.",
      note: "طبيبك راجع بالفعل كل ما يلزم. هذه الشاشة تعرض فقط ما يجب فعله — لا شيء أكثر."
    },

    family: {
      title: "تواصل الأسرة", sub: "الفحص قد يهم عائلتك أيضًا — ادعيهم إن أردتِ",
      me: "أنتِ", meSub: "تم حجز الموعد",
      sister: "الأخت، ٤١", daughter: "الابنة، ١٩", mother: "الأم، ٦٣", aunt: "العمة، ٥٥",
      sendBtn: "إرسال الدعوات", preview: "معاينة الرسالة",
      msgText: "مرحبًا — أنا بصدد حجز فحص روتيني وفكرت أنكِ قد ترغبين بذلك أيضًا. سريع واختياري وسرّي تمامًا. أجيبي بنعم للحجز، أو لا شكرًا.",
      sentToast: "تم إرسال الدعوات إلى من اخترتِهم.", choiceNote: "اختياري تمامًا. لا تتم مشاركة أي تفاصيل عن زيارتك معهم."
    },

    privacy: {
      title: "من يرى ماذا", sub: "تتم مشاركة معلوماتك فقط حيث تفيد رعايتك",
      you: { who: "أنتِ", what: "موعدك وتاريخه ونصائح تحضير بسيطة." },
      doctor: { who: "طبيبك", what: "سجلك الصحي الكامل — التاريخ والنتائج والملاحظات السريرية." },
      insurer: { who: "التأمين (بيانات مجهولة)", what: "أرقام إجمالية فقط — لا اسمك ولا نتائجك الشخصية أبدًا." },
      note: "يتوافق هذا مع قوانين البيانات الصحية بالإمارات: نتائجك الشخصية لا تُستخدم أبدًا لتسعير التأمين أو التأشيرات.",
      settingsTitle: "خياراتك", lang: "لغة التطبيق", reminders: "تذكيرات الموعد", familyShare: "السماح بدعوات العائلة"
    }
  }
};

function t() { return STR[lang]; }

function setLang(l) {
  lang = l;
  localStorage.setItem("sanad_lang", l);
  document.documentElement.setAttribute("dir", l === "ar" ? "rtl" : "ltr");
  document.documentElement.setAttribute("lang", l);
  renderAll();
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

function daysUntil() {
  const diff = new Date(APPOINTMENT.dateISO) - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function ringSVG(pct, size, strokeW, label) {
  const r = (size - strokeW) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#e5ece7" stroke-width="${strokeW}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#2FAE68" stroke-width="${strokeW}"
      stroke-dasharray="${c}" stroke-dashoffset="${off}" stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="#121613" font-size="22" font-weight="800" font-family="Segoe UI">${label}</text>
  </svg>`;
}

function sparklineSVG() {
  const pts = [20,34,18,44,26,52,30,60,38,70,50,66,58,76,66,60,74,68,80,58];
  const w = 300, h = 46, step = w / (pts.length - 1);
  const max = Math.max(...pts), min = Math.min(...pts);
  const norm = v => h - 6 - ((v - min) / (max - min)) * (h - 12);
  const d = pts.map((v,i) => `${i===0?"M":"L"} ${i*step} ${norm(v)}`).join(" ");
  const last = pts.length - 1;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="#2FAE68" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
    <circle cx="${last*step}" cy="${norm(pts[last])}" r="4" fill="#2FAE68"/>
  </svg>`;
}

/* ---------- HOME ---------- */
function renderHome() {
  const s = t().home;
  const days = daysUntil();
  document.getElementById("screen-home").innerHTML = `
    <div class="hero-card">
      <div class="hero-top">
        <div>
          <div class="lbl">${s.heroWhat}</div>
          <div style="font-size:16px; font-weight:800; margin-top:3px;">${s.heroWhen}</div>
          <span class="status-pill">✅ ${s.statusPill}</span>
        </div>
      </div>
      <div class="ring-wrap">
        ${ringSVG(Math.min(1, days / 30), 92, 9, days)}
        <div class="ring-info">
          <div class="big">${s.daysLabel}</div>
          <div class="small">${s.heroWhen}</div>
        </div>
      </div>
      <div class="sparkline-wrap">${sparklineSVG()}</div>
      <div class="overlay-card">
        <div class="ol-lbl">${s.overlayLbl}</div>
        <div class="ol-val">${s.overlayVal}</div>
      </div>
    </div>

    <div class="card">
      <h3>🧴 ${s.quickTitle}</h3>
      <div class="precaution-grid">
        ${s.precautions.map(p => `<div class="precaution"><span class="emo">${p[0]}</span><div class="t">${p[1]}</div></div>`).join("")}
      </div>
      <button class="btn primary" style="width:100%; margin-top:14px;" onclick="goTab('appt')">${s.goBtn}</button>
    </div>

    <div class="card">
      <h3>🔔 ${s.remindTitle}</h3>
      <p class="caption" style="margin-top:0;">${s.remindText}</p>
    </div>

    <div class="card" style="background:var(--teal-light);">
      <h3 style="color:#0b6b56;">💡 ${s.bannerTitle}</h3>
      <p class="caption" style="margin-top:0; color:#0b6b56;">${s.bannerText}</p>
    </div>
  `;
}

/* ---------- APPOINTMENT ---------- */
function renderAppt() {
  const s = t().appt;
  const monthLbl = lang === "ar" ? APPOINTMENT.monthAr : APPOINTMENT.monthEn;
  document.getElementById("screen-appt").innerHTML = `
    <h2 class="page-title">${s.title}</h2>
    <p class="page-sub">${s.sub}</p>

    <div class="card" style="display:flex; gap:16px; align-items:center;">
      <div style="background:var(--coral); color:#fff; border-radius:16px; padding:10px 14px; text-align:center; flex:0 0 auto;">
        <div style="font-size:22px; font-weight:800; line-height:1;">${APPOINTMENT.dayNum}</div>
        <div style="font-size:10px; font-weight:700; letter-spacing:.5px;">${monthLbl}</div>
      </div>
      <div style="flex:1;">
        <div style="font-weight:800; font-size:14px;">${lang === "ar" ? APPOINTMENT.typeAr : APPOINTMENT.typeEn}</div>
        <div class="caption" style="margin-top:4px;">${lang === "ar" ? APPOINTMENT.timeAr : APPOINTMENT.timeEn} · ${lang === "ar" ? APPOINTMENT.clinicAr : APPOINTMENT.clinicEn}</div>
      </div>
    </div>

    <div class="card">
      <div class="detail-row"><span class="k">${s.typeLbl}</span><span class="v">${lang === "ar" ? APPOINTMENT.typeAr : APPOINTMENT.typeEn}</span></div>
      <div class="detail-row"><span class="k">${s.timeLbl}</span><span class="v">${lang === "ar" ? APPOINTMENT.timeAr : APPOINTMENT.timeEn}</span></div>
      <div class="detail-row"><span class="k">${s.placeLbl}</span><span class="v">${lang === "ar" ? APPOINTMENT.clinicAr : APPOINTMENT.clinicEn}</span></div>
      <div class="detail-row"><span class="k">${s.withLbl}</span><span class="v">${s.doctorName}</span></div>
      <div class="actions">
        <button class="btn primary" onclick="apptAction('confirm')">${s.confirm}</button>
        <button class="btn ghost" onclick="apptAction('reschedule')">${s.reschedule}</button>
      </div>
    </div>

    <div class="card">
      <h3>📋 ${s.prepTitle}</h3>
      <div class="steplist">
        ${s.steps.map(st => `<div class="stepitem"><div class="bub">${st[0]}</div><div><b>${st[1]}</b><small>${st[2]}</small></div></div>`).join("")}
      </div>
    </div>

    <p class="caption" style="text-align:center;">${s.note}</p>
  `;
}

function apptAction(kind) {
  const s = t().appt;
  toast(kind === "confirm" ? s.confirmedToast : s.rescheduleToast);
}

/* ---------- FAMILY ---------- */
let relatives = [
  { key: "sister", on: true },
  { key: "daughter", on: true },
  { key: "mother", on: false },
  { key: "aunt", on: false }
];

function renderFamily() {
  const s = t().family;
  document.getElementById("screen-family").innerHTML = `
    <h2 class="page-title">${s.title}</h2>
    <p class="page-sub">${s.sub}</p>
    <div class="card">
      <div class="tree">
        <div class="me">${s.me}<small>${s.meSub}</small></div>
        <div class="branch-line"></div>
        <div class="relatives">
          ${relatives.map(r => `
            <div class="relative">
              <div class="who">${s[r.key]}</div>
              <div class="switch ${r.on?'on':''}" onclick="toggleRelative('${r.key}')"><i></i></div>
            </div>`).join("")}
        </div>
      </div>
      <button class="btn primary" style="width:100%; margin-top:14px;" onclick="sendInvites()">${s.sendBtn}</button>
    </div>
    <div class="card">
      <h3>💬 ${s.preview}</h3>
      <div class="msg-preview">${s.msgText}</div>
    </div>
    <div class="source-box">🔒 ${s.choiceNote}</div>
  `;
}

function toggleRelative(key) {
  const r = relatives.find(x => x.key === key);
  r.on = !r.on;
  renderFamily();
}

function sendInvites() { toast(t().family.sentToast); }

/* ---------- PRIVACY ---------- */
function renderPrivacy() {
  const s = t().privacy;
  document.getElementById("screen-privacy").innerHTML = `
    <h2 class="page-title">${s.title}</h2>
    <p class="page-sub">${s.sub}</p>
    <div class="card">
      <div class="access-row"><div class="av you">🙂</div><div><div class="who">${s.you.who}</div><div class="what">${s.you.what}</div></div></div>
      <div class="access-row"><div class="av doc">🩺</div><div><div class="who">${s.doctor.who}</div><div class="what">${s.doctor.what}</div></div></div>
      <div class="access-row"><div class="av ins">📊</div><div><div class="who">${s.insurer.who}</div><div class="what">${s.insurer.what}</div></div></div>
    </div>
    <div class="source-box">🇦🇪 ${s.note}</div>
    <div class="card" style="margin-top:14px;">
      <h3>⚙️ ${s.settingsTitle}</h3>
      <div class="detail-row"><span class="k">${s.lang}</span><span class="v">${lang === "ar" ? "عربي" : "English"}</span></div>
      <div class="detail-row"><span class="k">${s.reminders}</span><span class="v">${lang === "ar" ? "مفعّل" : "On"}</span></div>
      <div class="detail-row"><span class="k">${s.familyShare}</span><span class="v">${lang === "ar" ? "مفعّل" : "On"}</span></div>
    </div>
  `;
}

/* ---------- NAV / BOOTSTRAP ---------- */
function goTab(name) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");
  document.getElementById("tab-" + name).classList.add("active");
}

function renderTabbar() {
  const s = t().tabs;
  const icons = { home: "🏠", appt: "📅", family: "👪", privacy: "🔒" };
  document.getElementById("tabbar").innerHTML = Object.keys(s).map(k =>
    `<div class="tab" id="tab-${k}" onclick="goTab('${k}')"><span class="emo">${icons[k]}</span>${s[k]}</div>`
  ).join("");
}

function renderTopbar() {
  const T = t();
  document.getElementById("brandName").textContent = T.brand;
  document.getElementById("brandSub").textContent = T.brandSub;
  document.getElementById("langLabel").textContent = lang === "en" ? "عربي" : "EN";
}

function renderAll() {
  renderTopbar();
  renderTabbar();
  renderHome();
  renderAppt();
  renderFamily();
  renderPrivacy();
  const active = document.querySelector(".screen.active");
  const activeName = active ? active.id.replace("screen-", "") : "home";
  goTab(activeName);
}

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  document.documentElement.setAttribute("lang", lang);
  document.getElementById("langBtn").addEventListener("click", () => setLang(lang === "en" ? "ar" : "en"));
  renderAll();
  goTab("home");
});
