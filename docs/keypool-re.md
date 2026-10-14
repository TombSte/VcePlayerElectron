# `.vce` key-pool investigation

**Unresolved.** Manual base64 pools work; automatic recovery has not been implemented. No hardcoded reference-key database is shipped.

**Modern-target correction:** the supplied Player accepts only through format 44.
A newer full Player accepts through 63; its cache/request-to-reader linkage and
the Designer's RSA-wrapped random-pool envelope are now located. See
[modern protected-pool evidence](modern-pool-re.md) for acquisition hashes,
procedure addresses, reproducible bounds checks and remaining limitations.
The older-target findings below remain historical evidence, not proof of modern
pool derivation.

## Target identities

Supplied x86 Windows artifacts, not source code:

- `libcryptvce.dll`: SHA-256 `251df2a0871330c57859ea803dbe14c291d358213cd36172ba4bf62c13b4a10f`, image base `0x10000000`.
- `player.exe`: SHA-256 `3d71413240fc39f0c264ffb945a9140b4b8f274a4b22ecf924967cdcc359101c`, image base `0x400000`.

Local targets: `/tmp/vce_target/VCEPlayer/`. Reference converter/corpus: `sneklyudov/Converter`, commit `02dca951dde12bc7feaddae0dff96b61f5101bca`.

Static analysis establishes what this supplied player contains, not whether the vendor's current production player uses the same endpoint or behavior. No original-player network request was executed.

## Container facts

- Header magic `85 A8`, version `major*10+minor`.
- Header pools: `keys` 1024 bytes; `encryptKeys` 2304 bytes.
- Array prefix: ignored marker; four length bytes XOR `[0,1,2,7]`.
- Encrypted record: selector, optional signed `globalOffset` for version >= 61, AES-256-CBC ciphertext without padding.
- Selector `<0x80`: header `keys`; selector `>=0x80`: decrypted pool.
- AES key = pool `[g:g+32]`; IV = `[g+32:g+48]`.

The C# reference `FileReaderService.ReadFile(bytes, encryptKeys, decryptKeys)` accepts the decrypted pool externally and contains no pool recovery algorithm. It selects `decryptKeys` for high selectors **even for version 60**; only the offset field is version-gated.

**Correction to earlier notes:** using header `keys` for every format-60 record does not establish full readability. Both known format-60 specimens produce corrupted number/title metadata with that experiment. They may have readable questions while still requiring a protected pool. Current corpus results: [validation](validation.md).

## Reference-pair evidence

18 encrypted/decrypted pairs extracted from reference tests; 13 encrypted blobs match their file headers. Pairs for `my.exam.v3`, `.v4`, `.v5`, `.v6`, `.v8` have mismatched embedded encrypted blobs and are not reliable derivation examples.

With the external reference pools, the five required protected files read without warnings/untrusted questions: [manual verification](validation/manual-key-reference.json). This is not automatic reading and does not by itself prove every expected answer.

## DLL analysis

`init_read_key` (RVA `0x5120`, stdcall `ret 8`) parses DER/TLV-like input into large-number statics `0x10046540`, `0x10049570`, `0x1004c5a0`, `0x1004f5d0`. Its observed player caller is in activation/licensing code around `0x88c2xx–0x88c7xx`, alongside `init_create_key`, `set_activation`, `get_cert_info`. It has **not** been shown to derive file pools.

`FVCE30..33` exports (`0x4950`, `0x4bd0`, `0x4d20`, `0x4ec0`, stdcall `ret 0x10`) are wrapped by player installers around `0x634b6c..0x634c28`. They select per-byte transforms stored in `0x9994e0/0x9994e4/0x9994e8/0x9994ec`. Their relationship to protected pool recovery remains unknown. Beware old file-offset labels: player `.text` raw offsets convert to VA by adding **`0x400c00`**, not `0x400000`.

REA/Hopper function evidence:

- `ev_0cca5610dc1ae6039462cb40348c42afdfb2efe051d37ae21ddd074ace25c9f7`: xref `0x1000306b` to `gen_key_for_encrypted_vce` belongs to `sub_10002f90`. Pseudocode handles values 1024/2048/4096 and type values 2/3, calls crypto helpers. **Inference:** asymmetric key generation is a possibility; the name is not evidence of file-pool derivation. Caller and parameter tracing is still needed.
- `rsa_encrypt_pub_vce_ahslkjfhask` at `0x10036218`: xrefs `0x10003366`, `0x1000376c`; exact role not resolved.
- Mode strings `vce_exam_simulator_player` / `vce_exam_designer_suite` do not establish an AES seed or private key.

