import assert from 'node:assert/strict'

// The client artifact registers itself on the browser module loader, so give it
// a loader to hand the factory back, then call the factory with a React stub:
// the pure graph functions do not touch React.
let definition
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      definition = value
    },
  },
}
const stub = {
  Component: class {},
  createElement: () => null,
  useCallback: () => undefined,
  useEffect: () => undefined,
  useMemo: () => undefined,
  useRef: () => undefined,
  useState: () => undefined,
}
await import('../client.js')
assert.equal(definition.id, '@local/dsh-session-map')
const module = definition.factory((name) => {
  assert.equal(name, 'react')
  return stub
})
const { buildGraph, layoutGraph, formatRelative, firstPromptOf, truncate, zoomAt, zh, en, NODE_W, NODE_H, UNGROUPED } = module.__test

const session = (id, parentId, extra = {}) => ({
  id,
  displayTitle: `Session ${id}`,
  running: false,
  blank: false,
  updatedAt: extra.updatedAt ?? 1000,
  ...(parentId === undefined ? {} : { parentId }),
  ...(extra.origin === undefined ? {} : { origin: extra.origin }),
  ...(extra.running === undefined ? {} : { running: extra.running }),
  ...(extra.retainedBy === undefined ? {} : { retainedBy: extra.retainedBy }),
  ...(extra.projectionValues === undefined ? {} : { projectionValues: extra.projectionValues }),
})

const makeSessions = (rows) => ({
  ids: rows.map((row) => row.id),
  byId: Object.fromEntries(rows.map((row) => [row.id, row])),
  phase: 'ready',
})

const workspaces = {
  items: [
    { workspaceId: 'w1', title: 'alpha', path: 'C:/alpha', sessionIds: ['r1', 'f1', 'g1', 's1'], createdAt: '', updatedAt: '' },
    { workspaceId: 'w2', title: 'beta', path: 'C:/beta', sessionIds: ['r2'], createdAt: '', updatedAt: '' },
  ],
  archivedSessionIds: [],
}

const sessions = makeSessions([
  session('r1', undefined, { updatedAt: 1000, retainedBy: { mainView: 1 } }),
  session('f1', 'r1', { updatedAt: 2000 }),
  session('g1', 'f1', { updatedAt: 3000 }),
  session('s1', 'r1', { updatedAt: 1500, origin: 'subagent' }),
  session('r2', undefined, { updatedAt: 4000 }),
  session('orphan'),
])

const graph = buildGraph(sessions, workspaces, false)
assert.equal(graph.total, 6)
assert.equal(graph.leafCount, 4, 'g1, s1, r2 and orphan are leaves')
assert.equal(graph.nodes.get('g1').leaf, true)
assert.equal(graph.nodes.get('f1').leaf, false)
assert.equal(graph.nodes.get('r1').children.length, 2)
assert.equal(graph.nodes.get('r1').current, true)
assert.equal(graph.nodes.get('orphan').workspaceId, UNGROUPED)
assert.deepEqual(graph.groups.map((group) => group.workspaceId), ['w1', 'w2', UNGROUPED])

const layout = layoutGraph(graph)
assert.equal(layout.placed.length, 6)
assert.equal(layout.bands.length, 3)
assert.ok(layout.bounds.width > 0 && layout.bounds.height > 0)
for (let index = 1; index < layout.bands.length; index += 1) {
  assert.ok(layout.bands[index].y > layout.bands[index - 1].y, 'bands stack downward')
}
const pos = new Map(layout.placed.map((entry) => [entry.node.id, entry]))
assert.ok(pos.get('f1').x > pos.get('r1').x, 'child sits to the right of its parent')
assert.ok(pos.get('g1').x > pos.get('f1').x, 'grandchild keeps going right')
assert.ok(pos.get('s1').x > pos.get('r1').x)
// Siblings are ordered by updatedAt ascending: f1 (2000) above s1 (1500)? No:
// ascending puts s1 (1500) first, then f1 (2000).
assert.ok(pos.get('s1').y < pos.get('f1').y, 'siblings follow updatedAt order')
// The parent is centered on its children.
assert.ok(Math.abs(pos.get('r1').y + NODE_H / 2 - (pos.get('s1').y + pos.get('f1').y + NODE_H) / 2) < 0.001)

