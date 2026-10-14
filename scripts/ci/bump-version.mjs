#!/usr/bin/env node
/**
 * Computes the next release version from Conventional Commits and delegates the
 * package.json/package-lock.json bump, the CHANGELOG entry, the release commit
 * and the annotated tag to commit-and-tag-version.
 *
 * Channels:
 *   main -> prerelease channel (X.Y.Z-rc.N), published as a GitHub pre-release
 *   prod -> stable channel (X.Y.Z), published as a stable GitHub release
 *
 * Usage: BRANCH=main node scripts/ci/bump-version.mjs [--dry-run]
 * Env:   BRANCH (required in CI), DRY_RUN=1, GITHUB_OUTPUT
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dryRun = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run')
const tagPrefix = 'v'
const prereleaseId = 'rc'
const packagePath = join(repoRoot, 'package.json')

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function fail(message) {
  console.error(`[bump-version] ${message}`)
  process.exit(1)
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
}

function parseVersion(value) {
  const match = SEMVER.exec(String(value).trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  }
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}${version.prerelease ? `-${version.prerelease}` : ''}`
}

function comparePrerelease(left, right) {
  const a = left ? left.split('.') : []
  const b = right ? right.split('.') : []
  // A stable version has higher precedence than any of its prereleases.
  if (!left && right) return 1
  if (left && !right) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return -1
    if (b[i] === undefined) return 1
    const na = /^\d+$/.test(a[i])
    const nb = /^\d+$/.test(b[i])
    if (na && nb) {
      if (Number(a[i]) !== Number(b[i])) return Number(a[i]) < Number(b[i]) ? -1 : 1
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1
    }
  }
  return 0
}

function compareVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

function increment(version, level) {
  if (level === 'major') return { major: version.major + 1, minor: 0, patch: 0, prerelease: null }
  if (level === 'minor') return { major: version.major, minor: version.minor + 1, patch: 0, prerelease: null }
  return { major: version.major, minor: version.minor, patch: version.patch + 1, prerelease: null }
}

function commitMessages(range) {
  const args = ['log', '--format=%B%x1e']
  if (range) args.push(range)
  args.push('--')
  return git(args)
    .split('\x1e')
    .map((message) => message.trim())
    .filter(Boolean)
}

function bumpLevel(messages) {
  let level = 'patch'
  for (const message of messages) {
    if (/BREAKING[ -]CHANGE/.test(message)) return 'major'
    const subject = message.split('\n')[0]
    if (/^[a-z]+(\([^)]*\))?!:/.test(subject)) return 'major'
    if (/^feat(\([^)]*\))?:/.test(subject)) level = 'minor'
  }
  return level
}

function listTags(mergedOnly) {
  const args = ['tag', '--list', `${tagPrefix}*`]
  if (mergedOnly) args.splice(1, 0, '--merged', 'HEAD')
  return git(args)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((tag) => ({ tag, version: parseVersion(tag.slice(tagPrefix.length)) }))
    .filter((entry) => entry.version)
    .sort((left, right) => compareVersions(left.version, right.version))
}

const reachableTags = () => listTags(true)

function writeOutputs(meta) {
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${meta.version}\ntag=${meta.tag}\nprerelease=${meta.prerelease}\nchannel=${meta.channel}\n`
  )
}

function report(meta) {
  console.log(`[bump-version] branch=${meta.branch} channel=${meta.channel}`)
  console.log(`[bump-version] version=${meta.version} tag=${meta.tag} prerelease=${meta.prerelease}`)
}

const branch = process.env.BRANCH || git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
if (!['main', 'prod'].includes(branch)) {
  fail(`unsupported branch "${branch}": releases are only produced from main or prod`)
}

const channel = branch === 'main' ? prereleaseId : 'stable'
const prerelease = branch === 'main'

// Idempotency guard: a re-run on an already tagged commit must not bump twice.
// Only a tag from the current channel counts: a prerelease tag does not satisfy
// the stable channel, so `prod` can still promote the rc commit it points at.
const tagsAtHead = git(['tag', '--points-at', 'HEAD', '--list', `${tagPrefix}*`])
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((tag) => ({ tag, version: parseVersion(tag.slice(tagPrefix.length)) }))
  .filter((entry) => entry.version)
  .filter((entry) => Boolean(entry.version.prerelease) === prerelease)
  .sort((left, right) => compareVersions(left.version, right.version))

if (tagsAtHead.length > 0) {
  const existing = tagsAtHead[tagsAtHead.length - 1]
  const meta = {
    version: formatVersion(existing.version),
    tag: existing.tag,
    channel,
    prerelease,
    branch,
    reused: true
  }
  report(meta)
  console.log('[bump-version] HEAD is already tagged; reusing the existing version (no bump)')
  if (!dryRun) {
    writeFileSync(join(repoRoot, 'release-meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
    writeOutputs(meta)
  }
  process.exit(0)
}

const current = parseVersion(JSON.parse(readFileSync(packagePath, 'utf8')).version)
if (!current) fail(`package.json version is not a valid semver value`)

const tags = reachableTags()
// Stable tags live on `prod` and are usually not reachable from `main`, so the
// stable floor is taken from every tag: main must not rebuild a released base.
const stableFloor = listTags(false).filter((entry) => !entry.version.prerelease).pop() ?? null
const lastStable = tags.filter((entry) => !entry.version.prerelease).pop() ?? null
const lastAny = tags[tags.length - 1] ?? null

let next
if (branch === 'main') {
  if (current.prerelease) {
    const match = new RegExp(`^${prereleaseId}\\.(\\d+)$`).exec(current.prerelease)
    if (!match) fail(`current version is not a "${prereleaseId}" prerelease: ${formatVersion(current)}`)
    let base = { major: current.major, minor: current.minor, patch: current.patch, prerelease: null }
    let counter = Number(match[1]) + 1
    // A stable release may already cover this base (for example after prod shipped
    // 0.3.0): continue on the next patch line instead of rebuilding the same base.
    if (stableFloor && compareVersions(base, stableFloor.version) <= 0) {
      base = increment(stableFloor.version, 'patch')
      counter = 0
    }
    const level = bumpLevel(commitMessages(lastAny ? `${lastAny.tag}..HEAD` : null))
    if (level === 'major') next = { ...increment(base, 'major'), prerelease: `${prereleaseId}.0` }
    else if (level === 'minor') next = { ...increment(base, 'minor'), prerelease: `${prereleaseId}.0` }
    else next = { ...base, prerelease: `${prereleaseId}.${counter}` }
  } else {
    const level = bumpLevel(commitMessages(lastStable ? `${lastStable.tag}..HEAD` : null))
    next = { ...increment(current, level), prerelease: `${prereleaseId}.0` }
  }
} else if (current.prerelease) {
  // Stable promotion of the current prerelease line.
  next = { major: current.major, minor: current.minor, patch: current.patch, prerelease: null }
  if (stableFloor && compareVersions(next, stableFloor.version) <= 0) {
    next = increment(stableFloor.version, 'patch')
  }
} else {
  const level = bumpLevel(commitMessages(lastStable ? `${lastStable.tag}..HEAD` : null))
  next = increment(current, level)
}

// Never reuse an existing version: a merge can regress package.json to an earlier
// prerelease, and a tag that already exists would make the release fail. Every tag
// is considered, including tags that are not reachable from the current branch.
const existingVersions = new Set(listTags(false).map((entry) => formatVersion(entry.version)))
if (prerelease) {
  let counter = next.prerelease ? Number(next.prerelease.split('.')[1]) : -1
  while (existingVersions.has(formatVersion(next))) {
    counter += 1
    next = { ...next, prerelease: `${prereleaseId}.${counter}` }
  }
} else {
  while (existingVersions.has(formatVersion(next))) next = increment(next, 'patch')
}

const target = formatVersion(next)
const meta = { version: target, tag: `${tagPrefix}${target}`, channel, prerelease, branch }

report(meta)

if (dryRun) {
  console.log('[bump-version] dry run: package.json, CHANGELOG.md, commit and tag were not modified')
  process.exit(0)
}

const binary = join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'commit-and-tag-version.cmd' : 'commit-and-tag-version'
)
if (!existsSync(binary)) fail('commit-and-tag-version is not installed; run "npm install" first')

execFileSync(binary, ['--release-as', target], { cwd: repoRoot, stdio: 'inherit' })

const bumped = parseVersion(JSON.parse(readFileSync(packagePath, 'utf8')).version)
if (!bumped || formatVersion(bumped) !== target) {
  fail(`commit-and-tag-version produced ${bumped ? formatVersion(bumped) : 'nothing'}, expected ${target}`)
}

writeFileSync(join(repoRoot, 'release-meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
writeOutputs(meta)
console.log(`[bump-version] committed and tagged ${meta.tag}`)
