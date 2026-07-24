/* Scope & Sequence Portal
 * -----------------------
 * Tabs:
 *   1. Overview & Calendar - a single Timeline view (Year / Trimester /
 *      Month / Week / Day zoom) on an actual date axis across subjects.
 *      Each subject gets two rows: a "Units" row (whole unit spans,
 *      clickable) and a "Lessons" row (individual lessons, clickable).
 *      Subjects with no separate lesson tier (e.g. Values Block) just get
 *      one row.
 *   2. Weekly Planning - pick a week, download a combined Internalization
 *      Document (.docx) covering every subject for that week, then submit
 *      it via the "Submit Weekly Internalization" button (opens the
 *      network's submission form).
 * Global, multi-select filters (Grade Level, Subject, Curriculum) apply
 * across both tabs. Everything is color-coded by language of instruction
 * (English = light purple, Spanish = light green) - see the Legend panel.
 *
 * Data: data/all_grades.json (produced by scripts/parse_grades.py from the
 * "All" tab of the source workbook), keyed by grade (TK, KN, 1st..8th).
 * The Grade Level filter defaults to Grade 3 alone but can select any
 * grade, or several at once - currentGradeData() merges the selected
 * grades' data and de-dupes rows shared across grades (Values Block,
 * Assessment, and Key Date rows that list multiple grades in the sheet).
 */

// ---------- calendar anchors (2026-27 academic year) ----------
// Update these if a future year's calendar shifts. Sourced from the
// "Network-wide Key Dates" rows and the Internalization Planning tab.
const YEAR_START = new Date("2026-08-03T00:00:00"); // Week 0, Monday
const YEAR_END = new Date("2027-06-11T00:00:00");   // last day of school
const TRIMESTERS = [
  { name: "Trimester 1", start: new Date("2026-08-03T00:00:00"), end: new Date("2026-11-06T00:00:00") },
  { name: "Trimester 2", start: new Date("2026-11-06T00:00:00"), end: new Date("2027-03-05T00:00:00") },
  { name: "Trimester 3", start: new Date("2027-03-05T00:00:00"), end: new Date("2027-06-11T00:00:00") },
];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Bump this to the current date/time every time data/all_grades.json is
// regenerated from the sheet (scripts/parse_grades.py) - shown in the
// footer (with time) so anyone viewing the portal knows how fresh the
// snapshot is. Format: "YYYY-MM-DDTHH:MM" in whatever local time zone
// you're in when you regenerate it (California/Pacific for this network).
const LAST_UPDATED = "2026-07-24T06:17";

// Language of instruction color coding (light purple / light green), used
// everywhere: Overview headers, Calendar chips, This Week subject headers,
// and the Legend. Deep variants are for dots/borders/text-on-white.
const LANGUAGE_COLORS = {
  English: { bg: "#C9B8EA", deep: "#5B1F9E" },
  Spanish: { bg: "#C5E1A5", deep: "#5C8A2E" },
  Unknown: { bg: "#E1DCCE", deep: "#4A5A61" },
};

