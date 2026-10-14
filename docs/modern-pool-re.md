# Modern protected-pool evidence

**Automatic recovery remains unimplemented.** The investigated modern native
writer encrypts an independently random secret pool with an RSA public key. The
corresponding Player feeds its protected-record reader through a cache /
authenticated request path. No matching production private key or alternative
local recovery has been established. Manual base64 fallback still works.

## Correct the reference target

The originally supplied Player accepts header versions only through **44**.
A bounded Unicorn probe of `0x8ee4fc`, with explicit stream/error/cleanup stubs,
admits 31/44 and rejects 45/60/61/62. This is header-only evidence, not a complete
application run or proof that all its library routines are irrelevant. See
[original gate evidence](validation/original-player-version-gate.json).

Public companion installers were downloaded from the official HTTPS version
path without credentials or activation requests and unpacked offline:

| Package | ZIP SHA-256 |
| --- | --- |
| `https://update.avanset.com/download/2.9.3/vce_exam_simulator_demo_setup.zip` | `39071c1160953abc5510b131fd3f003996181cae6e2018d21436d5900ad922a5` |
| `https://update.avanset.com/download/2.9.3/vce_exam_simulator_setup.zip` | `abbac1d23d3493168835ff40a2c9532bacc888bd63c4e10a9847714dfa353481` |

Loader/block CRCs and every extracted file hash were checked against installer
metadata: **19/19** demo files and **21/21** full files. The offline extractor
follows innoextract commit `6e9e34ed0876014fdb46e684103ef8c3605e382e`. No original
installer, Player or Designer was executed. Download origin/hash verification is
not Authenticode/trust-chain validation. Original binaries remain outside this
repository.

The full Player SHA-256 is
`4a112c2b9cfb2bfc5de39f62ce2739227e878a5f8ebae3289ab9e6d06d96e155`.
Its gate at `0x9b87f0` accepts through **63**, with `cmp edx,0x3f` at
`0x9b886e`. The demo gate is `0x949060`, comparison `0x9490de`. ProductVersion
`3.2` is also reported by the old target, so that string alone does not identify
format capability. Static admission is not a full corpus-read result.

## Full Designer: protected pool envelope

Full Designer SHA-256:
`6d15db70639f084a102222e6e273f4eeb8dbccfe4b1079d3f45d372e4e66e356`.

1. `0x8e6d18` chooses a declared pool length in `[1024,2048]`, but fills
   **2048 bytes** using OpenSSL `RAND_bytes` (import thunk `0x8ae4e4`). Delphi
   random calls select lengths/chunk sizes, not secret byte values.
2. `0xb2a584` writes the separate 1024-byte header pool. It then constructs
   `LE32(declared pool length) || 2048 secret bytes` in a temporary stream,
   calls `0x8e6e94` at `0xb2a6e1`, and truncates the retained secret stream to
   the declared length for record encryption.
3. `0x8e6e94` loads RCDATA **`EXAM_PUBLIC_KEY`** (argument at `0x8e7048`),
   obtains the X509 RSA public key and calls `RSA_public_encrypt` (import thunk
   `0x8ae4f4`) with padding argument **1**, i.e. PKCS#1 v1.5. Chunks contain at
   most **245 bytes**. Call sites: `0x8e6f7e`, `0x8e6fb1`.
4. The modulus is 2048 bits: **2052** plaintext bytes require **nine 256-byte
   RSA blocks**, explaining the **2304-byte** encrypted header pool.

The certificate DER SHA-256 is
`7d566fa6d33bca4fe02907ac8124cafeaf3ac82f6c778644278fa97c52110112`.
Both valid private PEM fixtures previously extracted from the old DLL have
**different moduli**. Neither is the corresponding private key. An exact raw-byte
scan for the 256-byte production modulus found **zero hits** across 47 extracted
files (91,740,656 bytes total) from the demo/full 2.9.3 packages and supplied
original-artifact directory. This bounded search does not exclude every other
source of private material.

Independent necessary-bound checks find **117/117** aligned ciphertext blocks
from **13** reliable reference pairs satisfy `c < n` for this public key. The
five mismatched pairs are excluded. This supports compatibility, but **does not
prove** decrypted RSA plaintext matches each known pool or recover secret bytes.
Across all 18 reference entries, `keys`, `encryptKeys`, and `decryptKeys` each
have 18 distinct byte hashes (no exact pool reuse in this sample). This is not a
non-reuse guarantee for other files. See [envelope checks](validation/modern-pool-envelope-bounds.json).

