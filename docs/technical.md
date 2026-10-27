# Technical guide

[Back to the project overview](../README.md)

Independent VCE Player remake using Electron 33, TypeScript, React 18 and electron-vite. Parsing and AES-256-CBC record decryption run in the main process; the renderer uses an isolated preload API. No original executable, DLL or reference exam is bundled.

## Current status

UI, exam modes, scoring, history/export and synthetic question-type tests are implemented. **Automatic reading of every `.vce` is not complete.** Protected files still need an externally supplied decrypted key pool. Successful builds and zero parse errors do not establish full format compatibility.

- Latest unit suite: 50 tests; typecheck passes.
- Legacy format 31: AZ-303 reads 246 trusted questions without a manual pool; packaged macOS arm64 smoke passes, including an interactive image.
- Real corpus: `pass=1 fail=0 needsKey=14 parseFail=0` across 18 files (three additional files print `OK` without reference expectations).
- Manual base64 pools read all five required protected reference files without decryption warnings.
- macOS arm64/x64 DMG and ZIP, plus Windows x64 NSIS installer, are built.
- Packaged macOS arm64/x64 smoke tests pass. Windows installation/launch remains **unverified on Windows**.

Evidence and remaining acceptance requirements: [docs/validation.md](validation.md).

## Features

- Persisted exam list; add/change/remove files, folder scan, `.vce` command-line and OS open handling.
- Single/multiple choice, Case Study, Fill in the Blank, Hot Area, Point and Shoot, Drag and Drop, Select and Place, Create a Tree, Build List and Reorder, Drop and Connect. Interactive placements and ordering support mouse/keyboard. Synthetic fixtures cover reader mappings and scoring; this is not proof that every original file parses.
- Exam modes: all questions, selected sections, a question count, a question range, previously incorrect questions. Training mode and question/choice randomization.
- Timer/pause, Previous/Next, Mark, Reset, Show Answer, Calculator, Exhibits, Instructions, Print Item, Save Session and End Exam.
- Question navigation/status grid; review All/Incomplete/Marked; score report, per-section results, print/PDF and text export.
- Persisted score history and sessions; TXT/CSV/XML history exports.
- Shared modern styling, light/dark/high-contrast themes, text sizing; Options with General/Administrative/Password tabs.

Detailed parity checklist and screenshots: [docs/parity.md](parity.md), [docs/screenshots](screenshots).

## Development and validation

Node 22+ is required for the packaged smoke script's built-in WebSocket client.

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run smoke:parity
npm run smoke:training
npm run test:reader -- /path/to/reference/Files
```

`test:reader` now exits nonzero for **any** `NEEDKEY`, failure or parse failure. To examine partial-reader results without treating missing keys as a successful acceptance run:

```bash
npm run test:reader -- /path/to/reference/Files --allow-needs-key
```

No reference files or keys are included. Use files and decrypted pools you are entitled to access.

Verify a local format-31 specimen without printing its question contents:

```bash
npx tsx scripts/verify-legacy.ts /path/to/AZ-303.vce /tmp/legacy-report.json
```

## Build and install

```bash
npm run dist       # on macOS: macOS arm64/x64 DMG/ZIP + Windows x64 NSIS
npm run dist:mac   # macOS only, on macOS
npm run dist:win   # Windows x64 NSIS
```

Artifacts are written to `dist/`; SHA-256 values for the verified build are recorded in [docs/validation/SHA256SUMS](validation/SHA256SUMS). Rebuilds may produce different hashes.

- **macOS:** open the matching architecture DMG, drag `VCE Player.app` into Applications, then launch. ZIP builds can be extracted and the app copied to Applications. Builds are ad hoc signed but not notarized. If blocked, after trying to open the app, go to System Settings → Privacy & Security → Open Anyway. Only approve a build whose origin and hash you trust. Gatekeeper behavior must be verified on a clean Mac.
- **Windows:** run `VCE Player-0.1.0-win-x64.exe`. NSIS supports per-user installation, destination selection and shortcuts. Installer/executable are unsigned; Windows runtime and `.vce` association acceptance still require a Windows machine.

Build configuration registers `.vce` associations on both platforms. An explicit `--user-data-dir=/absolute/path` selects an isolated profile without changing normal user data.

### Packaged-app smoke test

This launches the **actual packaged executable**, not a mocked Electron shell. It exercises preload/IPC, command-line opening, reader output, Options, Exam Mode, examination controls, keyboard marking and session persistence. It uses and removes a temporary profile and reports renderer errors. CDP is bound to loopback only during the test; normal app launches do not enable remote debugging.

```bash
npm run smoke:packaged -- \
  "dist/mac-arm64/VCE Player.app/Contents/MacOS/VCE Player" \
  /path/to/readable.vce \
  docs/validation/local-packaged-smoke.json