const state = {
  dataByGrade: {},     // { "3rd": {...} }
  filters: { grades: new Set(), subjects: new Set(), curricula: new Set() },
  allGrades: [],
  allSubjects: [],
  allCurricula: [],
  languageBySubject: {},
  calendar: { zoom: "month", trimesterIdx: 0, monthIdx: 0, weekIdx: null, day: null },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

document.addEventListener("DOMContentLoaded", async () => {
  wireTabs();
  state.dataByGrade = await fetch("data/all_grades.json").then((r) => r.json());
  computeFilterOptions();
  buildLegend();
  buildFilters();
  buildCurriculumSites();
  renderLastUpdated();
  wireModal();
  renderAll();
});

function renderLastUpdated() {
  const el = $("#last-updated");
  if (!el) return;
  // Full datetime (unlike toDate(), which truncates to midnight) so the
  // time-of-day survives.
  const d = new Date(LAST_UPDATED);
  el.textContent = !isNaN(d)
    ? `Last updated on ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : `Last updated on ${LAST_UPDATED}`;
}

function wireTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach((b) => b.classList.remove("active"));
      $$(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $(`#tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

// ---------- data helpers (grade-aware, currently just "3rd") ----------

// Rows shared across grades (Values Block, Assessment, Key Date rows that
// list several grades in the sheet's Grade Level column) get copied into
// every applicable grade's bucket by the parser, tagged with the same
// original _row. When more than one of those grades is selected here at
// once, the same row would otherwise show up once per selected grade -
// dedupe by _row, keeping the first copy encountered.
function dedupeByRow(rows) {
  const seen = new Set();
  const out = [];
  rows.forEach((row) => {
    if (seen.has(row._row)) return;
    seen.add(row._row);
    out.push(row);
  });
  return out;
}

function currentGradeData() {
  const grades = [...state.filters.grades].filter((g) => state.dataByGrade[g]);
  const merged = { sections_by_subject: {}, lessons_by_subject: {}, assessments: [], key_dates: [] };
  grades.forEach((g) => {
    const d = state.dataByGrade[g];
    Object.entries(d.sections_by_subject).forEach(([subj, arr]) => {
      (merged.sections_by_subject[subj] ??= []).push(...arr.map((s) => ({ ...s, _grade: g })));
    });
    Object.entries(d.lessons_by_subject).forEach(([subj, arr]) => {
      (merged.lessons_by_subject[subj] ??= []).push(...arr.map((l) => ({ ...l, _grade: g })));
    });
    merged.assessments.push(...d.assessments.map((a) => ({ ...a, _grade: g })));
    merged.key_dates.push(...d.key_dates);
  });
  Object.keys(merged.sections_by_subject).forEach((subj) => {
    merged.sections_by_subject[subj] = dedupeByRow(merged.sections_by_subject[subj]);
  });
  Object.keys(merged.lessons_by_subject).forEach((subj) => {
    merged.lessons_by_subject[subj] = dedupeByRow(merged.lessons_by_subject[subj]);
  });
  merged.assessments = dedupeByRow(merged.assessments);
  merged.key_dates = dedupeByRow(merged.key_dates);
  return merged;
}

function computeFilterOptions() {
  const grades = Object.keys(state.dataByGrade);
  const subjects = new Set();
  const curricula = new Set();
  const langCounts = {};

  grades.forEach((g) => {
    const d = state.dataByGrade[g];
    Object.keys(d.sections_by_subject).forEach((s) => subjects.add(s));
    Object.keys(d.lessons_by_subject).forEach((s) => subjects.add(s));
    [...Object.values(d.sections_by_subject).flat(), ...Object.values(d.lessons_by_subject).flat()].forEach((row) => {
      if (row.curriculum) curricula.add(row.curriculum);
    });
    // Count language of instruction from both lessons AND sections, since
    // some subjects (e.g. Values Block) only have section-level rows with
    // no separate lesson tier underneath them.
    [d.lessons_by_subject, d.sections_by_subject].forEach((collection) => {
      Object.entries(collection).forEach(([subj, arr]) => {
        arr.forEach((row) => {
          if (!row.language_of_instruction) return;
          langCounts[subj] ??= {};
          langCounts[subj][row.language_of_instruction] = (langCounts[subj][row.language_of_instruction] || 0) + 1;
        });
      });
    });
  });

  state.allGrades = grades;
  state.allSubjects = [...subjects].sort();
  state.allCurricula = [...curricula].sort();
  // Default to Grade 3 alone (matching this portal's original single-grade
  // view) rather than every grade at once, which would overlay every
  // grade's units on the Timeline simultaneously. The Grade Level filter
  // lets anyone switch to another grade, or add more.
  state.filters.grades = new Set(grades.includes("3rd") ? ["3rd"] : grades.slice(0, 1));
  state.filters.subjects = new Set(state.allSubjects);
  state.filters.curricula = new Set(state.allCurricula);

  state.languageBySubject = {};
  state.allSubjects.forEach((subj) => {
    const counts = langCounts[subj] || {};
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    state.languageBySubject[subj] = top ? top[0] : "Unknown";
  });
}

function languageInfo(subj) {
  return LANGUAGE_COLORS[state.languageBySubject[subj]] || LANGUAGE_COLORS.Unknown;
}
function languageColor(subj) { return languageInfo(subj).bg; }
function languageColorDeep(subj) { return languageInfo(subj).deep; }

// ---------- filters (multi-select dropdowns) ----------

function buildFilters() {
  buildMultiSelect("#filter-grade", "Grade Level", state.allGrades, state.filters.grades);
  buildMultiSelect("#filter-subject", "Subject", state.allSubjects, state.filters.subjects);
  buildMultiSelect("#filter-curriculum", "Curriculum", state.allCurricula, state.filters.curricula);
}

function buildMultiSelect(containerId, label, options, selectedSet) {
  const el = $(containerId);
  if (!el) return;
  const renderSummary = () => {
    const filtered = selectedSet.size < options.length;
    const badge = filtered ? `<span class="filter-badge">${selectedSet.size}/${options.length}</span>` : `<span class="filter-badge" style="background:var(--line);color:var(--ink-soft)">All</span>`;
    return `<span>${label}</span>${badge}`;
  };

  el.innerHTML = `
    <details class="filter-dropdown">
      <summary>${renderSummary()}</summary>
      <div class="filter-panel">
        <div class="filter-actions">
          <button type="button" data-act="all">All</button>
          <button type="button" data-act="none">None</button>
        </div>
        ${options.map((opt) => `
          <label class="filter-option">
            <input type="checkbox" value="${escapeHtml(opt)}" ${selectedSet.has(opt) ? "checked" : ""} />
            <span>${escapeHtml(opt)}</span>
          </label>`).join("")}
      </div>
    </details>`;

  const summary = el.querySelector("summary");
  el.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedSet.add(cb.value);
      else selectedSet.delete(cb.value);
      summary.innerHTML = renderSummary();
      renderAll();
    });
  });
  el.querySelector('[data-act="all"]').addEventListener("click", () => {
    options.forEach((o) => selectedSet.add(o));
    el.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
    summary.innerHTML = renderSummary();
    renderAll();
  });
  el.querySelector('[data-act="none"]').addEventListener("click", () => {
    selectedSet.clear();
    el.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
    summary.innerHTML = renderSummary();
    renderAll();
  });
}

// ---------- Curriculum Sites ----------
// Stable home/login pages for each curriculum provider - NOT the raw URLs
// that were originally pasted in, which were one-time session/SSO tokens
// (OAuth callback codes, a SAML assertion POST, a Clever logout link) that
// would have expired or broken almost immediately. These are the durable
// destinations instead.
const CURRICULUM_SITES = [
  { name: "Amplify (CKLA)", subjects: "ELA", url: "https://learning.amplify.com/", note: "Amplify CKLA teacher home." },
  { name: "Great Minds (Eureka Math)", subjects: "Math", url: "https://digital.greatminds.org/teacher", note: "Eureka Math / Eureka Math Squared teacher portal." },
  { name: "Frog Street", subjects: "TK / KN", url: "https://lilypad2.frogstreet.com/", note: "Frog Street teacher login." },
  { name: "Savvas (enVision)", subjects: "Math", url: "https://authentication-webapp.rumba.pk12ls.com/sso/login", note: "Savvas EasyBridge / enVision SSO sign-in." },
  { name: "Studies Weekly", subjects: "Social Studies", url: "https://online.studiesweekly.com/teacher/classrooms/87e96d54-bfcc-4bda-83d5-a413422fb235", note: "Your Studies Weekly classroom." },
];

function buildCurriculumSites() {
  const el = $("#curricula-content");
  if (!el) return;
  el.innerHTML = CURRICULUM_SITES.map((site) => `
    <div class="curriculum-card">
      <h3>${escapeHtml(site.name)}</h3>
      <div class="curriculum-subjects">${escapeHtml(site.subjects)}</div>
      <div style="font-size:12.5px;color:var(--ink-soft)">${escapeHtml(site.note)}</div>
      <a class="curriculum-link" href="${escapeHtml(site.url)}" target="_blank" rel="noopener">Open ↗</a>
    </div>`).join("");
}