Embedded RSA PEM fixtures include library-test material. None has been established as the production private key for protected files.

## Historical supplied-Player key-request path

REA/Hopper evidence:

- `ev_99cde60a932c03da29b6846d70b8d947931b69628579b758cc291a53a1d4d709`: `sub_9683a0` calls `sub_964424`; method metadata names `OnDecryptExamKeyRequest`.
- `ev_070e970a965f539a0f9a88b4a685f722ac5b094cf1ed5108ce76eca165b3d7b0`: `sub_964424` calls cache-related routines around `0x962xxx`, then request/UI routines.
- `ev_7b8ef702873052e210bccb1c7f12f51535633a9201a81f756a3c5bb6b5584db8`: complete function dossier for `sub_88eda0`, the request thread's Execute method. Do not infer exact arguments solely from incomplete Delphi decompilation.

Retained dossier excerpts: [key-request evidence](validation/key-request-evidence.json). Full original records remain in `/tmp/kp/`.

Static VMT/assembly anchors, corroborating the thread dossier:

- Class shortstring `TDecryptExamKeyRequestThread` at `0x88b53b`.
- VMT self pointer `0x88b458`, class-name pointer at `0x88b420`, execute pointer at `0x88b460` -> **`0x88eda0`**.
- `sub_88eda0` creates an HTTP-related object, builds a string list and calls **`sub_87a898` at `0x88ef5c`** with URL pointer `0x88f254` and the request list.
- UTF-16 format strings: `email=%s` (`0x88f174`), `passwd=%s` (`0x88f194`), `key=%s` (`0x88f1b4`), `ver_app=%s` (`0x88f1e8`), `ver-lib=%d` (`0x88f20c`), `ver_file=%s` (`0x88f230`). URL: **`http://ava.22web.org/license.php`** at `0x88f254`.
- Returned data is converted at `0x88ef61..0x88ef6c`, processed into a string list through `sub_63cb9c`, and an integer result plus a key/error string stored in thread fields `+0x4c` / `+0x54`.

**Observation:** this supplied executable has a key-request/cache path with credentials/key/version parameters and a remote endpoint. **Inference:** at least some pool recovery may be server-assisted. **Unknown:** exact request encoding, response key decoding, cache key construction, file-reader linkage and whether a complete offline route exists. No conclusion that recovery is impossible locally yet.

Do not contact this plaintext-HTTP endpoint or send credentials to it. Do not add it as an app dependency.

## Bounded failed hypotheses

Previous local experiments found no match for the selected AES/CBC header-pool key/IV windows, simple XOR/hash chains, or RSA decryption with the selected embedded test PEMs against matching reference pairs. These are bounded negative results, not exclusion of every AES/RSA/stateful construction.

Unicorn helper `/tmp/emu_key.py` ran DLL initialization and `init_read_key`; no known decrypted-pool prefix was found in the scanned image/heap. That tests the licensing initializer, not every recovery path.

## Remaining decisions and probes

1. Use the **modern full target** for remaining protected-pool work. Its cache/request/record-reader linkage is now located.
2. Exact response conversion and cache formats remain incompletely reconstructed; decoding them does not itself supply a missing response or matching RSA private key.
3. Obtain user direction before integrating an authenticated official service or weakening the local/automatic requirement. Change the immutable goal through `/goal-tweak`, never silently. Do not contact the legacy plaintext endpoint or use credentials during investigation.
4. Any proposed recovery must still open all five required files without manual pool input; retain manual fallback without shipping a reference-key database.
5. Strict corpus acceptance remains zero errors **and zero `NEEDKEY`**. Native Windows installer/runtime evidence is independently pending.

## Local analysis state / provider limitation

Helpers and records: `/tmp/kp/{libdis.py,pdis.py,gen-key-evidence.json,thread-candidate.json,decrypt-dialog.json,request-key.json,thread-http.asm}`; snapshots `/tmp/{libcryptvce,player-key}.snap.json`; Python venv `/tmp/kp/.venv` has pefile/Capstone/Unicorn.

Last REA attempt at `0x87a898` failed with Hopper bridge readiness timeout and `cleanup_incomplete`; `/tmp/rea-Etc4Wq` was retained by REA. Ownership listed PID 45358, which no longer exists. A separate Hopper GUI process remains; do not kill a user's GUI session to clean up a timed-out provider. Do not repeatedly rerun the same failing provider call. Offline Capstone assembly remains usable, but native session shutdown acknowledgement was not established.