```sh
node scripts/verify-pool-envelopes.mjs \
  /tmp/kp/vendor-2.9.3-full/files/entry-20.exe \
  /tmp/vce_refs/sneklyudov_Converter/ExamUniverse.Converter.VCE.Tests/Files \
  /tmp/vce_test_keys.json /tmp/pool-envelope-report.json
```

This diagnostic reads external reference material; no reference pools or vendor
binaries are shipped. It is not used by the production reader.

## Full Player: cache/request to record-reader linkage

The modern target closes a linkage left unresolved in the old one:

- `0x9b8fb8` reads both header arrays. It base64-converts the encrypted pool
  through `0x81c628`, then calls the registered callback at object `+0x48` at
  `0x9b90e2`, passing encrypted material, file version and key version.
- Method metadata identifies `OnDecryptExamKeyRequest` as `0xaeb6c8`; it calls
  `0xae75a0`, which checks `TVCEExamKeyCache` through `0xae5fa4`. A usable
  cached result is converted into the global protected stream. The request
  path creates a `TDecryptExamKeyRequestThread` and assigns encrypted material,
  file version and an activation-manager reference.
- Request procedure `0x991a94` constructs `email`, `passwd`, `key`, `ver_app`,
  `ver_lib`, `ver_file`, and optional `ver_key`. At `0x991d02` it calls an HTTP
  helper with the literal **`https://www.avanset.com/license/v2/index.php`**
  at `0x992098`. **This endpoint was not contacted; no credentials were used.**
- Response status/material populate thread fields `+0x58`/`+0x60`. Handler
  `0xae75a0` checks cache and handles response statuses. It passes the material
  string through Base64 decoder `0x81c7f8` into the protected-pool stream; no
  RSA private-decrypt call appears on this examined path. For file versions
  >=52 it reads a little-endian 32-bit declared length, then copies that many
  bytes starting at stream offset 4. Exact response field semantics and cache
  integrity remain incompletely reconstructed.
- Protected-stream reference `0xb1cbd0` points to global `0xb43d50`;
  header-stream reference `0xb1db78` points to global `0xb43d4c`. Record readers
  `0x8553b8` (format 60) and `0x855480` (61+) compare the selector with `0x80`
  and select these different streams before AES processing.
- The full Player imports `libcryptvce.init_create_key`/`init_read_key`, but the
  focused callers (`0x98ee5d`, `0x98e61b`) are reached through a separate
  activation/certificate object path (`0x98ee34`), not the protected-pool
  callback at `0x9b8fb8`. No call to those initializers appears in the examined
  cache/request-to-pool handler. This is bounded static call-flow evidence, not
  a whole-program proof that no indirect path exists.

Thus the examined Player obtains protected bytes through its cache /
authenticated request path; the writer uses asymmetric wrapping rather than a
simple hash/XOR derivation from the visible header keys. This identifies the
implemented path, **not a proof that every conceivable local alternative is
impossible**. Cache storage/integrity and actual licensed runtime behavior
remain unverified. No backend dependency or credential UI was added to this app.

[Acquisition/static evidence](validation/modern-player-static-evidence.json).
Latest strict corpus rerun still exits **1**:
`pass=1 fail=0 needsKey=14 parseFail=0`. Three further unasserted files print
`OK`; they do not eliminate missing protected pools. No key-pool acceptance is
claimed.

## Continuation boundary

The immutable goal requires automatic opening through a TypeScript pool
mechanism. The evidence above does not supply that mechanism's missing secret
material. User direction is needed before integrating an authenticated official
service or accepting a reduced local/manual-key scope; change the goal through
`/goal-tweak`, not by silently weakening strict tests. Do not send passwords in
chat or investigation commands. Never contact the legacy plaintext endpoint.

Native Windows installer/runtime verification also remains pending. macOS builds,
Rosetta runs and static acquisition of Windows binaries do not establish it.

Local handoff files:

- `/tmp/kp/vendor-2.9.3-full/{acquisition.json,extraction.json,files/}`
- `/tmp/kp/{unpack-inno-probe.py,extract-vendor-inno.py}`
- `/tmp/kp/full-{designer-pool-generator,designer-pool-writer,designer-rsa-calls}.asm`
- `/tmp/kp/full-{player-pool-read,player-record-selection,key-handler,key-cache-flow}.asm`
- `/tmp/kp/full-key-request-fields.txt`
- `/tmp/kp/full-pool-resource-evidence.json`

No new REA/Hopper session was opened. The previous provider limitation and
ownership boundaries described in [keypool-re.md](keypool-re.md) still apply.