// ---------- legend ----------

function buildLegend() {
  const el = $("#legend-panel");
  if (!el) return;
  el.innerHTML = `
    <div class="legend-group">
      <div class="legend-title">Language of instruction</div>
      <div class="legend-item"><span class="legend-swatch" style="background:${LANGUAGE_COLORS.English.bg}"></span>English</div>
      <div class="legend-item"><span class="legend-swatch" style="background:${LANGUAGE_COLORS.Spanish.bg}"></span>Spanish</div>
    </div>
    <div class="legend-group">
      <div class="legend-title">Standards mastery (from the sheet)</div>
      <div class="legend-item">🟠 Partial / first introduction</div>
      <div class="legend-item">🟡 Partial / second introduction</div>
      <div class="legend-item">🟢 Full introduction</div>
      <div class="legend-item">❎ Cross-linguistic transfer</div>
    </div>
    <div class="legend-group">
      <div class="legend-title">Other Timeline rows</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--alert-bg);border:1px solid var(--alert)"></span>Network Key Dates</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--assess-bg);border:1px solid var(--assess)"></span>Assessments</div>
    </div>`;
}

// ---------- shared render entry point ----------

function renderAll() {
  renderKeyDatesList();
  renderAssessmentsList();
  renderCalendar();
  setupWeekTab();
}

function isSubjectVisible(subj) {
  return state.filters.subjects.has(subj);
}

function visibleSubjects() {
  return state.allSubjects.filter(isSubjectVisible);
}

function sectionsFor(subj) {
  const d = currentGradeData();
  const all = d.sections_by_subject[subj] || [];
  const curriculumFiltered = all.filter((s) => !s.curriculum || state.filters.curricula.has(s.curriculum));
  // Math has 3 parallel curriculum options sharing section numbers - only
  // "Eureka Math" has real dates/lessons attached (see README). Prefer the
  // dated option, or Eureka Math, when duplicates remain after filtering.
  const hasDupes = curriculumFiltered.some((sec, i, arr) => arr.filter((s2) => s2.section_number === sec.section_number).length > 1);
  if (!hasDupes) return curriculumFiltered;
  return curriculumFiltered.filter((sec) => sec.start_date || sec.curriculum === "Eureka Math");
}

function lessonsFor(subj) {
  const d = currentGradeData();
  const all = d.lessons_by_subject[subj] || [];
  return all.filter((l) => !l.curriculum || state.filters.curricula.has(l.curriculum));
}

// Subjects like "Values Block" have no separate lesson tier - each row in
// sections_by_subject IS the schedulable item (a weekly SEL theme with its
// own date range). Everywhere the Calendar/Weekly Planning tabs need
// date-anchored items, use this instead of lessonsFor() so those subjects
// show up too.
function timelineItemsFor(subj) {
  const d = currentGradeData();
  const hasLessons = (d.lessons_by_subject[subj] || []).length > 0;
  return hasLessons ? lessonsFor(subj) : sectionsFor(subj);
}

// ---------- unit / lesson detail modal (shared by Timeline) ----------

function wireModal() {
  $("#modal-close").addEventListener("click", closeUnitModal);
  $("#unit-modal").addEventListener("click", (e) => {
    if (e.target.id === "unit-modal") closeUnitModal();
  });
}

