import assert from 'node:assert/strict'
import { apply, inject } from '../index.js'

assert.deepEqual(inject, ['tools'], 'the tool only needs the tool registry')

let definition
const calls = []
const controller = {
	async rename(request) {
		calls.push(request)
		return { title: request.title, seq: 42 }
	},
}

const mount = (sessionController) => {
	let captured
	apply({
		tools: {
			register(value) {
				captured = value
			},
		},
		get(name) {
			return name === 'sessionController' ? sessionController : undefined
		},
	})
	return captured
}

definition = mount(controller)
assert.equal(definition.name, 'rename_session')
assert.ok(definition.description.includes('fork'), 'the description names the fork-suffix use case')
assert.deepEqual(definition.parameters.required, ['title'])
assert.equal(definition.parameters.additionalProperties, false)
assert.equal(definition.output.schema.additionalProperties, false)
assert.match(definition.output.render({}, { session_id: 's1', title: 'A title', seq: 7 })[0].text, /A title/)

const run = (tool, args, exec = { agent: { session: { id: 's1' } } }) => tool.execute(args, exec)

const renamed = await run(definition, { title: '  Session map plugin  ' })
assert.deepEqual(renamed, { session_id: 's1', title: 'Session map plugin', seq: 42 })
assert.deepEqual(calls[0], { sessionId: 's1', title: 'Session map plugin' })

const explicit = await run(definition, { title: 'Branch B', session_id: 's2' })
assert.equal(explicit.session_id, 's2')
assert.deepEqual(calls[1], { sessionId: 's2', title: 'Branch B' })

await assert.rejects(() => run(definition, { title: '   ' }), /visible characters/)
await assert.rejects(() => run(definition, { title: 'x' }, {}), /session_id is required/)

const bare = mount(undefined)
await assert.rejects(() => run(bare, { title: 'x' }), /unavailable/)

const presented = definition.presentCall({ title: 'x' })
assert.equal(presented.card, 'generic')
assert.equal(presented.kind, 'edit')

console.log('session-rename tool tests passed')
