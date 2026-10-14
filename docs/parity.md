# Feature parity checklist (original VCE Player)

Sources: the shipped `VCESHelp.chm` (player help topics) and the original
`player.exe` UI. Verified automatically by `npm run smoke:parity`
(no console errors) and the other smoke scripts.

## Menu bar

| Original command | Shortcut | This app |
| --- | --- | --- |
| File → Add… | Ins | ✅ menu + shortcut |
| File → Change… | F2 | ✅ menu + shortcut |
| File → Remove | Del | ✅ menu + shortcut |
| File → Properties | — | ✅ |
| File → Exit | Alt+F4 | ✅ (window close) |
| File → Open with Decrypt Key… | — | ✅ (extra; manual key fallback) |
| Exam → Start… | F5 | ✅ menu + shortcut |
| Exam → Select All | Ctrl+A | ✅ menu + shortcut (multi-select with Ctrl/Cmd-click) |
| Exam → History | — | ✅ |
| Exam → Options… | — | ✅ |
| Help → Quick Start | F1 | ✅ menu + shortcut |
| Help → VCE Player on the Web | — | ✅ |
| Help → About | — | ✅ |

## Options dialog (3 tabs)

- **General**: randomize questions/choices, Previous/Review, Show Answer, Pause,
  View Answers, Calculator, text size, colour scheme, scan folder on startup. ✅
- **Administrative**: filename column, real exam/question numbers, disable
  history clearing, disable exam-list editing, disable exam mode, disable timer
  change, disable file properties, disable report printing. ✅
- **Password**: enable admin password, set it, require it to start an exam / view
  history. ✅

## Exam Mode dialog (5 modes)

1. Take selected exam ✅
2. Take questions from selected sections only ✅
3. Take N questions from the entire exam file ✅
4. Take a question range N–M ✅
5. Take questions answered incorrectly N or more times ✅

Plus candidate name, Training mode, Timer on, custom time limit. ✅

## Examination window

| Original | Shortcut | This app |
| --- | --- | --- |
| Mark | Alt-M | ✅ |
| Time Remaining | — | ✅ (timer chip, turns red when low) |
| Show/Hide Answer | Ctrl-S | ✅ |
| Exhibit / Exhibits | Alt-X | ✅ (modal with exhibit image/reference) |
| Calculator | — | ✅ |
| Previous | Alt-P | ✅ |
| Next | Alt-N | ✅ |
| Review | — | ✅ |
| Print Item | Alt-R | ✅ (offscreen iframe print) |
| Pause | Alt-S | ✅ |
| Save Session | Alt-V | ✅ |
| End Exam | Alt-E | ✅ |
| Instructions | Alt-I | ✅ (per-question-type help) |
| Reset | — | ✅ |
| Case Study / Question tabs | Alt-C / Alt-Q | ◑ testlet/question-set sections are parsed and labelled per question; dedicated tabs are not split out |
| Number keys select a choice | — | ✅ (extra) |
| ← / → navigate | — | ✅ (extra) |

## Score Report

- Score, pass/fail, per-section breakdown, elapsed time, candidate, date. ✅
- Review Answers, Retake, Print (PDF via the print dialog). ✅

## Score History + Saved Sessions

- History table (date, candidate, exam, score, result), selected-record detail,
  retake of incorrect/marked, export TXT/CSV/XML, clear history. ✅
- Saved sessions list with resume and delete. ✅

## File opening

- Administrator password gate before starting an exam / viewing history
  (Options → Password). ✅
- Manual base64 `decryptKeys` fallback ("Open with Decrypt Key…"). ✅
- Automatic key-pool derivation: **not yet solved** — see `docs/keypool-re.md`.

## Question types

Multiple Choice (single/multi), Fill in the Blank, Select and Place,
Point and Shoot, Hot Area, Create a Tree, Build List and Reorder,
Drop and Connect. ✅ (see `tests/reader.test.ts` and `tests/scoring.test.ts`)
