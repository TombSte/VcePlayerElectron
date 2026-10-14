#!/usr/bin/env node
/**
 * Flattens the downloaded release artifacts into one directory and writes a
 * combined SHA-256 manifest for the published packages. Fails loudly when a
 * platform build is missing or when two packages would collide.
 *
 * Usage: node scripts/ci/collect-assets.mjs [artifactsDir] [outputDir] [version]
 * Defaults: artifacts, release-assets, version from artifacts/release-meta/release-meta.json
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function fail(message) {
  console.error(`[collect-assets] ${message}`)
  process.exit(1)
}

function walk(directory) {
  const entries = []
  for (const name of readdirSync(directory)) {
    const full = join(directory, name)
    if (statSync(full).isDirectory()) entries.push(...walk(full))
    else entries.push(full)
  }
  return entries
}

const artifactsDir = resolve(repoRoot, process.argv[2] ?? 'artifacts')
const outputDir = resolve(repoRoot, process.argv[3] ?? 'release-assets')

let version = process.argv[4]
if (!version) {
  const metaPath = [
    join(artifactsDir, 'release-meta', 'release-meta.json'),
    join(artifactsDir, 'release-meta.json'),
    join(repoRoot, 'release-meta.json')
  ].find((candidate) => existsSync(candidate))
  if (!metaPath) fail('no version argument and no release-meta.json found')
  version = JSON.parse(readFileSync(metaPath, 'utf8')).version
}
if (!version) fail('release-meta.json has no version')

if (!existsSync(artifactsDir)) fail(`artifacts directory not found: ${artifactsDir}`)

const expected = { dmg: 2, zip: 2, exe: 1 }
const packages = []
for (const file of walk(artifactsDir)) {
  const name = basename(file)
  if (name.startsWith('SHA256SUMS-') || name === 'release-meta.json' || name === 'release-notes.md') continue
  if (name.endsWith('.dmg')) packages.push({ kind: 'dmg', file })
  else if (name.endsWith('.zip')) packages.push({ kind: 'zip', file })
  else if (name.endsWith('.exe')) packages.push({ kind: 'exe', file })
}

const counts = { dmg: 0, zip: 0, exe: 0 }
for (const entry of packages) counts[entry.kind] += 1
const problems = Object.entries(expected)
  .filter(([kind, count]) => counts[kind] !== count)
  .map(([kind, count]) => `${kind}: expected ${count}, found ${counts[kind]}`)
if (problems.length > 0) fail(`incomplete release assets (${problems.join('; ')})`)

const names = new Set()
for (const entry of packages) {
  const name = basename(entry.file)
  if (names.has(name)) fail(`duplicate release asset name: ${name}`)
  names.add(name)
}

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

const lines = []
for (const entry of packages) {
  const name = basename(entry.file)
  const target = join(outputDir, name)
  copyFileSync(entry.file, target)
  const digest = createHash('sha256').update(readFileSync(target)).digest('hex')
  lines.push(`${digest}  ${name}`)
}

const manifestName = `VCE-Player-${version}-SHA256SUMS.txt`
writeFileSync(join(outputDir, manifestName), `${lines.join('\n')}\n`)

console.log(`[collect-assets] ${lines.length} packages -> ${outputDir}`)
for (const line of lines) console.log(`[collect-assets] ${line}`)
console.log(`[collect-assets] wrote ${manifestName}`)