```

On Windows, run the same script against the **installed** `VCE Player.exe` with a readable real `.vce`. It needs Node 22+ and does not install NSIS itself. See [docs/validation.md](validation.md) for recorded macOS results and the outstanding Windows checklist.

## `.vce` format and external keys

The container starts with `85 A8` and version bytes (`major*10+minor`). Implemented layouts: **31 and 60–62**. Other versions receive an explicit unsupported-format error.

Format 31 uses a legacy per-byte cipher, separate properties/style streams and six-byte question prefixes, not AES or external key pools. The supplied AZ-303 specimen now opens automatically: 246 questions, 0 untrusted. Both TRichView stream versions observed in it and UTF-16 text are handled. See [legacy evidence](format31-re.md); this is not proof that every legacy variant works.

For formats 60–62, the header carries a 1024-byte `keys` pool and a 2304-byte `encryptKeys` blob. Array lengths consist of an ignored marker and four bytes XORed with `[0,1,2,7]`.

Encrypted records contain a selector, a 32-bit `globalOffset` for version >= 61, and AES-256-CBC ciphertext without padding. Key/IV are pool slices `[offset:offset+32]` / `[offset+32:offset+48]`. Selectors below `0x80` use `keys`; protected selectors need a decrypted pool. Question bodies use TRichView-style rich text converted to HTML.

The on-disk `encryptKeys` blob is **not generally a usable decrypted pool**. The current reader tries it when no external pool is provided; results can be partial, invalid or require a key. Older versions can also have unreadable protected metadata: do not assume every format-60 file is fully readable.

For a protected file, select **File → Open with Decrypt Key…** and provide the already decrypted pool encoded as base64. Base64 is an encoding, not a decryption algorithm. This pool is distinct from a file-opening password.

Automatic pool recovery is unresolved. Static analysis identifies a key-request/cache path in the original player; it does **not** establish a local RSA derivation algorithm or an embedded production private key. `init_read_key` is used in activation/licensing and has not been shown to derive file pools. No request to the original key server is made by this app.

Evidence, hypotheses and remaining reverse-engineering work: [docs/keypool-re.md](keypool-re.md).

## Layout

```text
src/main/                 window, IPC, persistence, native TypeScript VCE reader
src/preload/              isolated window.api bridge
src/shared/               domain types and rich-text conversion
src/renderer/             React app, questions, exam UI, dialogs, scoring/export
scripts/                  reader validation, parity and packaged smoke tests
 tests/                   synthetic reader/scoring/modes/export tests
 docs/                    parity, screenshots, reverse-engineering and validation evidence
```

## Releases

Pushes to `main` or `prod` trigger [`.github/workflows/release.yml`](../.github/workflows/release.yml): typecheck and unit tests run first, and only on success a version is created from Conventional Commits (`main` → prerelease `X.Y.Z-rc.N`, `prod` → stable `X.Y.Z`), then macOS (arm64 + x64 DMG/ZIP) and Windows (NSIS x64) packages are built on GitHub and attached to a GitHub Release with `SHA256SUMS`.

```bash
npm run release:version   # convention: BRANCH=main|prod; DRY_RUN=1 for a local preview
npm run release:notes     # extracts the CHANGELOG section into release-notes.md
```

macOS builds are ad hoc signed and not notarized; Windows builds are unsigned. Packaged `.vce` smoke validation stays manual. Details, prerequisites and recovery steps: [docs/release.md](release.md).

## Remaining work

1. Establish and implement automatic per-file key-pool recovery; validate the five required files and the entire corpus without external pools.
2. Install/run the NSIS build on Windows and open a real `.vce`; verify shell association behavior on both platforms.
3. Re-run packaged validation and update artifact hashes after any application change.

Developer ID signing, notarization and localization are not implemented.
