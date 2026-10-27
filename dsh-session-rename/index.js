/**
 * `rename_session` — a small model-facing tool over the built-in
 * `sessionController.rename` contract, which is the Host half of the
 * `session-title` service.
 *
 * A rename appends one `session/title` event with `source: { kind: 'user' }`.
 * That pins the title: in-flight automatic generation is superseded and later
 * user messages do not schedule another. The event is durable, so the sidebar,
 * the Session map, and every future reader see the same title.
 */

export const inject = ['tools'];

const SESSION_ID_PROPERTY = {
	type: 'string',
	description: 'Session to rename. Omit to rename the session that calls this tool.',
};

export function apply(ctx) {
	ctx.tools.register({
		name: 'rename_session',
		description: 'Rename a session so the sidebar and Session map show a meaningful title. Use it when a title is empty, generic, or an unclear fork suffix such as "(1)", or right after forking to name the new branch. The title becomes user-owned: automatic title generation stops for that session.',
		parameters: {
			type: 'object',
			properties: {
				title: {
					type: 'string',
					description: 'New title. Surrounding whitespace is normalized; an empty title is rejected.',
				},
				session_id: SESSION_ID_PROPERTY,
			},
			required: ['title'],
			additionalProperties: false,
		},
		output: {
			schema: {
				type: 'object',
				properties: {
					session_id: { type: 'string' },
					title: { type: 'string' },
					seq: { type: 'number' },
				},
				required: ['session_id', 'title', 'seq'],
				additionalProperties: false,
			},
			render: (_args, value) => [{ type: 'text', text: `Renamed ${value.session_id} to "${value.title}".` }],
		},
		presentCall: (args) => ({
			card: 'generic',
			title: 'Rename session',
			kind: 'edit',
			rawInput: args,
		}),
		async execute(args, exec) {
			const controller = ctx.get('sessionController');
			if (controller === undefined) throw new Error('renaming is unavailable: this deployment has no session controller');
			const input = args !== null && typeof args === 'object' ? args : {};
			const title = typeof input.title === 'string' ? input.title.trim() : '';
			if (title === '') throw new Error('title must contain visible characters');
			const agent = exec.agent;
			const target = typeof input.session_id === 'string' && input.session_id !== ''
				? input.session_id
				: agent && agent.session !== undefined
					? agent.session.id
					: agent && agent.id;
			if (typeof target !== 'string' || target === '') throw new Error('session_id is required when the calling agent has no session');
			const renamed = await controller.rename({ sessionId: target, title });
			return { session_id: target, title: renamed.title, seq: renamed.seq };
		},
	});
}