// A "Resources" cell in the sheet is often hyperlinked text (e.g. "Copy of
// Integrity 10/13" linking out to a Google Doc) rather than a visible URL -
// resources_url (captured separately by the parser, see parse_3rd.py) holds
// that link. Falls back to treating the resources text itself as the link
// if it's already a bare URL, otherwise just shows it as plain text.
function resourceLinkHtml(item) {
  if (!item || !item.resources) return "";
  const url = item.resources_url || (/^https?:\/\//i.test(item.resources) ? item.resources : null);
  const label = escapeHtml(item.resources);
  const value = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${label} ↗</a>`
    : label;
  return `<div style="margin-top:6px"><b>Resources:</b> ${value}</div>`;
}

function openUnitModal(sectionNum, subjects) {
  const body = $("#modal-body");
  let titleSec = null;
  const blocks = subjects.filter(isSubjectVisible).map((subj) => {
    const sec = sectionsFor(subj).find((s) => String(s.section_number || s._row) === sectionNum);
    if (sec && !titleSec) titleSec = sec;
    const lessons = lessonsFor(subj)
      .filter((l) => l.section_number && l.section_number === sectionNum)
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
    if (!sec && lessons.length === 0) return "";
    const lessonRows = lessons.map((l) => `
      <div class="lesson-row" style="border-left-color:${languageColorDeep(subj)}">
        <div><b>${escapeHtml(l.lesson_number || "")}</b> — ${escapeHtml(l.topic || "")}</div>
        <div class="lesson-meta">${escapeHtml(itemDateLabel(l))}</div>
        ${l.lesson_objective ? `<div>${escapeHtml(l.lesson_objective)}</div>` : ""}
        ${resourceLinkHtml(l)}
      </div>`).join("");
    return `<div class="subject-block">
      <h4 style="color:${languageColorDeep(subj)}">${escapeHtml(subj)}${sec ? " — " + escapeHtml(sec.topic || "") : ""}</h4>
      ${sec && sec.focus_mastery_standards ? `<div style="font-size:12px;color:var(--ink-soft);margin-bottom:8px;white-space:pre-wrap">${escapeHtml(sec.focus_mastery_standards)}</div>` : ""}
      ${sec ? resourceLinkHtml(sec) : ""}
      ${lessonRows || `<div class="empty-note">No individual lessons logged for this subject/unit.</div>`}
    </div>`;
  }).join("");
  const title = titleSec && titleSec.section_number
    ? `Section ${escapeHtml(sectionNum)}`
    : titleSec
      ? escapeHtml(formatDateRange(titleSec.start_date, titleSec.end_date))
      : `Section ${escapeHtml(sectionNum)}`;
  body.innerHTML = `<h2>${title}</h2>${blocks || `<div class="empty-note">Nothing matches the current filters.</div>`}`;
  $("#unit-modal").classList.remove("hidden");
}

function openLessonModal(lesson, subj) {
  const body = $("#modal-body");
  body.innerHTML = `
    <h2>${escapeHtml(subj)} — ${escapeHtml(itemDateLabel(lesson))}</h2>
    <div class="subject-block">
      <div class="lesson-row" style="border-left-color:${languageColorDeep(subj)}">
        <div><b>${lesson.lesson_number ? "Lesson " + escapeHtml(lesson.lesson_number) : escapeHtml(subj)}</b>${lesson.topic ? " — " + escapeHtml(lesson.topic) : ""}</div>
        ${lesson.lesson_objective ? `<div style="margin-top:6px"><b>Objective:</b> ${escapeHtml(lesson.lesson_objective)}</div>` : ""}
        ${lesson.language_objective ? `<div style="margin-top:6px"><b>Language Objective:</b> ${escapeHtml(lesson.language_objective)}</div>` : ""}
        ${lesson.focus_mastery_standards ? `<div style="margin-top:6px;white-space:pre-wrap"><b>Standards:</b> ${escapeHtml(lesson.focus_mastery_standards)}</div>` : ""}
        ${resourceLinkHtml(lesson)}
      </div>
    </div>`;
  $("#unit-modal").classList.remove("hidden");
}

function closeUnitModal() {
  $("#unit-modal").classList.add("hidden");
}

// ---------- Calendar (Year / Trimester / Month / Week / Day) ----------

function weekIndexForDate(iso) {
  const d = toDate(iso);
  if (!d) return null;
  const days = Math.floor((d - YEAR_START) / MS_PER_DAY);
  if (days < 0) return null;
  return Math.floor(days / 7);
}

function weekRange(weekIndex) {
  const start = new Date(YEAR_START.getTime() + weekIndex * 7 * MS_PER_DAY);
  const end = new Date(start.getTime() + 4 * MS_PER_DAY);
  return { start, end };
}

function monthBuckets() {
  const buckets = [];
  let cur = new Date(YEAR_START.getFullYear(), YEAR_START.getMonth(), 1);
  const endMonth = new Date(YEAR_END.getFullYear(), YEAR_END.getMonth(), 1);
  while (cur <= endMonth) {
    const start = new Date(Math.max(cur, YEAR_START));
    const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const end = new Date(Math.min(nextMonth.getTime() - MS_PER_DAY, YEAR_END.getTime()));
    buckets.push({ start, end, label: cur.toLocaleDateString("en-US", { month: "short", year: "numeric" }) });
    cur = nextMonth;
  }
  return buckets;
}

function toDate(iso) {
  if (!iso) return null;
  return new Date(iso.slice(0, 10) + "T00:00:00");
}
function formatShort(d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function formatDate(iso) {
  const d = toDate(iso);
  return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
}
function formatDateRange(a, b) {
  if (!a && !b) return "";
  const da = toDate(a), db = toDate(b);
  if (da && db && da.getTime() === db.getTime()) return formatShort(da);
  return `${da ? formatShort(da) : ""}${db ? " – " + formatShort(db) : ""}`;
}

function setupCalendarControls() {
  const zoomButtons = $$(".zoom-btn");
  zoomButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.zoom === state.calendar.zoom);
    btn.onclick = () => {
      state.calendar.zoom = btn.dataset.zoom;
      zoomButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderCalendar();
    };
  });
}

function renderCalendarNav() {
  const nav = $("#calendar-nav");
  const zoom = state.calendar.zoom;
  if (zoom === "year") { nav.innerHTML = ""; return; }
  if (zoom === "trimester") {
    nav.innerHTML = `<select id="cal-nav-select">${TRIMESTERS.map((t, i) => `<option value="${i}">${t.name}</option>`).join("")}</select>`;
    $("#cal-nav-select").value = state.calendar.trimesterIdx;
    $("#cal-nav-select").onchange = (e) => { state.calendar.trimesterIdx = +e.target.value; renderCalendar(); };
  } else if (zoom === "month") {
    const months = monthBuckets();
    nav.innerHTML = `<select id="cal-nav-select">${months.map((m, i) => `<option value="${i}">${m.label}</option>`).join("")}</select>`;
    $("#cal-nav-select").value = state.calendar.monthIdx;
    $("#cal-nav-select").onchange = (e) => { state.calendar.monthIdx = +e.target.value; renderCalendar(); };
  } else if (zoom === "week") {
    const weeks = allWeeksWithData();
    if (state.calendar.weekIdx === null || !weeks.includes(state.calendar.weekIdx)) {
      const todayWeek = weekIndexForDate(new Date().toISOString().slice(0, 10));
      state.calendar.weekIdx = weeks.includes(todayWeek) ? todayWeek : weeks[0];
    }
    nav.innerHTML = `<select id="cal-nav-select">${weeks.map((w) => `<option value="${w}">${formatWeekLabel(w)}</option>`).join("")}</select>`;
    $("#cal-nav-select").value = state.calendar.weekIdx;
    $("#cal-nav-select").onchange = (e) => { state.calendar.weekIdx = +e.target.value; renderCalendar(); };
  } else if (zoom === "day") {
    nav.innerHTML = `<input type="date" id="cal-nav-date" min="${isoDate(YEAR_START)}" max="${isoDate(YEAR_END)}" />`;
    $("#cal-nav-date").value = state.calendar.day || isoDate(new Date() < YEAR_START || new Date() > YEAR_END ? YEAR_START : new Date());
    $("#cal-nav-date").onchange = (e) => { state.calendar.day = e.target.value; renderCalendar(); };
  }
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

function formatWeekLabel(weekIndex) {
  const { start, end } = weekRange(weekIndex);
  return `Week ${weekIndex}: ${formatShort(start)} – ${formatShort(end)}, ${end.getFullYear()}`;
}

function allWeeksWithData() {
  const weeks = new Set();
  visibleSubjects().forEach((subj) => {
    timelineItemsFor(subj).forEach((l) => {
      const w = weekIndexForDate(l.start_date);
      if (w !== null) weeks.add(w);
    });
  });
  return [...weeks].sort((a, b) => a - b);
}

function renderCalendar() {
  setupCalendarControls();
  renderCalendarNav();
  const zoom = state.calendar.zoom;
  if (zoom === "day") renderDayAgenda();
  else renderGantt();
}

function currentWindow() {
  const zoom = state.calendar.zoom;
  if (zoom === "year") return { buckets: monthBuckets() };
  if (zoom === "trimester") {
    const t = TRIMESTERS[state.calendar.trimesterIdx];
    return { buckets: monthBuckets().filter((m) => m.end >= t.start && m.start <= t.end) };
  }
  if (zoom === "month") {
    const m = monthBuckets()[state.calendar.monthIdx];
    return { buckets: allPossibleWeeksInRange(m.start, m.end) };
  }
  if (zoom === "week") {
    const { start } = weekRange(state.calendar.weekIdx || 0);
    const buckets = [0, 1, 2, 3, 4].map((i) => {
      const d = new Date(start.getTime() + i * MS_PER_DAY);
      return { start: d, end: d, label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) };
    });
    return { buckets };
  }
}

function allPossibleWeeksInRange(start, end) {
  const buckets = [];
  let w = weekIndexForDate(isoDate(start));
  const endWeek = weekIndexForDate(isoDate(end)) ?? w;
  if (w === null) return buckets;
  for (let i = w; i <= endWeek; i++) {
    const { start: ws, end: we } = weekRange(i);
    buckets.push({ start: ws, end: we, label: `Wk ${i}` });
  }
  return buckets;
}

// ---------- span-row helpers ----------
// Multi-day items (units, Values Block weeks, key dates) should render as
// ONE bar spanning every bucket column they overlap, not a duplicate chip
// repeated in each bucket. bucketRangeForItem finds that column span;
// packLanes stacks items that overlap in time into separate lanes (rows)
// within the same track so nothing gets clipped.

// A lesson/section/key-date/assessment row's real span is [start_date,
// end_date] (falling back to a single day when end_date is missing, same
// as bucketRangeForItem below). Anything that places an item by date
// alone - Timeline buckets, the Day agenda, Weekly Planning - should
// test against this whole range, not just start_date, or a lesson/item
// that runs across more than one day would only ever show up on its
// first day.
function itemDateSpan(item) {
  const s = toDate(item.start_date);
  if (!s) return null;
  const e = toDate(item.end_date) || s;
  return { s, e };
}
function itemOverlapsRange(item, rangeStart, rangeEnd) {
  const span = itemDateSpan(item);
  return span ? span.e >= rangeStart && span.s <= rangeEnd : false;
}
function itemSpansMultipleDays(item) {
  return !!(item.start_date && item.end_date && item.start_date.slice(0, 10) !== item.end_date.slice(0, 10));
}
function itemDateLabel(item) {
  return itemSpansMultipleDays(item) ? formatDateRange(item.start_date, item.end_date) : formatDate(item.start_date);
}

function bucketRangeForItem(buckets, startDate, endDate) {
  const s = toDate(startDate);
  if (!s) return null;
  const e = toDate(endDate) || s;
  let startIdx = -1, endIdx = -1;
  buckets.forEach((b, i) => {
    if (e >= b.start && s <= b.end) {
      if (startIdx === -1) startIdx = i;
      endIdx = i;
    }
  });
  return startIdx === -1 ? null : { startIdx, endIdx };
}

function packLanes(rangedItems) {
  const sorted = rangedItems.slice().sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);
  const laneEnds = []; // laneEnds[i] = last endIdx occupied in lane i
  const placed = sorted.map((it) => {
    let lane = laneEnds.findIndex((endIdx) => endIdx < it.startIdx);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.endIdx); }
    else { laneEnds[lane] = it.endIdx; }
    return { ...it, lane };
  });
  return { placed, laneCount: laneEnds.length || 1 };
}

// Renders one gantt-row whose items are drawn as spanning bars (grid-column
// covers every overlapping bucket) rather than one-chip-per-bucket.
function renderSpanRow(rowLabelHtml, borderColor, items, buckets, chipHtmlFn) {
  const ranged = items
    .map((item) => {
      const range = bucketRangeForItem(buckets, item.start_date, item.end_date);
      return range ? { ...range, item } : null;
    })
    .filter(Boolean);
  if (ranged.length === 0) return "";

  const { placed, laneCount } = packLanes(ranged);
  const laneHeight = 30;
  const chips = placed.map(({ startIdx, endIdx, lane, item }) =>
    chipHtmlFn(item, startIdx, endIdx, lane)
  ).join("");

  return `<div class="gantt-row">
    <div class="gantt-row-label" style="border-left:4px solid ${borderColor}">${rowLabelHtml}</div>
    <div class="gantt-track gantt-track-span" style="grid-template-columns: repeat(${buckets.length}, minmax(110px, 1fr)); grid-template-rows: repeat(${laneCount}, ${laneHeight}px); min-height:${laneCount * laneHeight + 8}px">${chips}</div>
  </div>`;
}

function renderGantt() {
  const host = $("#calendar-content");
  const { buckets } = currentWindow();
  const subjects = visibleSubjects();
  if (subjects.length === 0 || !buckets || buckets.length === 0) {
    host.innerHTML = `<div class="empty-note">Nothing to show for the current filters/selection.</div>`;
    return;
  }

  const colHeaders = buckets.map((b) => `<div class="gantt-col-header">${escapeHtml(b.label)}</div>`).join("");
  const rows = subjects.map((subj) => {
    const hasSeparateLessons = (currentGradeData().lessons_by_subject[subj] || []).length > 0;

    if (!hasSeparateLessons) {
      // e.g. Values Block: each row IS a span item (a week-long theme) -
      // render the whole subject as one spanning-bar row.
      const items = timelineItemsFor(subj).filter((l) => l.start_date);
      return renderSpanRow(escapeHtml(subj), languageColorDeep(subj), items, buckets, (l, startIdx, endIdx, lane) => `
        <div class="lesson-chip span-chip" style="grid-column:${startIdx + 1} / ${endIdx + 2}; grid-row:${lane + 1}; background:${languageColor(subj)}"
          data-row="${l._row}" data-subj="${escapeHtml(subj)}"
          title="${escapeHtml(l.lesson_number || "")} ${escapeHtml(l.topic || l.lesson_objective || "")}">${escapeHtml(l.lesson_number || "")} ${escapeHtml(l.topic || "")}</div>`);
    }

    const unitsRow = renderUnitsGanttRow(subj, buckets);

    const lessons = timelineItemsFor(subj);
    const cells = buckets.map((b) => {
      // Overlap test against the lesson's full [start_date, end_date]
      // range (not just start_date) so a lesson that runs across more
      // than one day shows up in every bucket it touches, not just the
      // one containing its start date.
      const inBucket = lessons.filter((l) => itemOverlapsRange(l, b.start, b.end))
        .sort((a, b2) => (a.start_date || "").localeCompare(b2.start_date || ""));
      const chips = inBucket.map((l) => {
        const spans = itemSpansMultipleDays(l);
        return `<div class="lesson-chip${spans ? " lesson-chip-multiday" : ""}" style="background:${languageColor(subj)}"
        data-row="${l._row}" data-subj="${escapeHtml(subj)}"
        title="${escapeHtml(itemDateLabel(l))} — ${escapeHtml(l.lesson_number || "")} ${escapeHtml(l.topic || l.lesson_objective || "")}">${escapeHtml(l.lesson_number || "")} ${escapeHtml(l.topic || "")}</div>`;
      }).join("");
      return `<div class="gantt-cell">${chips}</div>`;
    }).join("");
    const rowLabel = `${escapeHtml(subj)} <span style="opacity:.6;font-weight:400;font-size:11px">· Lessons</span>`;
    return unitsRow + `<div class="gantt-row">
      <div class="gantt-row-label" style="border-left:4px solid ${languageColorDeep(subj)}">${rowLabel}</div>
      <div class="gantt-track" style="grid-template-columns: repeat(${buckets.length}, minmax(110px, 1fr))">${cells}</div>
    </div>`;
  }).join("");

  const keyDateRow = renderKeyDatesGanttRow(buckets);
  const assessmentRow = renderAssessmentsGanttRow(buckets);

  host.innerHTML = `
    <div class="gantt-wrap">
      <div class="gantt-header">
        <div class="gantt-row-label"></div>
        <div class="gantt-track" style="grid-template-columns: repeat(${buckets.length}, minmax(110px, 1fr))">${colHeaders}</div>
      </div>
      ${keyDateRow}
      ${assessmentRow}
      ${rows}
    </div>`;

  $$(".unit-chip").forEach((chip) => {
    chip.addEventListener("click", () => openUnitModal(chip.dataset.section, [chip.dataset.subj]));
  });
  $$(".lesson-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const subj = chip.dataset.subj;
      const lesson = timelineItemsFor(subj).find((l) => String(l._row) === chip.dataset.row);
      if (lesson) openLessonModal(lesson, subj);
    });
  });
  $$(".keydate-chip").forEach((chip) => {
    chip.addEventListener("click", () => openKeyDateModal(chip.dataset.row));
  });
  $$(".assessment-chip").forEach((chip) => {
    chip.addEventListener("click", () => openAssessmentModal(chip.dataset.row));
  });
}

// ---------- Units row (whole-unit spans, clickable, shown above each
// subject's Lessons row on the Timeline) ----------

function renderUnitsGanttRow(subj, buckets) {
  const sections = sectionsFor(subj).filter((s) => s.start_date);
  const label = `${escapeHtml(subj)} <span style="opacity:.6;font-weight:400;font-size:11px">· Units</span>`;
  return renderSpanRow(label, languageColorDeep(subj), sections, buckets, (s, startIdx, endIdx, lane) => {
    const unitLabel = s.section_number ? `Unit ${s.section_number}` : "";
    return `<div class="lesson-chip unit-chip span-chip" style="grid-column:${startIdx + 1} / ${endIdx + 2}; grid-row:${lane + 1}; background:transparent;border:1.5px solid ${languageColorDeep(subj)};color:${languageColorDeep(subj)};font-weight:600"
      data-section="${escapeHtml(s.section_number || s._row)}" data-subj="${escapeHtml(subj)}"
      title="${escapeHtml(unitLabel)} ${escapeHtml(s.topic || "")}">${escapeHtml(unitLabel)} ${escapeHtml(s.topic || "")}</div>`;
  });
}

// ---------- Network Key Dates ----------
// Parsed alongside lessons (holidays, PD days, minimum days, conference
// windows, trimester boundaries) but shown separately since they apply
// network-wide, not per subject.

function allKeyDates() {
  return currentGradeData().key_dates || [];
}

function renderKeyDatesGanttRow(buckets) {
  const dates = allKeyDates();
  return renderSpanRow("Key Dates", "var(--alert)", dates, buckets, (k, startIdx, endIdx, lane) => `
    <div class="lesson-chip keydate-chip span-chip" style="grid-column:${startIdx + 1} / ${endIdx + 2}; grid-row:${lane + 1}; background:var(--alert-bg);color:var(--alert)"
      data-row="${k._row}" title="${escapeHtml(k.topic || "")}">${escapeHtml(k.topic || "")}</div>`);
}

function keyDatesForDay(day) {
  return allKeyDates().filter((k) => {
    const start = (k.start_date || "").slice(0, 10);
    const end = (k.end_date || start).slice(0, 10);
    return day >= start && day <= end;
  });
}

function openKeyDateModal(row) {
  const k = allKeyDates().find((k2) => String(k2._row) === row);
  if (!k) return;
  const body = $("#modal-body");
  body.innerHTML = `<h2>Network Key Date</h2>
    <div class="subject-block">
      <div class="lesson-row" style="border-left-color:var(--alert)">
        <div><b>${escapeHtml(k.topic || "")}</b></div>
        <div class="lesson-meta">${formatDateRange(k.start_date, k.end_date)}</div>
        <div style="margin-top:6px;color:var(--ink-soft)">Applies to grade levels: ${escapeHtml(k.grade_level || "All")}</div>
      </div>
    </div>`;
  $("#unit-modal").classList.remove("hidden");
}

function renderKeyDatesList() {
  const el = $("#keydates-panel");
  if (!el) return;
  const dates = allKeyDates().slice().sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  if (dates.length === 0) { el.innerHTML = `<div class="empty-note">No key dates match the current filters.</div>`; return; }
  el.innerHTML = `
    <div class="legend-title">Holidays, PD days, minimum days, conferences, trimester boundaries</div>
    <div class="table-scroll"><table class="overview-table">
      <thead><tr><th style="width:150px">Date(s)</th><th>Event</th></tr></thead>
      <tbody>${dates.map((k) => `
        <tr>
          <td class="col-label"><div class="cell-unit-label">${formatDateRange(k.start_date, k.end_date)}</div></td>
          <td><div class="cell-topic">${escapeHtml(k.topic || "")}</div></td>
        </tr>`).join("")}</tbody>
    </table></div>`;
}

// ---------- Assessments ----------
// Diagnostics/benchmarks/summative windows (ELPAC, IXL Math Diagnostic,
// STAR Reading, CAST, SBAC, etc.) - parsed alongside lessons but shown
// separately since, like Key Dates, they apply across grade levels rather
// than belonging to one subject's Units/Lessons rows.

function allAssessments() {
  return currentGradeData().assessments || [];
}

function renderAssessmentsGanttRow(buckets) {
  const items = allAssessments();
  return renderSpanRow("Assessments", "var(--assess)", items, buckets, (a, startIdx, endIdx, lane) => `
    <div class="lesson-chip assessment-chip span-chip" style="grid-column:${startIdx + 1} / ${endIdx + 2}; grid-row:${lane + 1}; background:var(--assess-bg);color:var(--assess)"
      data-row="${a._row}" title="${escapeHtml(a.topic || "")}">${escapeHtml(a.topic || "")}</div>`);
}

function assessmentsForDay(day) {
  return allAssessments().filter((a) => {
    const start = (a.start_date || "").slice(0, 10);
    const end = (a.end_date || start).slice(0, 10);
    return day >= start && day <= end;
  });
}

function openAssessmentModal(row) {
  const a = allAssessments().find((a2) => String(a2._row) === row);
  if (!a) return;
  const body = $("#modal-body");
  body.innerHTML = `<h2>Assessment</h2>
    <div class="subject-block">
      <div class="lesson-row" style="border-left-color:var(--assess)">
        <div><b>${escapeHtml(a.topic || "")}</b></div>
        <div class="lesson-meta">${formatDateRange(a.start_date, a.end_date)}</div>
        <div style="margin-top:6px;color:var(--ink-soft)">Applies to grade levels: ${escapeHtml(a.grade_level || "All")}</div>
        ${resourceLinkHtml(a)}
      </div>
    </div>`;
  $("#unit-modal").classList.remove("hidden");
}

function renderAssessmentsList() {
  const el = $("#assessments-panel");
  if (!el) return;
  const items = allAssessments().slice().sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  if (items.length === 0) { el.innerHTML = `<div class="empty-note">No assessments match the current filters.</div>`; return; }
  el.innerHTML = `
    <div class="legend-title">Diagnostics, benchmarks, and summative testing windows</div>
    <div class="table-scroll"><table class="overview-table">
      <thead><tr><th style="width:150px">Date(s)</th><th>Assessment</th></tr></thead>
      <tbody>${items.map((a) => `
        <tr>
          <td class="col-label"><div class="cell-unit-label">${formatDateRange(a.start_date, a.end_date)}</div></td>
          <td><div class="cell-topic">${escapeHtml(a.topic || "")}</div></td>
        </tr>`).join("")}</tbody>
    </table></div>`;
}

function renderDayAgenda() {
  const host = $("#calendar-content");
  const day = state.calendar.day;
  if (!day) { host.innerHTML = `<div class="empty-note">Pick a date above.</div>`; return; }
  const subjects = visibleSubjects();
  const dayDate = toDate(day);
  const entries = [];
  subjects.forEach((subj) => {
    timelineItemsFor(subj).forEach((l) => {
      // Overlap, not equality, so a lesson running Aug 26-27 still shows
      // up on the Aug 27 agenda, not just its first day.
      if (itemOverlapsRange(l, dayDate, dayDate)) entries.push({ subj, lesson: l });
    });
  });
  const keyDates = keyDatesForDay(day);
  const assessments = assessmentsForDay(day);
  const banner = (keyDates.length || assessments.length)
    ? `<div class="agenda-list" style="margin-bottom:14px">${keyDates.map((k) => `
        <div class="agenda-item keydate-chip" style="border-left-color:var(--alert);background:var(--alert-bg)" data-row="${k._row}">
          <div class="agenda-subject" style="color:var(--alert)">Key Date</div>
          <div class="agenda-title"><b>${escapeHtml(k.topic || "")}</b></div>
        </div>`).join("")}${assessments.map((a) => `
        <div class="agenda-item assessment-chip" style="border-left-color:var(--assess);background:var(--assess-bg)" data-row="${a._row}">
          <div class="agenda-subject" style="color:var(--assess)">Assessment</div>
          <div class="agenda-title"><b>${escapeHtml(a.topic || "")}</b></div>
        </div>`).join("")}</div>`
    : "";

  if (entries.length === 0) {
    host.innerHTML = banner || `<div class="empty-note">No lessons logged for this day (may be a break, weekend, or not-yet-populated).</div>`;
    wireDayAgendaClicks();
    return;
  }
  host.innerHTML = banner + `<div class="agenda-list">${entries.map(({ subj, lesson }) => `
    <div class="agenda-item" style="border-left-color:${languageColorDeep(subj)}" data-subj="${escapeHtml(subj)}" data-row="${lesson._row}">
      <div class="agenda-subject">${escapeHtml(subj)}</div>
      <div class="agenda-title"><b>${escapeHtml(lesson.lesson_number || "")}</b> ${escapeHtml(lesson.topic || "")}</div>
      ${itemSpansMultipleDays(lesson) ? `<div class="agenda-meta">${escapeHtml(itemDateLabel(lesson))} (multi-day)</div>` : ""}
      ${lesson.lesson_objective ? `<div class="agenda-objective">${escapeHtml(lesson.lesson_objective)}</div>` : ""}
    </div>`).join("")}</div>`;
  wireDayAgendaClicks();
}

function wireDayAgendaClicks() {
  $$(".agenda-item[data-subj]").forEach((item) => {
    item.addEventListener("click", () => {
      const subj = item.dataset.subj;
      const lesson = timelineItemsFor(subj).find((l) => String(l._row) === item.dataset.row);
      if (lesson) openLessonModal(lesson, subj);
    });
  });
  $$(".agenda-item.keydate-chip").forEach((item) => {
    item.addEventListener("click", () => openKeyDateModal(item.dataset.row));
  });
  $$(".agenda-item.assessment-chip").forEach((item) => {
    item.addEventListener("click", () => openAssessmentModal(item.dataset.row));
  });
}

// ---------- Weekly Planning tab (docx download + submission link) ----------

function setupWeekTab() {
  const weeks = allWeeksWithData();
  const sel = $("#week-select");
  const prevValue = sel.value;
  sel.innerHTML = weeks.map((w) => `<option value="${w}">${formatWeekLabel(w)}</option>`).join("");
  const todayWeek = weekIndexForDate(new Date().toISOString().slice(0, 10));
  if (weeks.includes(+prevValue)) sel.value = prevValue;
  else sel.value = weeks.includes(todayWeek) ? todayWeek : weeks[0];

  sel.onchange = renderWeek;
  $("#download-btn").onclick = downloadWeekDoc;
  renderWeek();
}

function lessonsForWeek(weekIndex) {
  // Overlap against the week's actual date range, not just whether
  // start_date falls in it, so a lesson that runs from Friday into the
  // following Monday still shows up in both weeks it touches.
  const { start, end } = weekRange(weekIndex);
  const bySubject = {};
  visibleSubjects().forEach((subj) => {
    const lessons = timelineItemsFor(subj)
      .filter((l) => itemOverlapsRange(l, start, end))
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
    if (lessons.length) bySubject[subj] = lessons;
  });
  return bySubject;
}

function renderWeek() {
  const weekIndex = parseInt($("#week-select").value, 10);
  const bySubject = lessonsForWeek(weekIndex);
  const el = $("#week-content");
  const subjects = Object.keys(bySubject);
  $("#download-btn").disabled = subjects.length === 0;

  if (subjects.length === 0) {
    el.innerHTML = `<div class="empty-note">No lessons scheduled for this week (may be a break, not-yet-populated week, or filtered out).</div>`;
    return;
  }
  el.innerHTML = subjects.map((subj) => {
    const rows = bySubject[subj].map((l) => `<tr class="week-lesson-row" data-subj="${escapeHtml(subj)}" data-row="${l._row}">
      <td>${escapeHtml(itemDateLabel(l))}</td>
      <td>${escapeHtml(l.lesson_number || "")}</td>
      <td>${escapeHtml(l.topic || "")}</td>
      <td>${escapeHtml(l.lesson_objective || "")}</td>
    </tr>`).join("");
    return `<h4 style="margin:14px 0 8px;color:${languageColorDeep(subj)}">${escapeHtml(subj)}</h4>
    <table><thead><tr><th>Date</th><th>Lesson</th><th>Topic</th><th>Objective</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  }).join("");

  $$(".week-lesson-row").forEach((row) => {
    row.addEventListener("click", () => {
      const subj = row.dataset.subj;
      const lesson = timelineItemsFor(subj).find((l) => String(l._row) === row.dataset.row);
      if (lesson) openLessonModal(lesson, subj);
    });
  });
}

