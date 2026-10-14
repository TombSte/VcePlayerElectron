# UI screenshots — before / after

## before/ — original VCE Player (Visual CertExam, Windows/Delphi)

Screenshots taken from the shipped help file (`VCESHelp.chm`) of the original
player. These are the parity baseline:

| File | Screen |
| --- | --- |
| `player_window.png` | main window: File/Exam/Help menu, Title + File Name table, vertical button column (Start…, Add…, Change…, Remove, Properties, History) |
| `exam_list.png` | exam list |
| `start_an_exam.png` / `exam_mode.png` | exam-mode selection |
| `examination_window.png` | examination window |
| `item_review.png` | item review |
| `score_report.png` | score report |
| `score_history_window.png` | score history |
| `options_general.png` / `options_administrative.png` / `options_password.png` | options tabs |
| `exam_file_properties.png` | exam file properties |

## after/ (this repo, generated)

Regenerate with `npm run screenshots` (writes into this directory).

| File | Screen |
| --- | --- |
| `main-light.png` | exam library, light theme |
| `main-dark.png` | exam library, dark theme |
| `main-high-contrast.png` | exam library, high-contrast theme |
| `options-dialog-light.png` | Options dialog, light theme |
| `options-dialog-dark.png` | Options dialog, dark theme |
| `history-light.png` | History / Saved sessions, light theme |
| `history-dark.png` | History / Saved sessions, dark theme |
| `dnd-placement.png` | placement editor (Build List and Reorder) captured by `scripts/smoke-dnd.cjs` |

## Design system

All screens consume the same tokens declared in
`src/renderer/src/styles/app.css`:

- **colour**: surfaces, borders, text, brand accent and status colours;
- **typography**: system font stack, `--font-size` scale, weights, line heights;
- **spacing**: `--sp-1 … --sp-8`;
- **radii**: `--r-xs … --r-pill`;
- **elevation**: `--shadow-1 … --shadow-3`;
- **motion**: `--t-fast` / `--t-med` with a single easing curve.

Themes switch by setting `data-theme` on `<html>` (`dark`, `high-contrast`;
unset = light) and are driven by Options → General → Color scheme.

Native form controls (buttons, inputs, selects, checkboxes, radios, ranges,
scrollbars, focus rings) are fully re-styled, so no browser-default appearance
remains.

## Accessibility

`npm run check:contrast` parses the token blocks and asserts WCAG 2.1 contrast
on the semantic text pairs for all three themes (AA: 4.5:1 normal text, 3:1 for
subtle/large). Current result: **AA OK**.

Reduced-motion is honoured via `prefers-reduced-motion`.