const ids = layout.placed.map((entry) => entry.node.id)
for (const id of ids) {
  for (const other of ids) {
    if (id >= other) continue
    const left = pos.get(id)
    const right = pos.get(other)
    const overlap = Math.abs(left.x - right.x) < NODE_W && Math.abs(left.y - right.y) < NODE_H
    assert.equal(overlap, false, `${id} and ${other} overlap`)
  }
}

// Archived sessions leave the map unless explicitly requested.
const archivedWorkspaces = { ...workspaces, archivedSessionIds: ['g1', 'orphan'] }
assert.equal(buildGraph(sessions, archivedWorkspaces, false).total, 4)
assert.equal(buildGraph(sessions, archivedWorkspaces, true).total, 6)

// A parent cycle must degrade to roots instead of hanging layout.
const cyclic = makeSessions([session('a', 'b'), session('b', 'a')])
const cyclicGraph = buildGraph(cyclic, { items: [], archivedSessionIds: [] }, false)
assert.equal(cyclicGraph.total, 2)
assert.equal(layoutGraph(cyclicGraph).placed.length, 2)

// A child outside every workspace list inherits its parent's band.
const inherited = makeSessions([session('root'), session('child', 'root')])
const inheritedGraph = buildGraph(inherited, {
  items: [{ workspaceId: 'w9', title: 'nine', path: 'C:/nine', sessionIds: ['root'], createdAt: '', updatedAt: '' }],
  archivedSessionIds: [],
}, false)
assert.equal(inheritedGraph.nodes.get('child').workspaceId, 'w9')
assert.equal(inheritedGraph.groups.length, 1)

// Delegated children live only in `byId` in the Client store (their projection
// hangs off the parent), so the union matters.
const delegated = {
  ids: ['parent'],
  byId: {
    parent: session('parent'),
    child: session('child', 'parent', { origin: 'subagent' }),
  },
  phase: 'ready',
}
const delegatedGraph = buildGraph(delegated, { items: [], archivedSessionIds: [] }, false)
assert.equal(delegatedGraph.total, 2)
assert.equal(delegatedGraph.nodes.get('child').origin, 'subagent')
assert.equal(delegatedGraph.nodes.get('child').parentId, 'parent')
assert.equal(delegatedGraph.nodes.get('parent').children.length, 1)

// Helpers.
assert.equal(truncate('  hello   world  ', 8), 'hello w…')
assert.equal(firstPromptOf({ projectionValues: { turnOutline: { turns: [{ prompt: '  fix the map  ' }] } } }), 'fix the map')
assert.equal(firstPromptOf({ projectionValues: { titleInput: { first: { text: 'typed prompt' } } } }), 'typed prompt')
assert.equal(firstPromptOf({}), '')
const zoomed = zoomAt({ x: 0, y: 0, k: 1 }, 100, 100, 2)
assert.equal(zoomed.k, 2)
assert.equal(zoomed.x, -100)
assert.equal(zoomAt({ x: 0, y: 0, k: 2 }, 0, 0, 4).k, 2, 'zoom clamps at MAX_SCALE')
assert.equal(formatRelative(Date.now(), (key) => key), 'time.justNow')
assert.deepEqual(new Set(Object.keys(zh)), new Set(Object.keys(en)), 'locale dictionaries must share one key set')

// Every t('key') reference must exist in both dictionaries: a missing key
// renders its own name in the panel.
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const referenced = new Set([...source.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1]))
for (const key of referenced) {
  assert.ok(key in zh, `locale key "${key}" is missing from zh`)
  assert.ok(key in en, `locale key "${key}" is missing from en`)
}
assert.ok(!/#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(source), 'styles must not contain literal colors')
assert.ok(!/require\('@deepseek-ai\/dsh-client-ui-/.test(source), 'the plugin must not import Harness Client packages')

// Manifest: runtime files exist, exports resolve, icon is a local SVG.
const { statSync } = await import('node:fs')
const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
assert.equal(manifest.name, '@local/dsh-session-map')
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(manifest.dsh.client.platform, 'web')
assert.equal(manifest.exports['./client'], './client.js')
for (const relative of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json']) {
  assert.ok(statSync(new URL(relative, root)).isFile(), `${relative} missing`)
}
const icon = readFileSync(new URL('icon.svg', root), 'utf8')
assert.ok(icon.startsWith('<svg'), 'icon must be an SVG document')
assert.ok(!/href=|url\(/.test(icon), 'icon must not reference external resources')

console.log(`session-map graph tests passed (${referenced.size} locale keys checked)`)
