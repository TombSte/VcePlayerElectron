// Diagnostic only: public RSA envelope bounds do not recover a decrypted pool.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [designerPath, corpusDirectory, pairsPath, reportPath] = process.argv.slice(2);
if (!designerPath || !corpusDirectory || !pairsPath) {
  throw new Error('Usage: node scripts/verify-pool-envelopes.mjs <Designer.exe> <corpus-directory> <reference-pairs.json> [report.json]');
}
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const designer = fs.readFileSync(designerPath);
const certificates = [...designer.toString('latin1').matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)];
if (certificates.length !== 1) throw new Error('Expected one certificate; select EXAM_PUBLIC_KEY through PE resources when ambiguous');
const certificate = new crypto.X509Certificate(certificates[0][0]);
const jwk = certificate.publicKey.export({ format: 'jwk' });
if (jwk.kty !== 'RSA') throw new Error('Expected RSA public key');
const modulus = Buffer.from(jwk.n, 'base64url');
const n = BigInt(`0x${modulus.toString('hex')}`);
if (modulus.length !== 256) throw new Error('Expected the observed 2048-bit EXAM_PUBLIC_KEY');

function arrayAt(file, offset) {
  if (offset + 5 > file.length) throw new Error('Truncated array header');
  const lengthBytes = Buffer.from(file.subarray(offset + 1, offset + 5));
  for (const [i, mask] of [0, 1, 2, 7].entries()) lengthBytes[i] ^= mask;
  const length = lengthBytes.readInt32LE();
  if (length < 0 || length > file.length - offset - 5) throw new Error('Invalid array length');
  return { bytes: file.subarray(offset + 5, offset + 5 + length), end: offset + 5 + length };
}

const pairs = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
const specimens = [];
for (const [filename, pair] of Object.entries(pairs)) {
  const file = fs.readFileSync(path.join(corpusDirectory, filename));
  if (file.length < 8 || file[0] !== 0x85 || file[1] !== 0xa8) throw new Error(`Invalid specimen: ${filename}`);
  const version = file[2] * 10 + file[3];
  if (version < 60 || version > 62) throw new Error(`Unexpected reference version: ${version}`);
  const keys = arrayAt(file, 8);
  const encrypted = arrayAt(file, keys.end).bytes;
  const referenceEncrypted = Buffer.from(pair.encryptKeys, 'base64');
  if (!encrypted.equals(referenceEncrypted)) {
    specimens.push({ filename, version, matchingPair: false, reason: 'Reference encrypted pool does not match specimen; excluded' });
    continue;
  }
  if (keys.bytes.length !== 1024 || encrypted.length !== 2304) throw new Error(`Unexpected pool sizes: ${filename}`);
  const knownPool = Buffer.from(pair.decryptKeys, 'base64');
  if (knownPool.length < 1024 || knownPool.length > 2048) throw new Error(`Unexpected known pool length: ${filename}`);
  const violations = [];
  for (let offset = 0; offset < encrypted.length; offset += modulus.length) {
    const c = BigInt(`0x${encrypted.subarray(offset, offset + modulus.length).toString('hex')}`);
    if (c >= n) violations.push(offset);
  }
  specimens.push({ filename, version, matchingPair: true, specimenSha256: sha256(file), encryptedPoolBytes: encrypted.length, knownPoolBytes: knownPool.length, ciphertextBlocks: encrypted.length / modulus.length, modulusBoundViolations: violations });
}
const matching = specimens.filter((s) => s.matchingPair);
if (!matching.length) throw new Error('No reliable reference pairs');
const report = {
  method: 'Offline public-key framing/necessary-bound checks only; no private key, network request, or original application execution',
  designer: { path: designerPath, sha256: sha256(designer) },
  publicKey: { certificateDerSha256: sha256(certificate.raw), spkiDerSha256: sha256(certificate.publicKey.export({ format: 'der', type: 'spki' })), modulusBytes: modulus.length, exponent: jwk.e },
  observedWriterFraming: { declaredLengthBytes: 4, randomStorageBytes: 2048, plaintextEnvelopeBytes: 2052, pkcs1PayloadLimit: 245, ciphertextBlocks: 9, ciphertextBytes: 2304 },
  matchingPairs: matching.length,
  excludedPairs: specimens.length - matching.length,
  ciphertextBlocksChecked: matching.reduce((sum, s) => sum + s.ciphertextBlocks, 0),
  modulusBoundViolations: matching.reduce((sum, s) => sum + s.modulusBoundViolations.length, 0),
  specimens,
  limitations: [
    'c < n is necessary, not sufficient: this does not establish RSA plaintext matches a reference pool.',
    'Writer framing is a static native-code observation, not an independently decoded production envelope.',
    'Only reliable paired modern specimens and one selected public certificate are covered.',
    'No automatic decrypted-pool recovery is implemented or claimed.'
  ]
};
if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ matchingPairs: report.matchingPairs, excludedPairs: report.excludedPairs, ciphertextBlocksChecked: report.ciphertextBlocksChecked, modulusBoundViolations: report.modulusBoundViolations }));
if (report.modulusBoundViolations) process.exitCode = 1;
