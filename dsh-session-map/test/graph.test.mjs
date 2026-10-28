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

// Subagent batches group by the parent's subagentCatalog childCreatedAt: a
// parallel fan-out becomes one group box, a lone later child stays loose.
const batchCatalog = (entries) => ({ projectionValues: { subagentCatalog: { head: { values: entries } } } })
const batchSessions = {
  ids: ['p1', 'session-c1', 'session-c2', 'session-c3', 'session-c4', 'session-f1', 'session-d1'],
  byId: {
    p1: session('p1', undefined, batchCatalog([
      { childId: 'c1', childCreatedAt: 1000 },
      { childId: 'c2', childCreatedAt: 1500 },
      { childId: 'c3', childCreatedAt: 2000 },
      { childId: 'c4', childCreatedAt: 400000 },
    ])),
    'session-c1': session('session-c1', 'p1', { origin: 'subagent', updatedAt: 5000 }),
    'session-c2': session('session-c2', 'p1', { origin: 'subagent', updatedAt: 6000 }),
    'session-c3': session('session-c3', 'p1', { origin: 'subagent', updatedAt: 7000 }),
    'session-c4': session('session-c4', 'p1', { origin: 'subagent', updatedAt: 8000 }),
    'session-f1': session('session-f1', 'p1', { updatedAt: 9000 }),
    'session-d1': session('session-d1', 'session-c1', { origin: 'subagent', updatedAt: 9500 }),
  },
  phase: 'ready',
}
const noWorkspaces = { items: [], archivedSessionIds: [] }
const batchGraph = buildGraph(batchSessions, noWorkspaces, false)
assert.equal(batchGraph.subagentGroups.length, 1, 'c1..c3 form one batch; c4 came much later')
const batch = batchGraph.subagentGroups[0]
assert.equal(batch.key, 'sg:p1:1000')
assert.equal(batch.members.length, 3)
assert.equal(batchGraph.nodes.get('session-c2').groupKey, batch.key)
assert.equal(batchGraph.nodes.get('session-c4').groupKey, undefined, 'a lone child is not grouped')

// Default: an untouched batch renders as one block right away.
const defaultLayout = layoutGraph(batchGraph, {})
assert.equal(defaultLayout.groupBoxes.length, 1)
assert.equal(defaultLayout.groupBoxes[0].mode, 'block')
assert.equal(defaultLayout.placed.length, 3, 'members are hidden until the block is expanded')

// Expanded: one dashed box encloses its members, everyone stays placed.
const expanded = layoutGraph(batchGraph, { [batch.key]: 0 })
assert.equal(expanded.groupBoxes.length, 1)
assert.equal(expanded.groupBoxes[0].mode, 'expanded')
assert.equal(expanded.placed.length, 7, 'the batch member’s nested child renders too')
const box = expanded.groupBoxes[0]
for (const member of batch.members) {
  const at = expanded.placed.find((entry) => entry.node.id === member.id)
  assert.ok(at !== undefined, `${member.id} stays placed while expanded`)
  assert.ok(at.y >= box.y && at.y + NODE_H <= box.y + box.height, `${member.id} sits inside the group box`)
}

// Level 1: the batch collapses into one block; members leave the canvas.
const blocked = layoutGraph(batchGraph, { [batch.key]: 1 })
assert.equal(blocked.groupBoxes.length, 1)
assert.equal(blocked.groupBoxes[0].mode, 'block')
assert.equal(blocked.groupBoxes[0].height, NODE_H)
assert.equal(blocked.placed.length, 3, 'parent, the loose subagent and the fork child remain')

// Level 2: the batch folds into the parent; nothing of it renders.
const folded = layoutGraph(batchGraph, { [batch.key]: 2 })
assert.equal(folded.groupBoxes.length, 0)
assert.equal(folded.placed.length, 3)

// Band height follows the collapse: hidden members and their descendants
// neither render nor reserve vertical space below.
const collapsedLayout = layoutGraph(batchGraph, {})
assert.equal(collapsedLayout.placed.find((entry) => entry.node.id === 'session-d1'), undefined, 'descendants of hidden members do not leak as roots')
assert.ok(collapsedLayout.bands[0].height < expanded.bands[0].height - NODE_H, 'the band shrinks with the collapse instead of keeping full height')

// Children triggered far apart never group.
const spreadSessions = {
  ids: ['p2', 'session-x1', 'session-x2'],
  byId: {
    p2: session('p2', undefined, batchCatalog([
      { childId: 'x1', childCreatedAt: 1000 },
      { childId: 'x2', childCreatedAt: 900000 },
    ])),
    'session-x1': session('session-x1', 'p2', { origin: 'subagent', updatedAt: 5000 }),
    'session-x2': session('session-x2', 'p2', { origin: 'subagent', updatedAt: 910000 }),
  },
  phase: 'ready',
}
const spreadGraph = buildGraph(spreadSessions, noWorkspaces, false)
assert.equal(spreadGraph.subagentGroups.length, 0)
assert.equal(layoutGraph(spreadGraph, {}).placed.length, 3)

// The live projection view publishes {id, createdAt} entries; the persisted
// checkpoint serializes {childId, childCreatedAt}. Both must group.
const liveCatalog = (entries) => ({ projectionValues: { subagentCatalog: entries } })
const liveSessions = {
  ids: ['p3', 'session-c1', 'session-c2', 'session-c3'],
  byId: {
    p3: session('p3', undefined, liveCatalog([
      { id: 'c1', createdAt: 1000, mode: 'continuable', label: 'one' },
      { id: 'c2', createdAt: 2500, mode: 'continuable', label: 'two' },
      { id: 'c3', createdAt: 4000, mode: 'continuable', label: 'three' },
    ])),
    'session-c1': session('session-c1', 'p3', { origin: 'subagent', updatedAt: 5000 }),
    'session-c2': session('session-c2', 'p3', { origin: 'subagent', updatedAt: 6000 }),
    'session-c3': session('session-c3', 'p3', { origin: 'subagent', updatedAt: 7000 }),
  },
  phase: 'ready',
}
const liveGraph = buildGraph(liveSessions, noWorkspaces, false)
assert.equal(liveGraph.subagentGroups.length, 1, 'live {id, createdAt} entries group too')
assert.equal(liveGraph.subagentGroups[0].members.length, 3)

// A workspace filter keeps whole bands off the canvas and out of the counts.
const filtered = buildGraph(sessions, workspaces, false, new Set(['w1']))
assert.equal(filtered.groups.length, 1)
assert.equal(filtered.groups[0].workspaceId, 'w1')
assert.equal(filtered.allGroups.length, 3, 'the panel still lists every band')
assert.equal(filtered.total, 4)
const filteredLayout = layoutGraph(filtered, {})
assert.equal(filteredLayout.placed.length, 4)
assert.ok(filteredLayout.placed.every((entry) => entry.node.workspaceId === 'w1'))
assert.equal(filteredLayout.bands.length, 1)

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
