// SANAD Family Relay — real/aggregated dataset extracted from "Dataset Abu Dhabi" Excel files.
// All figures are illustration-only aggregates from open public data (see SOURCES).
const DATA = {
  siteAll: [["Breast", 325], ["Other sites", 295], ["Thyroid", 199], ["Colorectal", 175], ["Leukemia / blood", 128], ["Lung", 84]],
  siteMen: [["Other sites", 137], ["Colorectal", 117], ["Leukemia / blood", 82], ["Prostate", 72], ["Lung", 65], ["Lymph nodes", 57]],
  siteWomen: [["Breast", 321], ["Thyroid", 147], ["Other sites", 70], ["Colorectal", 58], ["Cervix", 57], ["Uterus", 55]],
  seerStage: [["In-situ", 206], ["Localized", 939], ["Regional", 772], ["Distant", 811], ["Unknown", 1088]],
  obesityByAge: [["18-29", 28.5], ["30-44", 37.1], ["45-59", 40.7], ["60+", 49.0]],
  obesityTrend: [[2017, 35.9], [2019, 35.9], [2021, 35.9], [2023, 35.9]],
  facilitiesSector: [["Private", 1273], ["Government", 423]],
  facilitiesByEmirate: [["Dubai", 2365], ["Abu Dhabi", 1696], ["Sharjah", 865], ["Ras Al Khaimah", 248], ["Ajman", 236], ["Fujairah", 151], ["Umm Al Quwain", 47]],
  mortalityTrend: [[2015, 427], [2016, 421], [2017, 497], [2018, 540]],
  breastAgePeak: "45-49",
  colorectalAgePeak: "55-59",
  sources: [
    "UAE National Cancer Registry / MOHAP — cancer cases & stage, Abu Dhabi (2014-2015)",
    "SCAD — Non-Citizen population estimates, Abu Dhabi",
    "MOHAP — Prevalence of obesity, UAE (2017-2023)",
    "Bayanat — Health facilities by emirate & type (2018)",
    "Bayanat — Cancer mortality by emirate (2011-2018)"
  ]
};

// Translation map for recurring chart category labels (English term -> Arabic)
const LABELS_AR = {
  "Breast": "الثدي", "Other sites": "مواقع أخرى", "Thyroid": "الغدة الدرقية", "Colorectal": "القولون والمستقيم",
  "Leukemia / blood": "اللوكيميا وأمراض الدم", "Lung": "الرئة", "Prostate": "البروستاتا", "Lymph nodes": "الغدد الليمفاوية",
  "Cervix": "عنق الرحم", "Uterus": "الرحم",
  "In-situ": "موضعي مبكر", "Localized": "موضعي", "Regional": "إقليمي", "Distant": "منتشر", "Unknown": "غير معروف",
  "Private": "خاص", "Government": "حكومي",
  "Dubai": "دبي", "Abu Dhabi": "أبوظبي", "Sharjah": "الشارقة", "Ras Al Khaimah": "رأس الخيمة",
  "Ajman": "عجمان", "Fujairah": "الفجيرة", "Umm Al Quwain": "أم القيوين"
};
function L(s, lang) { return lang === "ar" ? (LABELS_AR[s] || s) : s; }

// Patient-facing appointment — deliberately contains NO clinical reasoning
// (no family history, no genetic result, no risk score). That detail lives
// only in the Doctor and Insurer experiences.
const APPOINTMENT = {
  dateISO: "2026-12-03", dayNum: "03", monthEn: "DEC", monthAr: "ديسمبر",
  timeEn: "9:30 AM", timeAr: "٩:٣٠ صباحًا",
  clinicEn: "Al Noor Women's Health Clinic — Khalifa City", clinicAr: "عيادة النور لصحة المرأة — مدينة خليفة",
  typeEn: "Breast screening (mammogram)", typeAr: "فحص الثدي (ماموغرام)"
};
