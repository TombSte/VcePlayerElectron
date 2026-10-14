# Releases

Push di release automatiche da `main` e `prod`, con versioning da Conventional Commits e pacchetti macOS + Windows pubblicati come GitHub Release.

## Canali

| Branch | Canale   | Versione risultante | GitHub Release |
| ------ | -------- | ------------------- | -------------- |
| `main` | prerelease | `X.Y.Z-rc.N` (es. `0.2.0-rc.0`) | pre-release |
| `prod` | stabile  | `X.Y.Z` (es. `0.2.0`) | release stabile |

## Flusso

Workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml), triggerato da `push` su `main` o `prod` (guardia `[skip ci]`).

1. **`test`** — `npm ci`, `npm run typecheck`, `npm test`. È il cancello: se fallisce non esistono tag né release.
2. **`version`** — `node scripts/ci/bump-version.mjs` calcola la versione da Conventional Commits, poi `commit-and-tag-version` aggiorna `package.json`/`package-lock.json`, scrive `CHANGELOG.md`, crea il commit `chore(release): vX.Y.Z [skip ci]` e il tag `vX.Y.Z`; il commit e il tag vengono pushati sul branch.
   - `main`: bump automatico + `-rc.N` (contatore incrementato a ogni push).
   - `prod`: promozione stabile (`X.Y.Z-rc.N` → `X.Y.Z`); senza suffisso `rc` fa bump automatico (hotfix).
   - Sempre almeno una patch: anche un push senza commit `feat`/`fix` produce una release.
   - Idempotenza: se `HEAD` è già taggato la versione esistente viene riusata senza bump.
3. **`build-macos`** (`macos-14`) — `npm run dist:mac` sul tag appena creato: 2 DMG (arm64, x64) + 2 ZIP.
4. **`build-windows`** (`windows-latest`) — `npm run dist:win` sul tag: installer NSIS `*-win-x64.exe`.
5. **`release`** — unisce gli artifact, scrive `VCE-Player-<version>-SHA256SUMS.txt` e pubblica la GitHub Release con 5 pacchetti + manifest. Su riesecuzione aggiorna gli asset esistenti (`gh release upload --clobber`).

Ogni run produce gli artifact `macos-packages`, `windows-packages` e `release-meta` (con `release-notes.md` e `release-meta.json`).

## Conventional Commits

- `feat:` → minor
- `fix:`, `perf:`, `revert:`, altri tipi → patch
- `BREAKING CHANGE:` nel footer o `!` dopo il tipo (es. `feat!:`) → major

Mappatura sezioni changelog: [`.versionrc.json`](../.versionrc.json).

## Verifica locale (dry run)

```bash
DRY_RUN=1 BRANCH=main node scripts/ci/bump-version.mjs   # stampa la prossima -rc.N
DRY_RUN=1 BRANCH=prod node scripts/ci/bump-version.mjs   # stampa la prossima stabile
```

Il dry run non modifica `package.json`, `CHANGELOG.md` e non crea commit/tag.

Verifica di estrazione note e manifest:

```bash
node scripts/ci/extract-release-notes.mjs 0.1.1-rc.0 --changelog CHANGELOG.md --out release-notes.md
node scripts/ci/collect-assets.mjs artifacts release-assets 0.1.1-rc.0
```

## Promozione `main` → `prod`

Entrambi i rami ricevono commit di release che toccano `package.json`, `package-lock.json` e `CHANGELOG.md`, quindi il merge di `main` in `prod` può andare in conflitto su quei tre file. La risoluzione non è critica: lo script ricalcola versione, CHANGELOG e tag da tag git + `package.json`, e non riusa mai una versione già taggata. Tenere il lato `main` è la scelta consigliata perché conserva il `CHANGELOG` più recente.

## File temporanei

`release-meta.json` (radice repo) e `release-notes.md` sono generati dal job `version` e pubblicati come artifact; `scripts/ci/collect-assets.mjs` scrive in `release-assets/`. Non vengono committati e non servono nel repository.

## Rilancio / recupero

- Dopo un build fallito usare **Re-run failed jobs**: il job `version` non viene rieseguito, quindi nessun doppio bump.
- Un rilascio interrotto dopo il push del tag può essere completato con **Re-run all jobs**: la guardia tag-su-`HEAD` riusa la versione esistente.

## Prerequisiti (una tantum)

1. Sorgenti committati su `main` con messaggi Conventional Commits.
2. Branch `prod` creato (es. `git push origin main:prod`).
3. **Settings → Actions → General → Workflow permissions: Read and write** (i job `version` e `release` dichiarano comunque `permissions: contents: write`).
4. Se la branch protection impedisce il push di `github-actions[bot]`, creare un secret `RELEASE_TOKEN` (PAT con `contents: write`) e usarlo come `token` del checkout del job `version` e come `GH_TOKEN` del job `release`.

## Limiti

- Build **non firmate e non notarizzate**: nessun signing/notarization in CI.
- Il workflow non esegue lo smoke pacchettizzato con file `.vce` reali: resta manuale ([`windows-packaged-smoke.yml`](../.github/workflows/windows-packaged-smoke.yml), `npm run smoke:packaged`).
- `docs/validation/*` non viene aggiornato automaticamente.
