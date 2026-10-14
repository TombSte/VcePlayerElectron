/**
 * Format-31 stream cipher, reconstructed from the supplied Delphi Player.
 * String/stream records reset to 0x80, encode a marker plus a signed LE length,
 * then optionally encrypt the body. This is unrelated to modern AES key pools.
 *
 * Native references: 0x634ad4, 0x634ae8, 0x635074, 0x63510c, 0x6366a8.
 */
const SINES = Array.from({ length: 256 }, (_, value) => Math.sin(value))

// Delphi's x87 Round uses nearest-even, unlike JS Math.round at exact halves.
function roundEven(value: number): number {
  const floor = Math.floor(value)
  if (value - floor === 0.5) return floor % 2 === 0 ? floor : floor + 1
  return Math.round(value)
}

function nextState(state: number, encoded: number, decoded: number, index: number): number {
  const polynomial = (((encoded ^ decoded) | 1) * ((encoded + decoded) ^ 1)) & 255
  return (roundEven(state * SINES[polynomial]) ^ (index & 255)) & 255
}

/** The caller supplies a bounds-checked reader; lengths are checked before allocation. */
export function readLegacyArray(read: (length: number) => Uint8Array, decryptBody = true): Uint8Array {
  let state = 128
  const marker = read(1)[0]
  state = nextState(state, marker, marker ^ state, 0)
  const prefix = Uint8Array.from(read(4))
  for (let i = 0; i < prefix.length; i++) {
    const encoded = prefix[i]
    prefix[i] ^= state
    state = nextState(state, encoded, prefix[i], i + 1)
  }
  const length = new DataView(prefix.buffer, prefix.byteOffset, 4).getInt32(0, true)
  const payload = read(length)
  if (!decryptBody) return payload

  const decoded = Uint8Array.from(payload)
  let index = 5
  for (let i = 0; i < decoded.length; i++) {
    decoded[i] ^= state
    state = nextState(state, payload[i], decoded[i], index++)
    // The native stream reader resets inside its 0xf000-byte work chunks.
    if (index >= 0xf000) {
      state = 128
      index = 0
    }
  }
  return decoded
}
