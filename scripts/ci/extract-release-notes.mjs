#!/usr/bin/env node
/**
 * Extracts the CHANGELOG.md section for one version into release-notes.md, so the
 * GitHub release body reuses the generated notes.
 *
 * Usage: node scripts/ci/extract-release-notes.mjs [version]
 *        node scripts/ci/extract-release-notes.mjs --version 0.1.1-rc.0 --changelog CHANGELOG.md --out release-notes.md
 * When version is omitted it is read from release-meta.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseArgs(argv) {
  const options = {}
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--version') options.version = argv[++index]
    else if (arg === '--changelog') options.changelog = argv[++index]
    else if (arg === '--out') options.out = argv[++index]
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    else positional.push(arg)
  }
  if (!options.version && positional.length > 0) options.version = positional[0]
  return options
}

const options = parseArgs(process.argv.slice(2))
const metaPath = join(repoRoot, 'release-meta.json')
const version =
  options.version ??
  (existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')).version : undefined)
if (!version) {
  console.error('[release-notes] no version provided and no release-meta.json found')
  process.exit(1)
}

const changelogPath = resolve(repoRoot, options.changelog ?? 'CHANGELOG.md')
const outputPath = resolve(repoRoot, options.out ?? 'release-notes.md')

let notes = `Release ${version}\n`
if (existsSync(changelogPath)) {
  const changelog = readFileSync(changelogPath, 'utf8')
  const heading = /^## +\[?v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-+]+)?)\]?[^\n]*$/gm
  const sections = []
  let match
  while ((match = heading.exec(changelog)) !== null) {
    sections.push({ version: match[1], start: match.index, bodyStart: heading.lastIndex })
  }
  const index = sections.findIndex((section) => section.version === version)
  if (index >= 0) {
    const end = index + 1 < sections.length ? sections[index + 1].start : changelog.length
    const body = changelog.slice(sections[index].bodyStart, end).trim()
    if (body.length > 0) notes = `${body}\n`
    else console.warn(`[release-notes] CHANGELOG section for ${version} is empty; using the fallback body`)
  } else {
    console.warn(`[release-notes] no CHANGELOG section for ${version}; using the fallback body`)
  }
} else {
  console.warn(`[release-notes] ${changelogPath} not found; using the fallback body`)
}

writeFileSync(outputPath, notes)
console.log(`[release-notes] wrote ${outputPath} for ${version}`)
