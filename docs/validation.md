# Validation ledger — updated 2026-10-14 UTC

This ledger records measured results, not a claim that the whole remake is finished.

## Build and test results

- `npm run typecheck`: passes, both node and web projects.
- `npm test`: **50/50 pass**; includes manual base64 pool selection, format-31 cipher/container regressions, ten legacy question types, both rich-text versions, Unicode and image-source normalization.
- `npm run smoke:parity`: **12/12 pass**, no renderer console errors. This uses synthetic fixtures/mocked IPC; it is separate from packaged verification.
- `npm run dist`: **exit 0** on macOS arm64; generated all five requested distribution artifacts.
- `npm run test:reader -- /tmp/vce_refs/sneklyudov_Converter/ExamUniverse.Converter.VCE.Tests/Files`: **exit 1**, `pass=1 fail=0 needsKey=14 parseFail=0`. Three files additionally print `OK` without an expected result. The strict exit now treats `NEEDKEY` as unfinished automatic reading. `--allow-needs-key` is diagnostic only.

Reference corpus: `https://github.com/sneklyudov/Converter.git`, commit `02dca951dde12bc7feaddae0dff96b61f5101bca`. Reference exams and decrypted pools are not shipped in this repository.

## Disabled section-only mode

In `ExamModeDialog`, “Take questions from selected sections only” remains disabled
when the selected exam has no section metadata. It now visibly dims with a
not-allowed cursor, exposes `aria-disabled`, and explains “No sections available”
with a tooltip and inline hint. This distinguishes unavailable from selectable.
The parity smoke switches to a synthetic sectionless exam and verifies the native
disabled state, rendered opacity, accessibility attribute and explanation.

## Training-mode answering regression

`ExamRunner` previously passed `readOnly=true` whenever training mode was enabled,
blocking every mouse/text/placement answer editor. It now makes only non-exam
phases read-only; showing correct answers does not disable answering. The
Show/Hide Answer toggle remains enabled when the answer is hidden, and review
cannot change or reset responses.

`npm run smoke:training` exercises the built React renderer and real preload with
synthetic IPC fixtures and an isolated temporary profile. Before the fix it fails
on disabled training inputs. After the fix **43/43 checks pass**, covering all ten
question editors, stored answers, incorrect/correct feedback, reset, correct-answer
auto-advance, Show/Hide, score history and read-only review. No renderer/preload
errors. [Recorded output](validation/training-mode-smoke.txt).

Post-fix: **50/50 unit tests**, both typechecks, build and **12/12 parity smoke**
pass. Installers rebuilt; packaged macOS arm64/x64/DMG and AZ-303 smokes re-run.

## Artifacts

All live in `dist/` (ignored by Git):

- `VCE Player-0.1.0-mac-arm64.dmg`
- `VCE Player-0.1.0-mac-arm64.zip`
- `VCE Player-0.1.0-mac-x64.dmg`
- `VCE Player-0.1.0-mac-x64.zip`
- `VCE Player-0.1.0-win-x64.exe` — NSIS, 82,179,937 bytes.

All five artifacts and SHA-256 hashes were refreshed after the training-answering and disabled-section UI fixes. Actual packaged macOS arm64 bundle, x64/Rosetta bundle, arm64 DMG installation, and AZ-303 arm64 bundle smokes were re-run against this build.

Hashes: [validation/SHA256SUMS](validation/SHA256SUMS). Verify from the repository root:

```bash
shasum -a 256 -c docs/validation/SHA256SUMS
```

Electron 33.4.11, electron-builder 25.1.8. Builds are unsigned; macOS builds are not notarized. Signing, Gatekeeper and SmartScreen acceptance are not established by these tests.

## Actual packaged macOS smoke

Command: `npm run smoke:packaged -- <packaged-executable> <real-vce> <report.json>`.

Evidence:

- [arm64 bundle](validation/packaged-macos-arm64.json): **11/11 pass**.
- [x64 bundle](validation/packaged-macos-x64.json): **11/11 pass**, running through Rosetta on the arm64 host; not a native Intel-host test.
- [arm64 DMG installation](validation/packaged-macos-dmg-arm64.json): **11/11 pass**. DMG mounted read-only with `hdiutil`; app copied with `ditto` into a temporary installation directory and launched there. Mount and installation directory cleaned up afterwards. No `/Applications` change.

The real specimen `my.exam.v9.vce` has SHA-256 `cb24ccc08eff5fb4da35d724b392dacf2ccd0a0c04b268c54a0dccbb1f02ae5e`, format 62, six questions. It opens without an external pool. The smoke confirms:

1. Actual app launches renderer from packaged `app.asar`, not dev server.
2. Startup `.vce` arrives over real preload/IPC and is inserted **once**.
3. Exam selected in the visible UI.
4. Reader returns six nonempty trusted questions without decryption warnings.
5. Options exposes General/Administrative/Password tabs.
6. F5 opens the five exam modes.
7. Real exam starts; expected examination controls exist.
8. Alt+M marks a question.
9. Save Session persists through real IPC/electron-store.
10. Temporary isolated profile contains one exam and one session; normal user data untouched.
11. No renderer console/runtime errors.

