/**
 * Verifies WCAG 2.1 contrast for the design tokens in src/renderer/src/styles/app.css.
 * Extracts the :root / dark / high-contrast blocks, resolves var() references and
 * reports the contrast ratio of the semantic text pairs. Exits non-zero on AA failure.
 *
 * Usage: node scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, '..', 'src', 'renderer', 'src', 'styles', 'app.css'), 'utf8')

function block(selector) {
  const start = css.indexOf(selector)
  if (start < 0) return {}
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const out = {}
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*([^;]+);/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const base = block(':root {')
const themes = {
  light: base,
  dark: { ...base, ...block(":root[data-theme='dark']") },
  'high-contrast': { ...base, ...block(":root[data-theme='high-contrast']") }
}

function resolve(map, value, depth = 0) {
  if (depth > 10) return value
  const m = value.match(/^var\((--[\w-]+)\)$/)
  if (m) return resolve(map, map[m[1]] ?? '#000', depth + 1)
  return value
}

function toRgb(hex) {
  const h = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio(fg, bg) {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

// [foreground, background, minimum ratio]
const PAIRS = [
  ['--text', '--bg', 4.5],
  ['--text', '--panel', 4.5],
  ['--text', '--panel-alt', 4.5],
  ['--text-muted', '--panel', 4.5],
  ['--text-subtle', '--panel', 3.0],
  ['--on-accent', '--accent', 4.5],
  ['--ok', '--ok-soft', 4.5],
  ['--bad', '--bad-soft', 4.5],
  ['--warn', '--warn-soft', 4.5],
  ['--accent', '--panel', 4.5]
]

let failures = 0
for (const [name, map] of Object.entries(themes)) {
  console.log(`\n── ${name} ──`)
  for (const [fgKey, bgKey, min] of PAIRS) {
    const fg = toRgb(resolve(map, map[fgKey] ?? ''))
    const bg = toRgb(resolve(map, map[bgKey] ?? ''))
    if (!fg || !bg) {
      console.log(`  ?  ${fgKey} on ${bgKey}: skipped (non-hex)`)
      continue
    }
    const r = ratio(fg, bg)
    const ok = r >= min
    if (!ok) failures++
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${r.toFixed(2).padStart(5)} (min ${min})  ${fgKey} on ${bgKey}`)
  }
}

console.log(`\n${failures === 0 ? 'AA OK' : `${failures} AA failure(s)`}`)
process.exit(failures === 0 ? 0 : 1)