async function downloadWeekDoc() {
  const weekIndex = parseInt($("#week-select").value, 10);
  const bySubject = lessonsForWeek(weekIndex);
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } = window.docx;

  const blankField = (label) => new Paragraph({
    children: [new TextRun({ text: label + ":", bold: true })],
    spacing: { before: 120, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999" } },
  });
  const field = (label, value) => new Paragraph({
    children: [new TextRun({ text: label + ": ", bold: true }), new TextRun(value || "—")],
    spacing: { after: 100 },
  });

  const selectedGrades = [...state.filters.grades];
  const gradeLabel = selectedGrades.length
    ? `${selectedGrades.length > 1 ? "Grades" : "Grade"} ${selectedGrades.join(", ")}`
    : "All Grades";

  const children = [
    new Paragraph({ text: `Week ${weekIndex} Internalization Planning`, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: `${gradeLabel} — ${formatWeekLabel(weekIndex).split(": ")[1]}`, spacing: { after: 300 } }),
  ];

  Object.entries(bySubject).forEach(([subject, lessons]) => {
    children.push(new Paragraph({ text: subject, heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    lessons.forEach((l) => {
      children.push(new Paragraph({ text: `Lesson ${l.lesson_number || ""}${l.topic ? " — " + l.topic : ""}`, heading: HeadingLevel.HEADING_3, spacing: { before: 200 } }));
      children.push(field("Date", formatDate(l.start_date)));
      children.push(field("Lesson Objective", l.lesson_objective));
      children.push(field("Language Objective", l.language_objective));
      children.push(field("Standards", l.focus_mastery_standards));
      children.push(blankField("Exit Ticket Exemplar"));
      children.push(blankField("Key Misconceptions"));
      children.push(blankField("Collaborative Routines for Making Learning Visible"));
      children.push(blankField("Materials Needed"));
      children.push(blankField("Lesson Adjustment Log"));
    });
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Grade3-Week${weekIndex}-Internalization.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- helpers ----------

function escapeHtml(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