A first run on the format-60 `microsoft.98-366…` file found protected/corrupted metadata and failed the strict readability check. It was **not** counted as success. Full compatibility for older versions remains unproven.

### Startup defect fixed

The previous main process assigned `pendingOpenPath` but never consumed it. Sending an open event at DOM load was also too early for the React listener. Main now queues pending paths; preload sends readiness **after** installing the listener. Renderer alone writes the exam-list entry, avoiding main/renderer duplicate insertion. Explicit `--user-data-dir=...` isolates storage before the single-instance lock.

## AZ-303 legacy regression

The supplied `/tmp/AZ-303.vce` is format **31**, SHA-256 `ecce689eccd8af3cbff339d2e198fe15f01ffd76dbd296e623355351a28ea128`, 14,974,395 bytes. Its layout does not contain the modern AES header pools; interpreting it as format 60–62 caused the original `needed 1929296418 bytes at offset 13` error.

- [Reader evidence](validation/legacy-az303-reader.json): **246 questions**, 0 untrusted, no decryption warnings, no external pool, input unchanged. Choice/hot-area answers pass structural checks; 81 area-image records have valid JPEG/PNG signatures and JPEG endings.
- [Actual macOS arm64 package](validation/packaged-macos-az303-arm64.json): **12/12 checks pass**, including real startup opening, starting the exam, rendering a legacy hot-area image in Chromium, selecting an area, marking a question and persisting a session.
- The smoke now summarizes IPC results before returning them through CDP. Its first legacy attempt timed out transporting full image-heavy exam data; the next revealed that `<img>` markup was being assigned directly to `img.src`. Neither failure was counted as success. The renderer now extracts the image source without inserting the markup into the DOM.
- Answers are not independently verified against the original Player; an opaque 8-byte trailer is not authenticated. Other legacy versions remain unsupported.

Reproduce with `npx tsx scripts/verify-legacy.ts /tmp/AZ-303.vce /tmp/legacy-report.json`. [Layout/cipher notes](format31-re.md). The specimen is not shipped.

## Manual key fallback

All five required protected files were re-read through the TypeScript reader with their external reference base64 pools:

- AZ-104 zolot: 240 questions, 0 untrusted, no warnings.
- AZ-104 sophie: 128 questions, 0 untrusted, no warnings.
- MD-100 wanglei: 116 questions, 0 untrusted, no warnings.
- AZ-900 2021-08-01: 237 questions, 0 untrusted, no warnings.
- `my.exam.v7`: 12 questions, 0 untrusted, no warnings.

Counts are observed totals across contained exams, not counts inferred from filenames. [Machine-readable result](validation/manual-key-reference.json). This verifies the **manual reader fallback**, not automatic derivation, and does not independently validate every expected answer.

## Windows still outstanding

NSIS production succeeds; native Windows installation/launch/open is **not tested**. Local cached Wine reports `wine-4.0.1`; it is not a Windows machine. A supplemental install attempt with an isolated temporary `WINEPREFIX` timed out at 240 seconds; Wine logged missing FreeType support. No result was counted as installation or runtime evidence, and the owned temporary prefix was removed.

On a Windows host:

1. Verify the installer hash and install using NSIS.
2. Launch the installed app; open a known readable real `.vce` and start an exam.
3. Run `npm run smoke:packaged -- "<installed-path>/VCE Player.exe" "<real-file>.vce" docs/validation/packaged-windows-x64.json` with Node 22+.
4. Double-click a `.vce`; verify shell association both with the app closed and already running.
5. Confirm manual base64 entry, session persistence, uninstall and shortcuts; record actual results.

The dispatch-only [Windows verification workflow](../.github/workflows/windows-packaged-smoke.yml) automates build, silent NSIS installation and packaged smoke against the pinned readable specimen. It has **not been run**; a workflow file is not Windows runtime evidence. Interactive association/uninstall checks remain separate.

## Original requirements accounted for

- Electron + TypeScript + React, modern UI: implemented; existing design/theme/screenshots and UI evidence in [parity](parity.md).
- Question types, dialogs/features, scoring, DnD, exam UI and export/print: existing seven completed tasks have synthetic/unit/smoke evidence. No claim of exhaustive original-file compatibility or comprehensive runtime comparison with the original.
- Automatic opening of every `.vce`: **not satisfied**. The five named protected files still need external pools. Modern full-Player/Designer analysis now links the random, RSA-wrapped pool to the cache/authenticated-request path and protected record reader; no matching private key or local recovery has been established. Strict corpus still reports `pass=1 fail=0 needsKey=14 parseFail=0`, exit 1. Independent necessary RSA bounds hold for 117/117 blocks across 13 reliable pairs, but do not recover any pool. See [modern evidence](modern-pool-re.md), [static report](validation/modern-player-static-evidence.json), and [envelope report](validation/modern-pool-envelope-bounds.json).
- Manual base64 fallback: implemented; unit and five-file reader verification pass.
- macOS/Windows installers: artifacts produced and hashes recorded; macOS package launch/open measured; **Windows native runtime acceptance remains open**.
- README, packaged E2E and explicit remaining requirements: recorded here.

The overall goal remains **unfinished**. Rebuild and refresh hashes/reports after subsequent main/preload/renderer changes.
