# Session Rename

Adds one model-facing tool, `rename_session`, so an agent can give a Session a
meaningful title instead of leaving an auto-generated one — or the `xxx (1)`
suffix that `fork()` assigns.

## What the tool does

`rename_session({ title, session_id? })` calls the built-in Host contract
`sessionController.rename({ sessionId, title })`. That contract:

- appends one `session/title` event with `source: { kind: 'user' }`;
- pins the title: in-flight automatic generation is superseded, and later user
  messages do not schedule another title;
- writes a durable event, so the sidebar, the Session map, and every later
  reader see the same value.

`session_id` is optional and defaults to the session that calls the tool. A cold
Session is explicitly resumed by the controller before renaming, so a listed
fork can be renamed without opening it first; sessions that cannot be resumed
(for example some subagent children) fail with the controller's error.

## Why fork titles look like `xxx (1)`

`Session Controller`'s client fork path calls `increasedForkTitle(sourceTitle)`
when `increaseTitle` is true: it increments a trailing `(n)`/`（n）`, or appends
` (1)` to an unnumbered title. That is deliberate — sibling forks stay
distinguishable and stable — but it is not descriptive. This tool is the
supported way to replace that suffix; it does not change the fork algorithm.

## Install

```
plugin_manager install_bundle C:\Users\27866\code\dsh-flow-chat\dsh-session-rename
```

The bundle has no Client half: it only adds a Host tool to the profile's agent
composition.

## Tests

`node test/tool.test.mjs` checks the definition shape, the default and explicit
session target, title trimming, empty-title rejection, the missing-service
branch, and presentation metadata.
