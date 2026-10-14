# Format-31 reading: AZ-303 regression

## Scope and result

The user-supplied AZ-303 specimen has magic `85 A8`, version bytes `03 01`, size 14,974,395 bytes and SHA-256 `ecce689eccd8af3cbff339d2e198fe15f01ffd76dbd296e623355351a28ea128`.

The previous reader applied a format-60–62 header immediately after the version, interpreting legacy ciphertext as a pool length of 1,929,296,418 bytes. This failure happened before AES; moving the file or supplying a modern base64 pool could not correct the layout.

The implemented **format-31** branch now reads **246 questions**, with zero untrusted/empty questions and no external pool. Breakdown: 136 single-choice, 29 multiple-choice, 14 drag-and-drop, 67 hot-area. There are 81 area-image records. The input Buffer remains unchanged.

Actual application evidence: [macOS arm64 packaged smoke](validation/packaged-macos-az303-arm64.json), 12 checks, including opening once through real startup/preload IPC, starting the examination, decoding an interactive image in Chromium, selecting a hot area and saving a session. [Reader report](validation/legacy-az303-reader.json) records structural checks and specimen identity; it does not contain question text or the file itself.

## Static evidence (not native runtime observation)

The local Capstone/pefile disassembly of the supplied `player.exe` was reused; no new REA/Hopper session or legacy network request was opened. Player SHA-256: `3d71413240fc39f0c264ffb945a9140b4b8f274a4b22ecf924967cdcc359101c`, PE image base `0x400000`.

Relevant native addresses:

- `0x8ee4fc`: magic/version parsing. This historical Player accepts a different version range from the modern reference converter.
- `0x8ef228`: dispatcher selecting legacy transforms; format 31 uses the default transform installed through `0x636a0c`.
- `0x891c53`: properties layout for the 31–34 family. Only **31** is enabled in this implementation.
- `0x634ad4`: byte-polynomial helper.
- `0x634ae8`: state update using sine and x87 rounding.
- `0x6366a8`: encrypted string reader, resetting state and decoding marker/length.
- `0x635074` / `0x63510c`: stream body decoding, including the `0xf000` state/index reset.
- `0x6361a0`: encrypted stream record.
- `0x635c3c`: encrypted length but raw payload for an opaque properties stream.
- `0x6369ec`: skips six bytes at the start of a legacy question record; these are not a modern encrypted reserved array.
- `0x8eef68`, `0x8ef098` / `0x8ec1d4`: exam/question indexing and section list. No modern `td17` reserved array separates sections from exams.

Local disassembly remains under `/tmp/kp/`: `legacy-string-read.asm`, `body-decode.asm`, `props31-tail.asm`, `legacy-stream-helpers.asm`, `reader-body-methods.asm`, `legacy-question-skips.asm`, `legacy-math.asm`. These paths are investigation scratch, not shipped dependencies or retained REA Evidence IDs.

## Cipher implemented in `src/main/vce/legacy.ts`

Each record resets state to 128. Read a marker at index 0 and four encrypted signed little-endian length bytes at indexes 1–4. Update state after each byte, including the marker. The payload starts at index 5.

For encoded byte `enc`, decoded byte `dec`:

```
dec = enc ^ state
poly = (((enc ^ dec) | 1) * ((enc + dec) ^ 1)) & 255
state = (roundEven(state * sin(poly)) ^ (index & 255)) & 255
```

Increment the body index; at `0xf000`, reset state to 128 and index to zero. Lengths are checked by the bounded byte reader before copying/allocating the payload. Copies use `Uint8Array.from`, because `Buffer.slice()` aliases the input and would corrupt subsequent state updates and the original file.

One independent captured vector is retained in tests: `7a fc c5 39 22 bb fc 75 62 97 5d` decodes to `AZ-303`. Synthetic fixture encoding does not import the production decoder.

## Layout and rich text

Unlike modern formats, there is no `typeCodeLen` or pair of AES pools after version 31. Number/title/file-version strings use the legacy cipher. Properties include four 64-bit timestamp fields, flags, an optional author stream and a separate opaque raw-body properties stream. Shared styles and description follow as encrypted streams. Sections and exams use their own counts and strings. Each question has six prefix bytes followed by the type and its family-specific records.

The specimen contains both TRichView main separators `-8 1 3 1` and `-8 1 2`. Treating only the first as valid produced 28 empty/untrusted questions even after record boundaries were correct. Both separators now work in the legacy branch. Text with the TRichView UTF-16 flag is decoded as UTF-16LE instead of stripping NULs from byte data.

The reader supplies area images as `<img>` markup, whereas the renderer's interactive image stages need `img.src` URLs. `areaImageSource` now extracts the source without inserting markup into the DOM and also accepts existing data-URL fixtures/session data. This corrects real hot-area and placement backgrounds for modern files too.

## Verification and limits

- Unit/typecheck: **50 tests pass**. Legacy regressions cover all ten type codes, both rich-text separators, absent/present author, optional trailer, a captured number vector, large-record resets, Buffer immutability, invalid/truncated lengths, Unicode and image-source extraction.
- `npx tsx scripts/verify-legacy.ts /path/to/AZ-303.vce /tmp/report.json`: confirms structural choice/hot-area answer validity, nonempty trusted questions, image signatures/JPEG endings and unmodified input, without external pools.
- Package smoke uses an isolated temporary profile, loopback CDP and real IPC; profile/process cleaned up. It tests one interactive legacy image, not every image/pixel.
- An opaque eight-byte trailer after the declared file length is consumed when present; its purpose/authentication is unknown. Containers ending at the declared length are also accepted. Other residual lengths are rejected.
- Actual answer correctness has **not** been independently compared with the original Player. Type codes not present in this specimen have synthetic, not real legacy-file, coverage.
- Formats 30, 32–34 and other unsupported layouts remain rejected explicitly. One format-31 specimen is not exhaustive legacy compatibility evidence.
- This cipher is unrelated to protected modern AES pools. Modern automatic key recovery remains unresolved; the strict modern corpus still reports 14 `NEEDKEY`. No hardcoded keys or legacy endpoint dependency were added.
