/**
 * Host half of the session map bundle.
 *
 * The map is a Client-only view: lineage is already published on every
 * SessionSummary (`parentSessionId`, `origin`), so no Host state, RPC, or
 * session event is added. This entry exists because a bundle row must resolve
 * to a package; it deliberately registers nothing.
 */
export function apply() {}
