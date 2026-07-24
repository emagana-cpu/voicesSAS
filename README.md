# Scope & Sequence Portal

A focused, view-only front end for the network's scope and sequence data,
parsed from the "All" tab of the Network-wide Content Scope and Sequences
workbook (see "Why the data comes from the 'All' tab" below). Covers every
grade (TK, KN, 1st-8th) - the Grade Level filter defaults to Grade 3 alone
but can switch to, or add, any other grade. Three tabs:

1. **Overview & Calendar** — a single **Timeline** view (Year → Trimester →
   Month → Week → Day zoom), everything on an actual date axis across
   subjects, color-coded by language of instruction. Each subject with a
   real lesson tier gets two rows: a clickable **Units** row (whole unit/
   module spans) and a **Lessons** row (individual lessons, also
   clickable). Subjects with no separate lesson tier (Values Block) get
   one clickable spanning row. Also included: a **Key Dates** row (red/
   orange accent) and an **Assessments** row (amber accent), both also
   available as header dropdowns. Click any chip, bar, or agenda item for
   its full detail, including any linked resource.
2. **Weekly Planning** — pick a week, see every subject's lesson(s) for
   that week (click a row for its full detail), download a combined
   **Internalization Document (.docx)** covering all subjects for that
   week, then **Submit Weekly Internalization** to log it at the
   network's submission dashboard
   ([grow.leveldata.com/data-dash](https://grow.leveldata.com/data-dash)).
   That same submit button also lives in the header, so it's reachable
   from anywhere in the app.
3. **Curriculum Sites** — quick links out to each curriculum provider's
   teacher site (Amplify, Great Minds, Frog Street, Savvas, Studies
   Weekly).

**Filters** (top of page, in their own labeled purple strip, all
multi-select): Grade Level, Subject, and Curriculum. Each one shows a
badge - "All" in gray, or "N/total" in green once you've narrowed it -
so it's obvious at a glance whether you're looking at everything or a
filtered subset. They apply across every tab at once. Selecting more than
one grade at a time merges their data and de-dupes any row shared across
grades (Values Block, Assessment, and Key Date rows that list multiple
grades in the sheet).

**Color coding**: everything is colored by language of instruction -
English is light purple, Spanish is light green. See the **Legend**
button in the top right, which also explains the sheet's own
standards-mastery emoji key (🟠 🟡 🟢 ❎).

**Branding**: colors, fonts (Fraunces + Work Sans), and the logo match the
[Voices Professional Learning Portal](https://emagana-cpu.github.io/voicesprofessionallearning/)
so this feels like part of the same family of staff tools.

No build step, no accounts, no sign-in. Plain HTML/CSS/JS - open
`index.html` directly or serve the folder, and it can be hosted for free
on GitHub Pages. The single-file build (the `index-vN.html` you were
handed) is the same app with styles, code, and data all inlined into one
file, for when it's easier to share one file than a folder.

```bash
python3 -m http.server 8000
# visit http://localhost:8000
```

## Timeline

Five zoom levels. **Year / Trimester / Month / Week** render each visible
subject as two rows (Units, Lessons), with time broken into buckets
(months, weeks, or days depending on zoom) across the top. Units and
other multi-day items (Values Block, Key Dates, Assessments) render as a
single bar spanning every bucket they cover, not a duplicate chip in each
bucket; time-overlapping items in the same row stack into extra lanes so
nothing gets clipped. Individual lessons appear as their own chip in
whichever bucket their date falls into - if a bucket ends up with a lot
of lessons (common at Year zoom), that cell scrolls internally rather
than blowing up the row height, and the whole Gantt area scrolls
horizontally and vertically too. Trimester boundaries and the school
year's start/end date are hardcoded at the top of `app.js`
(`YEAR_START`, `YEAR_END`, `TRIMESTERS`) - update those if a future
year's calendar shifts. **Day** shows a simple agenda: every lesson,
key date, and assessment on the selected date, across subjects.

**Important caveat - many units have no dates in the sheet.** Grade 3's
Values Block, ELA, SLA, Science, and Social Studies rows are fully dated,
and Grade 3 Math's first module is too - but for most other grades
(4th-8th Math and Science especially, and large parts of 5th-8th
SLA/ELA), the "All" tab has the section/topic and standards captured but
**no start or end date at all**. Those sections are real, correctly
parsed data - they just can't be placed on a date-based Timeline without
a date, so they simply won't show a Units bar for that grade/subject.
This isn't a portal bug; it reflects what's actually filled in on the
"All" tab today. Worth flagging to whoever maintains that tab if those
grades' pacing dates should be added.

## Filters

Grade Level, Subject, and Curriculum are all multi-select (checkboxes in
a dropdown, with All/None shortcuts) and apply across every tab at once.
Grade Level defaults to **3rd** alone (matching this portal's original
scope) - switch it to see any other grade, or check several boxes to
view multiple grades together.

## Legend & color coding

Everything is colored by **language of instruction** - computed
automatically per subject from the data, not hardcoded. **English is
light purple, Spanish is light green.** Click **Legend** (top right) to
see the color key, plus an explanation of the sheet's own
standards-mastery emoji system (🟠 partial/first introduction, 🟡
partial/second introduction, 🟢 full introduction, ❎ cross-linguistic
transfer) that already appears inside the standards text.

## Curriculum Sites tab

Five link-out cards to each curriculum provider's teacher site: Amplify
(CKLA), Great Minds (Eureka Math), Frog Street, Savvas (enVision), and
Studies Weekly. **These are stable home/login pages, not the raw URLs
that were originally shared for this** - those were one-time session
tokens (an OAuth callback, a SAML assertion POST, a Clever logout link)
that would have broken within minutes and wouldn't have worked for anyone
but the person who copied them. Sign in on the provider's own site with
your usual account (Clever, district SSO, etc.). Edit the
`CURRICULUM_SITES` array at the top of `app.js` to add, remove, or fix a
link.

## Weekly Planning tab

Weeks are numbered Monday-Friday starting **Monday, August 3, 2026** (Week
0), matching the network's academic calendar. If the calendar shifts in a
future year, update `YEAR_START` at the top of `app.js`.

Selecting a week shows every subject's lesson(s) scheduled that week -
click any row for its full detail (including any linked resource).
**Download Internalization Document (.docx)** builds one combined Word
document for the whole week (labeled with whichever grade(s) are
currently selected in the Grade Level filter), one section per subject,
one sub-section per lesson, with:

- Date, Lesson Objective, Language Objective, and Standards — pre-filled
  from the sheet
- Exit Ticket Exemplar, Key Misconceptions, Collaborative Routines for
  Making Learning Visible, Materials Needed, and Lesson Adjustment Log —
  left blank as labeled sections, matching the original Lesson
  Internalization Guide template, for teachers to fill in by hand or
  before printing.

**Submit Weekly Internalization** (next to the download button, and also
in the header so it's reachable from anywhere) opens the network's
submission dashboard at
[grow.leveldata.com/data-dash](https://grow.leveldata.com/data-dash) in a
new tab. The portal doesn't upload anything automatically - it just links
out; the actual submission still happens on that site.

The document is generated entirely in the browser (via the
[docx](https://www.npmjs.com/package/docx) library, loaded from a CDN) -
nothing is sent to a server.

## Values Block, Network Key Dates, and Assessments

**Values Block** rows (e.g. labeled `"3, 4, 5: Values Block"` in the
sheet when shared across grades) don't have a separate "Lessons" tier the
way Math/ELA/SLA/Science/Social Studies do - each row IS the schedulable
item, a week-long SEL theme with its own date range and CASEL standards.
The portal renders it as a single spanning row on the Timeline (no
drill-down to child lessons, since there aren't any).

**Network Key Dates** (holidays, minimum days, PD days, parent-teacher
conferences, trimester boundaries) get their own spanning row on the
Timeline at every zoom level, their own header dropdown, and a banner on
the Day agenda when the selected date falls in one.

**Assessments** (Initial/Summative ELPAC, IXL Math Diagnostic, STAR
Reading, Avanza ELD Diagnostic, CAST IA-I/II, SBAC, etc.) get the same
treatment: their own spanning row (amber accent, to tell it apart from
the red Key Dates row), their own header dropdown, a banner on the Day
agenda, and a click-through detail popup. Note that some windows (Initial
ELPAC, for instance) are intentionally very wide - "must be completed
within 30 calendar days of enrollment" - so that bar spans nearly the
whole year; that's accurate to the sheet, not a rendering bug.

## Favicon and "last updated"

The favicon is an inline SVG data URI in `index.html`'s `<head>` (a
simplified graduation cap in the portal's own purple) - no separate image
file to keep track of. The footer shows "Last updated on <date> at
<time>," driven by the `LAST_UPDATED` constant near the top of `app.js`.
**Bump that constant every time you regenerate `data/all_grades.json`**
from the sheet - it's not automatic.

## Resource links

The sheet's "Resources" column is often a hyperlinked doc title (e.g. "Copy
of Integrity 10/13" linking out to a Google Doc) rather than a visible URL -
openpyxl exposes that as a separate `cell.hyperlink` property, not the
cell's text value, so a plain text export was silently dropping the link.
`scripts/parse_grades.py` captures `resources_url` from the hyperlink
target when present, and the portal renders it as a clickable
"Resources ↗" link (opens in a new tab) inside the unit and lesson detail
modals, wherever a resource is attached.

## Why the data comes from the "All" tab, not a per-grade tab

The portal originally parsed the "3rd" tab directly, since it was already
filtered to Grade 3. That tab turned out to be a separately-maintained
copy that had drifted out of sync with "All" (the tab every grade's data
actually lives in) - most visibly, "3rd" was missing 17 of Math's 18
individual lessons, and had 10 assessment rows where "All" has 13. "All"
is the source of truth for every grade, so `scripts/parse_grades.py`
reads it directly and splits rows out by grade using the comma-separated
Grade Level column (shared rows like Values Block, Assessment, and Key
Dates list multiple grades there - the same row is copied into each
applicable grade's bucket, tagged with the same original `_row` so the
portal can de-dupe it when several of those grades are viewed together).

## Data-quality gaps found and handled generically

The "All" tab has several inconsistent column-entry patterns across
different grades/subjects - all handled in `scripts/parse_grades.py` by
detecting the *shape* of the data (never by hardcoding a subject or grade
name), so the same fix self-applies wherever the same pattern recurs:

- **No Section-number column for some grades.** Most grades have "All"'s
  native Section column filled in, but it's blank for every row in
  Grades 3, 6, 7, and 8. For those, unit numbers are reconstructed from
  row order instead (`reconstruct_missing_section_numbers()`): within
  each subject+curriculum pair, a Section row starts a new unit, and
  every Lessons row after it inherits that number.
- **Missing " Section"/" Lessons" suffix.** Several grades have Section
  rows labeled just `"2: Math"` instead of `"2: Math Section"`.
  Disambiguated from a real Lessons row by whether a lesson_number is
  present and shaped like one (`classify_label()`,
  `looks_like_lesson_number()`).
- **Skipped Language of Instruction column.** A subset of rows (Grade
  6-8 Math, for one) skip column D entirely during entry, shifting
  curriculum/section/topic/etc. one column left of the standard schema.
  Detected because column D should only ever hold blank/English/Spanish
  (`detect_column_shift()`).
- **Section number typed into the Curriculum column.** Grade 6-8 Science,
  and part of Grade 6-8 SLA, put the section number in the Curriculum
  slot with the real Section Number column left blank. Detected because a
  bare digit is never a real curriculum name
  (`fix_compact_curriculum_slot()`).
- **Topic/dates/standards packed into the wrong columns.** Some of the
  same Grade 6-8 Science/SLA rows, when they do have a topic, dates, or
  standards, packed them into the columns immediately after the section
  number instead of their normal positions - skipping the four
  lesson-only columns those Section rows never use
  (`fix_compact_topic_dates_standards()`).
- **Real two-date lessons/sections entered one column early.** 227 rows -
  nearly all of Grade 4's ELA/SLA lessons, plus some Grade 3 ELA/SLA/
  Science and Grade 1-2 Science rows - have a genuine start_date AND a
  different end_date, but both were typed one column early: the real
  start_date landed in the Resources column and the real end_date landed
  in what the standard schema calls start_date, leaving the schema's
  end_date column blank. Detected purely by type: a raw date value in
  the Resources cell is never a legitimate resource (real resources are
  always hyperlinked doc titles) (`fix_resources_slot_date_shift()`).
- **Topic in the lesson_number slot.** Several bare-label Section rows
  (verified in Grade 2 Math/Science/SLA) put the module/topic name one
  column late, in the lesson_number slot, leaving the real topic column
  blank (`fix_bare_section_topic_slot()`).
- **One mislabeled section header.** Grade 3's Math Module 2 is labeled
  "... Lessons" instead of "... Section" - the only row with no lesson
  number or date and a topic reading like "Module N: ..."
  (`fix_mislabeled_section_header()`).
- **Mojibake in Spanish text.** A chunk of Social Studies rows had UTF-8
  text that got misread as MacRoman encoding at some point before it
  reached the sheet (`¬øQu√©` instead of `¿Qué`) -
  `scripts/parse_grades.py` detects and reverses this automatically
  (`fix_mojibake()`).
- **Some grade/subject pairs are simply missing from "All" today** - e.g.
  Grade 1 has no Math or ELA rows at all yet. Not a parsing issue; the
  content isn't in the sheet.
- **A lot of individual lesson- and unit-level rows have no date at all.**
  In Grade 3 alone, 34 ELA lessons and 34 SLA lessons (out of 184 and 195
  respectively) have every date column blank in "All," even though the
  parent unit around them is dated - so those specific lessons never get
  a Timeline chip or a Weekly Planning slot. They aren't lost, though:
  click the parent unit's Units-row bar and every lesson in it is listed
  there regardless of whether it has a date. This is the single biggest
  reason a lesson can look "missing" - it's real data with no date to
  place it on a date-based view.
- **A handful of rows are dated for the wrong school year.** 11 Grade 1
  and Grade 2 Science section rows carry dates from August-November 2025
  (last year's calendar) rather than 2026-27, so they fall completely
  outside the range the Timeline renders (`YEAR_START`/`YEAR_END` in
  `app.js`) and won't appear anywhere, even in a unit modal, since the
  Units row itself never gets built for an out-of-range date. This looks
  like the sheet wasn't fully rolled over to the new school year for
  those rows - worth a direct flag to whoever maintains "All," since
  guessing the intended 2026-27 date risks being wrong in a different way.
- **~600 rows genuinely span more than one day** - most of Grade 4's ELA
  and SLA lessons in particular (each lesson typically runs 2 days), plus
  smaller pockets in Grade 3 ELA/SLA/Science and every grade's Values
  Block. These were mis-parsed until a fix landed for both bugs at once
  (see `fix_resources_slot_date_shift()` below) - if a lesson/unit looks
  like it's only shown on one day when it should run longer, check
  whether it was affected by that same column pattern in "All."

## Regenerating data from the sheet

```bash
pip install openpyxl --break-system-packages
python3 scripts/parse_grades.py path/to/downloaded-workbook.xlsx data/all_grades.json
```

Download the workbook as `.xlsx` from Google Sheets first
(File → Download → Microsoft Excel). Also bump `LAST_UPDATED` near the
top of `app.js` to the current date/time - it's not automatic.

## Project structure

```
index.html / style.css / app.js   the app
scripts/parse_grades.py           xlsx -> data/all_grades.json parser
data/all_grades.json              parsed data, one entry per grade (TK, KN, 1st-8th)
```

## Deploying to GitHub Pages

```bash
git init
git add .
git commit -m "Initial commit: scope & sequence portal"
git branch -M main
git remote add origin <your-new-github-repo-url>
git push -u origin main
```

Then in the repo's Settings → Pages, set the source to the `main` branch,
root folder.
