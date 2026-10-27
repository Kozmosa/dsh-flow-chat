// Session Map — a Client-only Web UI plugin.
//
// The map reads the already-published Session summaries (`parentSessionId`,
// `origin`, `running`, `projectionValues`) and workspace ordering, then lays
// them out as a left-to-right forest. It adds no Host state, no Session event,
// and no third-party graph library.
//
// Blind ends are first-class: a leaf gets an "end cap", and clicking it offers
// "continue" (open, append-only) or "fork from tail" (a new leaf). Every node,
// leaf or not, also carries a branch control in its top-right corner; it forks
// from that Session's latest completed turn, which is how a branch grows a new
// child beside existing ones.
window.__ModuleLoader__.load({
	id: '@local/dsh-session-map',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		const React = require('react');
		const h = React.createElement;
		const { useCallback, useEffect, useMemo, useRef, useState } = React;

		const NS = 'session-map';
		const PANEL_ID = 'session-map';
		const UNGROUPED = '__ungrouped__';

		// Geometry of one node, in world units. Rendering scales the whole world.
		const NODE_W = 226;
		const NODE_H = 72;
		const H_GAP = 86;
		const V_GAP = 18;
		const BAND_PAD = 24;
		const BAND_HEADER = 30;
		const BAND_GAP = 34;
		const MIN_SCALE = 0.25;
		const MAX_SCALE = 2;
		const MINIMAP_W = 178;
		const MINIMAP_H = 114;

		const zh = {
			panel: '会话地图',
			title: '分支地图',
			'toolbar.searchLabel': '筛选会话',
			'toolbar.searchPlaceholder': '按标题筛选…',
			'toolbar.fit': '适应画布',
			'toolbar.reset': '重置布局',
			'toolbar.zoomIn': '放大',
			'toolbar.zoomOut': '缩小',
			'toolbar.archived': '显示已归档',
			'toolbar.hideArchived': '隐藏已归档',
			'toolbar.new': '新建会话',
			'legend.label': '图例',
			'legend.fork': '分支',
			'legend.subagent': '委托',
			'legend.blindEnd': '盲端',
			'legend.running': '运行中',
			'node.blindEnd': '盲端',
			'node.fork': '分支',
			'node.subagent': '子代理',
			'node.current': '当前',
			'node.running': '运行中',
			'node.archived': '已归档',
			'node.children': '{n} 条后续',
			'node.untitled': '未命名会话',
			'node.open': '打开会话',
			'node.actions': '分支操作',
			'node.branch': '从此处分叉',
			'open.archived': '已归档的会话无法直接打开，请先在侧栏恢复归档。',
			'menu.heading': '从这里分叉',
			'menu.continue': '继续此会话',
			'menu.continueHint': '在完整轨迹上原样续写',
			'menu.open': '打开此会话',
			'menu.openHint': '在这条路径上继续追加',
			'menu.fork': '从尾部 fork',
			'menu.forkHint': '复制整条轨迹，长出一条新盲端',
			'menu.close': '关闭',
			'empty.title': '地图还没有枝叶',
			'empty.body': '在任意工作区新建一个会话，地图就会开始生长。',
			'empty.action': '新建会话',
			'empty.filtered': '没有匹配的会话',
			'footer.sessions': '个会话',
			'footer.blindEnds': '个盲端',
			'footer.running': '个运行中',
			'workspace.other': '其他会话',
			'preview.empty': '还没有提问',
			'preview.branchHint': '点节点右上角的 + 可从这条路径分叉',
			'time.justNow': '刚刚',
			'time.minutes': '{n} 分钟前',
			'time.hours': '{n} 小时前',
			'time.days': '{n} 天前',
			'time.months': '{n} 个月前',
			'fork.failed': '分支创建失败，请稍后重试。',
			'notice.forking': '正在从这条盲端分支…',
			'canvas.label': '会话地图画布：拖拽平移，滚轮缩放。',
			'canvas.hint': '拖拽平移 · 滚轮缩放 · 悬停节点可分支 · 双击空白新建会话',
			'map.loading': '正在读取会话…',
			'error.title': '会话地图暂时无法渲染',
			'error.body': '切换到其他面板再回来即可重试。',
			'aria.node': '{title}，{status}',
			'status.running': '运行中',
			'status.leaf': '盲端，可继续或分支',
			'status.normal': '有后续分支',
			'status.current': '当前打开的会话',
			'zoom.label': '缩放比例',
		};

		const en = {
			panel: 'Session map',
			title: 'Branching map',
			'toolbar.searchLabel': 'Filter sessions',
			'toolbar.searchPlaceholder': 'Filter by title…',
			'toolbar.fit': 'Fit to view',
			'toolbar.reset': 'Reset layout',
			'toolbar.zoomIn': 'Zoom in',
			'toolbar.zoomOut': 'Zoom out',
			'toolbar.archived': 'Show archived',
			'toolbar.hideArchived': 'Hide archived',
			'toolbar.new': 'New session',
			'legend.label': 'Legend',
			'legend.fork': 'Fork',
			'legend.subagent': 'Delegation',
			'legend.blindEnd': 'Blind end',
			'legend.running': 'Running',
			'node.blindEnd': 'Blind end',
			'node.fork': 'Fork',
			'node.subagent': 'Subagent',
			'node.current': 'Current',
			'node.running': 'Running',
			'node.archived': 'Archived',
			'node.children': '{n} next',
			'node.untitled': 'Untitled session',
			'node.open': 'Open session',
			'node.actions': 'Branch actions',
			'node.branch': 'Branch from here',
			'open.archived': 'This session is archived. Unarchive it from the sidebar first.',
			'menu.heading': 'Branch from here',
			'menu.continue': 'Continue this session',
			'menu.continueHint': 'Append to its full trajectory',
			'menu.open': 'Open this session',
			'menu.openHint': 'Append further down this path',
			'menu.fork': 'Fork from tail',
			'menu.forkHint': 'Copy the whole trajectory into a new blind end',
			'menu.close': 'Close',
			'empty.title': 'The map has no branches yet',
			'empty.body': 'Start a session in any workspace and the map begins to grow.',
			'empty.action': 'New session',
			'empty.filtered': 'No session matches',
			'footer.sessions': 'sessions',
			'footer.blindEnds': 'blind ends',
			'footer.running': 'running',
			'workspace.other': 'Other sessions',
			'preview.empty': 'No prompt yet',
			'preview.branchHint': 'Use + at a node’s top-right corner to branch from this path',
			'time.justNow': 'just now',
			'time.minutes': '{n}m ago',
			'time.hours': '{n}h ago',
			'time.days': '{n}d ago',
			'time.months': '{n}mo ago',
			'fork.failed': 'Could not create the branch. Try again in a moment.',
			'notice.forking': 'Branching from this blind end…',
			'canvas.label': 'Session map canvas: drag to pan, scroll to zoom.',
			'canvas.hint': 'Drag to pan · Scroll to zoom · Hover a node to branch · Double-click empty space to start a session',
			'map.loading': 'Reading sessions…',
			'error.title': 'The session map cannot render right now',
			'error.body': 'Switch to another panel and come back to retry.',
			'aria.node': '{title}, {status}',
			'status.running': 'running',
			'status.leaf': 'blind end, can continue or branch',
			'status.normal': 'has branches',
			'status.current': 'currently open',
			'zoom.label': 'Zoom',
		};

		// ------------------------------------------------------------------
		// Pure graph model and layout. Exported for the Node test in test/.
		// ------------------------------------------------------------------

		/**
		 * Build the forest from list snapshots.
		 * @param sessions - the Client session store snapshot `{ids, byId}`.
		 * @param workspaces - the workspace store snapshot `{items, archivedSessionIds}`.
		 * @param showArchived - whether archived sessions stay on the map.
		 */
		function buildGraph(sessions, workspaces, showArchived) {
			const byId = (sessions && sessions.byId) || {};
			const ids = (sessions && sessions.ids) || [];
			const items = (workspaces && workspaces.items) || [];
			const archived = new Set((workspaces && workspaces.archivedSessionIds) || []);
			const included = new Map();
			// `ids` is the Host list order, but the Client store also publishes
			// delegated children only in `byId` (their projection lives on the
			// parent). Take the union so subagent branches stay on the map.
			const known = new Set(ids);
			for (const key of Object.keys(byId)) known.add(key);
			for (const id of known) {
				const row = byId[id];
				if (!row) continue;
				if (!showArchived && archived.has(id)) continue;
				included.set(id, row);
			}
			// Workspace ownership comes from the manual order the sidebar shows;
			// a child that is missing from every workspace list inherits its
			// parent's workspace so a branch never jumps bands.
			const owner = new Map();
			for (const workspace of items) {
				for (const sessionId of workspace.sessionIds || []) {
					if (!owner.has(sessionId)) owner.set(sessionId, workspace.workspaceId);
				}
			}
			const parentOf = new Map();
			for (const [id, row] of included) {
				const parent = row.parentId;
				if (parent !== undefined && parent !== id && included.has(parent)) parentOf.set(id, parent);
			}
			// Break cycles defensively: a corrupt lineage must never hang layout.
			for (const id of included.keys()) {
				let cursor = parentOf.get(id);
				let steps = 0;
				while (cursor !== undefined && steps <= included.size) {
					if (cursor === id) {
						parentOf.delete(id);
						break;
					}
					cursor = parentOf.get(cursor);
					steps += 1;
				}
			}
			const resolveOwner = (id, seen) => {
				if (owner.has(id)) return owner.get(id);
				if (seen.has(id)) return UNGROUPED;
				seen.add(id);
				const parent = parentOf.get(id);
				const resolved = parent === undefined ? UNGROUPED : resolveOwner(parent, seen);
				owner.set(id, resolved);
				return resolved;
			};
			const groups = new Map();
			for (const workspace of items) {
				groups.set(workspace.workspaceId, {
					workspaceId: workspace.workspaceId,
					title: workspace.title || workspace.path || workspace.workspaceId,
					path: workspace.path,
					nodes: [],
					roots: [],
				});
			}
			groups.set(UNGROUPED, { workspaceId: UNGROUPED, title: null, path: null, nodes: [], roots: [] });
			const nodes = new Map();
			for (const [id, row] of included) {
				const parent = parentOf.get(id);
				const workspaceId = resolveOwner(id, new Set());
				const node = {
					id,
					title: row.displayTitle || row.title || id,
					row,
					parentId: parent,
					origin: row.origin,
					running: row.running === true,
					blank: row.blank === true,
					updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
					workspaceId,
					archived: archived.has(id),
					current: false,
					children: [],
				};
				nodes.set(id, node);
				const group = groups.get(workspaceId) || groups.get(UNGROUPED);
				group.nodes.push(node);
			}
			for (const node of nodes.values()) {
				if (node.parentId !== undefined) {
					const parent = nodes.get(node.parentId);
					if (parent !== undefined) parent.children.push(node);
				}
			}
			const byUpdated = (left, right) => left.updatedAt - right.updatedAt || String(left.id).localeCompare(String(right.id));
			for (const group of groups.values()) {
				group.nodes.sort(byUpdated);
				for (const node of group.nodes) node.children.sort(byUpdated);
				group.roots = group.nodes.filter((node) => node.parentId === undefined || !nodes.has(node.parentId) || nodes.get(node.parentId).workspaceId !== group.workspaceId);
			}
			// "You are here": the Session the main view currently retains.
			for (const node of nodes.values()) {
				const retained = node.row.retainedBy;
				node.current = retained !== undefined && retained !== null && typeof retained === 'object' && (retained.mainView || 0) > 0;
			}
			let leafCount = 0;
			let runningCount = 0;
			for (const node of nodes.values()) {
				node.leaf = node.children.length === 0;
				if (node.leaf) leafCount += 1;
				if (node.running) runningCount += 1;
			}
			const orderedGroups = [];
			for (const workspace of items) {
				const group = groups.get(workspace.workspaceId);
				if (group !== undefined && group.nodes.length > 0) orderedGroups.push(group);
			}
			const ungrouped = groups.get(UNGROUPED);
			if (ungrouped !== undefined && ungrouped.nodes.length > 0) orderedGroups.push(ungrouped);
			return {
				groups: orderedGroups,
				nodes,
				total: nodes.size,
				leafCount,
				runningCount,
			};
		}

		/** Lay one group's forest out left-to-right; returns world positions + extents. */
		function layoutForest(group, nodes) {
			const childrenOf = new Map();
			const memberIds = new Set(group.nodes.map((node) => node.id));
			for (const node of group.nodes) {
				if (node.parentId !== undefined && memberIds.has(node.parentId)) {
					const list = childrenOf.get(node.parentId) || [];
					list.push(node);
					childrenOf.set(node.parentId, list);
				}
			}
			let cursor = 0;
			const positions = new Map();
			const visiting = new Set();
			const walk = (node, depth) => {
				if (visiting.has(node.id)) return null;
				visiting.add(node.id);
				const children = (childrenOf.get(node.id) || []).filter((child) => !visiting.has(child.id));
				let y;
				if (children.length === 0) {
					y = cursor * (NODE_H + V_GAP);
					cursor += 1;
				} else {
					const rows = [];
					for (const child of children) {
						const childY = walk(child, depth + 1);
						if (childY !== null) rows.push(childY);
					}
					y = rows.length === 0 ? cursor * (NODE_H + V_GAP) : (rows[0] + rows[rows.length - 1]) / 2;
					if (rows.length === 0) cursor += 1;
				}
				visiting.delete(node.id);
				positions.set(node.id, { x: depth * (NODE_W + H_GAP), y });
				return y;
			};
			const roots = group.roots.length > 0 ? group.roots : group.nodes.filter((node) => node.parentId === undefined);
			for (const root of roots) walk(root, 0);
			for (const node of group.nodes) if (!positions.has(node.id)) walk(node, 0);
			let maxX = 0;
			let maxY = 0;
			for (const position of positions.values()) {
				maxX = Math.max(maxX, position.x + NODE_W);
				maxY = Math.max(maxY, position.y + NODE_H);
			}
			return { positions, width: maxX, height: maxY };
		}

		/** Stack workspace bands and translate local forest positions into world space. */
		function layoutGraph(graph) {
			const bands = [];
			const placed = [];
			let cursorY = 0;
			for (const group of graph.groups) {
				const forest = layoutForest(group, graph.nodes);
				const contentWidth = Math.max(forest.width, 300);
				const contentHeight = Math.max(forest.height, NODE_H);
				const band = {
					workspaceId: group.workspaceId,
					title: group.title,
					x: 0,
					y: cursorY,
					width: contentWidth + BAND_PAD * 2,
					height: BAND_HEADER + contentHeight + BAND_PAD * 2,
				};
				bands.push(band);
				for (const node of group.nodes) {
					const local = forest.positions.get(node.id);
					if (local === undefined) continue;
					placed.push({
						node,
						x: BAND_PAD + local.x,
						y: cursorY + BAND_HEADER + BAND_PAD + local.y,
					});
				}
				cursorY += band.height + BAND_GAP;
			}
			const width = bands.reduce((max, band) => Math.max(max, band.width), 0);
			const height = bands.length === 0 ? 0 : bands[bands.length - 1].y + bands[bands.length - 1].height;
			return { bands, placed, bounds: { width, height } };
		}

		// ------------------------------------------------------------------
		// Small helpers
		// ------------------------------------------------------------------

		function clamp(value, min, max) {
			return Math.min(max, Math.max(min, value));
		}

		function formatRelative(timestamp, t) {
			if (!timestamp) return '';
			const diff = Date.now() - timestamp;
			const minutes = Math.floor(diff / 60000);
			if (minutes < 1) return t('time.justNow');
			if (minutes < 60) return t('time.minutes', { n: minutes });
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return t('time.hours', { n: hours });
			const days = Math.floor(hours / 24);
			if (days < 30) return t('time.days', { n: days });
			return t('time.months', { n: Math.floor(days / 30) });
		}

		function firstPromptOf(row) {
			const values = row && row.projectionValues;
			if (!values) return '';
			const turns = values.turnOutline && values.turnOutline.turns;
			if (Array.isArray(turns)) {
				for (const turn of turns) {
					if (turn && typeof turn.prompt === 'string' && turn.prompt.trim() !== '') return turn.prompt.trim();
				}
			}
			const first = values.titleInput && values.titleInput.first;
			if (first && typeof first.text === 'string') return first.text.trim();
			return '';
		}

		function truncate(text, max) {
			if (typeof text !== 'string') return '';
			const normalized = text.replace(/\s+/g, ' ').trim();
			return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
		}

		function edgePath(fromX, fromY, toX, toY) {
			const dx = Math.max(28, (toX - fromX) / 2);
			return `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
		}

		function zoomAt(view, px, py, factor) {
			const k = clamp(view.k * factor, MIN_SCALE, MAX_SCALE);
			if (k === view.k) return view;
			const ratio = k / view.k;
			return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
		}

		// ------------------------------------------------------------------
		// Icons (inline, currentColor only)
		// ------------------------------------------------------------------

		function IconMap({ size = 16 }) {
			return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
				h('circle', { cx: 5.5, cy: 12, r: 2.4 }),
				h('circle', { cx: 18.5, cy: 6, r: 2.4 }),
				h('circle', { cx: 18.5, cy: 18, r: 2.4 }),
				h('path', { d: 'M7.9 11.2 16.1 6.8' }),
				h('path', { d: 'M7.9 12.8 16.1 17.2' }));
		}

		function IconPlus({ size = 14 }) {
			return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': true },
				h('path', { d: 'M8 3v10M3 8h10' }));
		}

		function IconMinus({ size = 14 }) {
			return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': true },
				h('path', { d: 'M3 8h10' }));
		}

		function IconFit({ size = 14 }) {
			return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
				h('path', { d: 'M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4' }));
		}

		function IconArchive({ size = 14 }) {
			return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
				h('path', { d: 'M2 5h12v8H2zM1.5 2h13v3h-13zM6.5 8h3' }));
		}

		function IconReset({ size = 14 }) {
			return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
				h('path', { d: 'M3 6.5A5.2 5.2 0 1 1 2.6 9.4' }),
				h('path', { d: 'M3 2.6v4h4' }));
		}

		function IconSearch({ size = 13 }) {
			return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
				h('circle', { cx: 7, cy: 7, r: 4.2 }),
				h('path', { d: 'm10.2 10.2 3.3 3.3' }));
		}

		// ------------------------------------------------------------------
		// Styles: theme tokens only, every class under `dsm-`.
		// ------------------------------------------------------------------

		function Styles() {
			return h('style', null, `
.dsm-page{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.4}
.dsm-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:18px 24px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.dsm-heading{min-width:0}
.dsm-title{margin:0;font-size:19px;font-weight:600;letter-spacing:-.01em}
.dsm-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.dsm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}
.dsm-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsm-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsm-btn[aria-pressed="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsm-btn.dsm-icon-only{width:28px;padding:0}
.dsm-btn.dsm-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsm-search{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);min-width:170px}
.dsm-search:focus-within{border-color:var(--dsw-alias-brand-primary)}
.dsm-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.dsm-search input::placeholder{color:var(--dsw-alias-label-secondary)}
.dsm-zoom{min-width:52px;text-align:center;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:12px}
.dsm-canvas{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;cursor:grab;background-color:var(--dsw-alias-bg-base);background-image:radial-gradient(circle,var(--dsw-alias-border-l1) 1px,transparent 1px);background-size:26px 26px;touch-action:none;user-select:none;-webkit-user-select:none}
.dsm-canvas.dsm-panning{cursor:grabbing}
.dsm-world{position:absolute;left:0;top:0;transform-origin:0 0}
.dsm-edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.dsm-edge{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:1.5;vector-effect:non-scaling-stroke}
.dsm-edge.dsm-edge-sub{stroke-dasharray:5 4;stroke:var(--dsw-alias-label-secondary);opacity:.7}
.dsm-edge.dsm-edge-current{stroke:var(--dsw-alias-brand-primary);opacity:.9}
.dsm-band{position:absolute;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-2);opacity:1;pointer-events:none}
.dsm-band-label{position:absolute;left:16px;top:9px;font-size:11.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 32px)}
.dsm-node{position:absolute;width:226px;height:66px}
.dsm-node-hit{display:flex;flex-direction:column;justify-content:center;gap:5px;width:100%;height:100%;padding:8px 14px 8px 13px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:inherit;text-align:left;font:inherit;cursor:pointer;box-sizing:border-box;overflow:hidden}
.dsm-node-hit:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.dsm-node-hit:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsm-node.dsm-running .dsm-node-hit{border-color:var(--dsw-alias-state-success-primary)}
.dsm-node.dsm-current .dsm-node-hit{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}
.dsm-node.dsm-dim{opacity:.32}
.dsm-node-top{display:flex;align-items:center;gap:8px;min-width:0}
.dsm-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:0 0 auto}
.dsm-node.dsm-running .dsm-dot{background:var(--dsw-alias-state-success-primary);animation:dsm-pulse 1.6s ease-in-out infinite}
@keyframes dsm-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.78)}}
.dsm-node-title{min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13px;font-weight:550;line-height:1.32}
.dsm-node-meta{display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap}
.dsm-badge{display:inline-flex;align-items:center;gap:3px;padding:0 5px;height:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;font-size:10.5px;line-height:1;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsm-badge.dsm-badge-current{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dsm-badge.dsm-badge-leaf{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dsm-badge.dsm-badge-run{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.dsm-time{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-cap{position:absolute;right:-6px;top:calc(50% - 6px);width:8px;height:8px;transform:rotate(45deg);background:var(--dsw-alias-bg-base);border:1.5px solid var(--dsw-alias-brand-primary);border-radius:2px;pointer-events:none}
.dsm-branch-add{position:absolute;right:-10px;top:-10px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-brand-primary);border-radius:50%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-brand-primary);cursor:pointer;padding:0;opacity:.5;transition:opacity .12s ease}
.dsm-branch-add:hover{background:var(--dsw-alias-bg-layer-2)}
.dsm-branch-add:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsm-node:hover .dsm-branch-add,.dsm-node:focus-within .dsm-branch-add,.dsm-node.dsm-menu-open .dsm-branch-add{opacity:1}
.dsm-node.dsm-menu-open .dsm-node-hit{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}
.dsm-card{position:absolute;z-index:8;width:276px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);padding:11px 12px;box-sizing:border-box}
.dsm-card.dsm-preview{pointer-events:none}
.dsm-card-title{font-size:12.5px;font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dsm-card-meta{margin-top:4px;display:flex;flex-wrap:wrap;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11px}
.dsm-card-preview{margin-top:7px;padding-top:7px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.dsm-card-hint{margin-top:6px;color:var(--dsw-alias-label-secondary);font-size:10.5px}
.dsm-card-actions{margin-top:9px;display:flex;flex-direction:column;gap:6px}
.dsm-action{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer}
.dsm-action:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.dsm-action:disabled{opacity:.55;cursor:default}
.dsm-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsm-action strong{font-size:12.5px;font-weight:600}
.dsm-action span{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsm-card-foot{display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:8px}
.dsm-link{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;padding:2px 4px;border-radius:5px}
.dsm-link:hover{color:var(--dsw-alias-label-primary)}
.dsm-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsm-minimap{position:absolute;right:16px;bottom:16px;width:178px;height:114px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);overflow:hidden;cursor:crosshair;z-index:6}
.dsm-minimap svg{display:block;width:100%;height:100%}
.dsm-footer{position:absolute;left:16px;bottom:16px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;max-width:calc(100% - 220px);z-index:6}
.dsm-chip{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap}
.dsm-chip b{font-weight:600;color:var(--dsw-alias-label-primary)}
.dsm-swatch{width:14px;height:0;border-top:2px solid var(--dsw-alias-border-l2)}
.dsm-swatch.dsm-swatch-sub{border-top-style:dashed}
.dsm-swatch.dsm-swatch-leaf{width:8px;height:8px;border:1.5px solid var(--dsw-alias-brand-primary);border-radius:2px;transform:rotate(45deg)}
.dsm-swatch.dsm-swatch-run{width:7px;height:7px;border:0;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.dsm-hint{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:6;padding:4px 10px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;pointer-events:none}
.dsm-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;text-align:center;padding:24px;z-index:4;pointer-events:none}
.dsm-empty h2{margin:0;font-size:16px;font-weight:600}
.dsm-empty p{margin:0;max-width:42ch;color:var(--dsw-alias-label-secondary);font-size:12.5px}
.dsm-empty .dsm-btn{pointer-events:auto}
.dsm-empty .dsm-empty-glyph{color:var(--dsw-alias-label-secondary)}
.dsm-notice{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:9;padding:6px 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);font-size:12px;color:var(--dsw-alias-label-primary);max-width:70%}
.dsm-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
`);
		}

		// ------------------------------------------------------------------
		// Error boundary: a thrown view should not blank the panel.
		// ------------------------------------------------------------------

		class MapBoundary extends React.Component {
			constructor(props) {
				super(props);
				this.state = { failed: false };
			}

			static getDerivedStateFromError() {
				return { failed: true };
			}

			render() {
				if (this.state.failed) {
					return h('section', { className: 'dsm-page', role: 'alert' },
						h('div', { className: 'dsm-empty' },
							h('h2', null, this.props.t('error.title')),
							h('p', null, this.props.t('error.body'))));
				}
				return this.props.children;
			}
		}

		// ------------------------------------------------------------------
		// The panel
		// ------------------------------------------------------------------

		function SessionMapPage(props) {
			const { t, actions } = props;
			const sessions = props.useSessions((state) => state);
			const workspaces = props.useWorkspaces((state) => state);
			const [showArchived, setShowArchived] = useState(false);
			const [query, setQuery] = useState('');
			const [view, setView] = useState({ x: 0, y: 0, k: 1 });
			const [size, setSize] = useState({ w: 0, h: 0 });
			const [offsets, setOffsets] = useState({});
			const [hoverId, setHoverId] = useState(null);
			const [menuId, setMenuId] = useState(null);
			const [busyId, setBusyId] = useState(null);
			const [notice, setNotice] = useState(null);
			const [fitted, setFitted] = useState(false);
			const [fitRequest, setFitRequest] = useState(0);

			const canvasRef = useRef(null);
			const viewRef = useRef(view);
			const noticeTimer = useRef(null);
			viewRef.current = view;

			const graph = useMemo(() => buildGraph(sessions, workspaces, showArchived), [sessions, workspaces, showArchived]);
			const layout = useMemo(() => layoutGraph(graph), [graph]);

			const placed = useMemo(() => {
				return layout.placed.map((entry) => {
					const offset = offsets[entry.node.id];
					return {
						node: entry.node,
						x: entry.x + (offset ? offset.dx : 0),
						y: entry.y + (offset ? offset.dy : 0),
					};
				});
			}, [layout, offsets]);

			const placedById = useMemo(() => {
				const map = new Map();
				for (const entry of placed) map.set(entry.node.id, entry);
				return map;
			}, [placed]);

			// Bounds follow manual node offsets, so "fit" brings dragged nodes back.
			const worldBounds = useMemo(() => {
				if (placed.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
				let minX = Infinity;
				let minY = Infinity;
				let maxX = -Infinity;
				let maxY = -Infinity;
				for (const entry of placed) {
					minX = Math.min(minX, entry.x);
					minY = Math.min(minY, entry.y);
					maxX = Math.max(maxX, entry.x + NODE_W);
					maxY = Math.max(maxY, entry.y + NODE_H);
				}
				return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
			}, [placed]);

			const edges = useMemo(() => {
				const out = [];
				for (const entry of placed) {
					const parent = entry.node.parentId;
					if (parent === undefined) continue;
					const from = placedById.get(parent);
					if (from === undefined) continue;
					out.push({
						id: `${parent}->${entry.node.id}`,
						path: edgePath(from.x + NODE_W, from.y + NODE_H / 2, entry.x, entry.y + NODE_H / 2),
						subagent: entry.node.origin === 'subagent',
						current: entry.node.current,
					});
				}
				return out;
			}, [placed, placedById]);

			const normalizedQuery = query.trim().toLowerCase();
			const matchedIds = useMemo(() => {
				if (normalizedQuery === '') return null;
				const set = new Set();
				for (const node of graph.nodes.values()) {
					if (node.title.toLowerCase().includes(normalizedQuery)) set.add(node.id);
				}
				return set;
			}, [graph, normalizedQuery]);

			const current = useMemo(() => {
				for (const node of graph.nodes.values()) if (node.current) return node;
				return undefined;
			}, [graph]);

			const showNotice = useCallback((message) => {
				setNotice(message);
				if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
				noticeTimer.current = setTimeout(() => setNotice(null), 4200);
			}, []);

			useEffect(() => () => {
				if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
			}, []);

			// Container size drives fit, minimap and card clamping.
			useEffect(() => {
				const element = canvasRef.current;
				if (!element) return undefined;
				const observer = new ResizeObserver((entries) => {
					const rect = entries[0] && entries[0].contentRect;
					if (!rect) return;
					setSize((previous) => {
						const next = { w: Math.round(rect.width), h: Math.round(rect.height) };
						return previous.w === next.w && previous.h === next.h ? previous : next;
					});
				});
				observer.observe(element);
				return () => observer.disconnect();
			}, []);

			const fitView = useCallback(() => {
				const bounds = worldBounds;
				if (bounds.width <= 0 || bounds.height <= 0 || size.w <= 0 || size.h <= 0) return;
				const pad = 56;
				const k = clamp(Math.min((size.w - pad * 2) / bounds.width, (size.h - pad * 2) / bounds.height), MIN_SCALE, 1.4);
				setView({ k, x: (size.w - bounds.width * k) / 2 - bounds.x * k, y: (size.h - bounds.height * k) / 2 - bounds.y * k });
			}, [worldBounds, size]);

			useEffect(() => {
				if (fitted || size.w <= 0 || size.h <= 0 || placed.length === 0) return;
				setFitted(true);
				// Opening the map should read like "you are here", not like a
				// zoomed-out poster of every band: centre the current Session at a
				// legible scale. "Fit to view" remains one click away.
				const activeEntry = current === undefined ? undefined : placedById.get(current.id);
				if (activeEntry === undefined) {
					fitView();
					return;
				}
				const k = clamp(0.9, MIN_SCALE, MAX_SCALE);
				setView({
					k,
					x: size.w / 2 - (activeEntry.x + NODE_W / 2) * k,
					y: size.h / 2 - (activeEntry.y + NODE_H / 2) * k,
				});
			}, [fitted, size, placed, current, placedById, fitView]);

			useEffect(() => {
				if (fitRequest > 0) fitView();
			}, [fitRequest, fitView]);

			// Native wheel listener: React's wheel is passive, so preventDefault
			// needs a real listener on the canvas.
			useEffect(() => {
				const element = canvasRef.current;
				if (!element) return undefined;
				const onWheel = (event) => {
					event.preventDefault();
					const rect = element.getBoundingClientRect();
					const px = event.clientX - rect.left;
					const py = event.clientY - rect.top;
					const factor = Math.exp(-event.deltaY * 0.0016);
					setView((previous) => zoomAt(previous, px, py, factor));
				};
				element.addEventListener('wheel', onWheel, { passive: false });
				return () => element.removeEventListener('wheel', onWheel);
			}, []);

			useEffect(() => {
				const onKeyDown = (event) => {
					if (event.key === 'Escape') {
						setMenuId(null);
						setHoverId(null);
					}
				};
				window.addEventListener('keydown', onKeyDown);
				return () => window.removeEventListener('keydown', onKeyDown);
			}, []);

			const zoomBy = useCallback((factor) => {
				setView((previous) => zoomAt(previous, size.w / 2, size.h / 2, factor));
			}, [size]);

			const startPan = useCallback((event) => {
				if (event.button !== 0) return;
				const target = event.target;
				if (target instanceof Element && target.closest('[data-dsm-node]')) return;
				if (target instanceof Element && target.closest('[data-dsm-ui]')) return;
				setMenuId(null);
				const element = canvasRef.current;
				if (!element) return;
				const start = { x: event.clientX, y: event.clientY, view: { ...viewRef.current } };
				element.setPointerCapture(event.pointerId);
				element.classList.add('dsm-panning');
				const onMove = (moveEvent) => {
					setView({ ...start.view, x: start.view.x + (moveEvent.clientX - start.x), y: start.view.y + (moveEvent.clientY - start.y) });
				};
				const onUp = () => {
					element.classList.remove('dsm-panning');
					element.removeEventListener('pointermove', onMove);
					element.removeEventListener('pointerup', onUp);
					element.removeEventListener('pointercancel', onUp);
				};
				element.addEventListener('pointermove', onMove);
				element.addEventListener('pointerup', onUp);
				element.addEventListener('pointercancel', onUp);
			}, []);

			const dragNode = useCallback((event, node) => {
				if (event.button !== 0) return;
				event.stopPropagation();
				const element = event.currentTarget;
				element.setPointerCapture(event.pointerId);
				const start = { x: event.clientX, y: event.clientY, dx: (offsets[node.id] && offsets[node.id].dx) || 0, dy: (offsets[node.id] && offsets[node.id].dy) || 0 };
				let moved = false;
				const activate = (targetNode) => {
					if (targetNode.archived) {
						showNotice(t('open.archived'));
						return;
					}
					if (targetNode.leaf) {
						setMenuId((previous) => (previous === targetNode.id ? null : targetNode.id));
						setHoverId(null);
					} else {
						actions.open(targetNode.id);
					}
				};
				const onMove = (moveEvent) => {
					const dx = (moveEvent.clientX - start.x) / viewRef.current.k;
					const dy = (moveEvent.clientY - start.y) / viewRef.current.k;
					if (!moved && Math.hypot(dx, dy) > 3) moved = true;
					if (!moved) return;
					setOffsets((previous) => ({ ...previous, [node.id]: { dx: Math.round(start.dx + dx), dy: Math.round(start.dy + dy) } }));
				};
				const onUp = () => {
					element.removeEventListener('pointermove', onMove);
					element.removeEventListener('pointerup', onUp);
					element.removeEventListener('pointercancel', onUp);
					if (!moved) activate(node);
				};
				element.addEventListener('pointermove', onMove);
				element.addEventListener('pointerup', onUp);
				element.addEventListener('pointercancel', onUp);
			}, [actions, offsets, showNotice, t]);

			const forkFrom = useCallback(async (node) => {
				setMenuId(null);
				setBusyId(node.id);
				showNotice(t('notice.forking'));
				try {
					await actions.fork(node.id);
				} catch (error) {
					console.warn('[session-map] fork failed', error);
					showNotice(t('fork.failed'));
				} finally {
					setBusyId(null);
				}
			}, [actions, showNotice, t]);

			const newSessionIn = useCallback((workspaceId) => {
				actions.newSession(workspaceId);
			}, [actions]);

			const onDoubleClick = useCallback((event) => {
				const target = event.target;
				if (target instanceof Element && (target.closest('[data-dsm-node]') || target.closest('[data-dsm-ui]'))) return;
				const element = canvasRef.current;
				if (!element) return;
				const rect = element.getBoundingClientRect();
				const wx = (event.clientX - rect.left - viewRef.current.x) / viewRef.current.k;
				const wy = (event.clientY - rect.top - viewRef.current.y) / viewRef.current.k;
				const band = layout.bands.find((item) => wx >= item.x && wx <= item.x + item.width && wy >= item.y && wy <= item.y + item.height);
				newSessionIn(band && band.workspaceId !== UNGROUPED ? band.workspaceId : undefined);
			}, [layout, newSessionIn]);

			const minimap = useMemo(() => {
				const bounds = worldBounds;
				if (bounds.width <= 0 || bounds.height <= 0) return null;
				const pad = 8;
				const scale = Math.min((MINIMAP_W - pad * 2) / bounds.width, (MINIMAP_H - pad * 2) / bounds.height);
				const offsetX = (MINIMAP_W - bounds.width * scale) / 2 - bounds.x * scale;
				const offsetY = (MINIMAP_H - bounds.height * scale) / 2 - bounds.y * scale;
				return { scale, offsetX, offsetY };
			}, [worldBounds]);

			const onMinimap = useCallback((event) => {
				if (!minimap) return;
				const element = event.currentTarget;
				const rect = element.getBoundingClientRect();
				const px = ((event.clientX - rect.left) / rect.width) * MINIMAP_W;
				const py = ((event.clientY - rect.top) / rect.height) * MINIMAP_H;
				const wx = (px - minimap.offsetX) / minimap.scale;
				const wy = (py - minimap.offsetY) / minimap.scale;
				setView((previous) => ({ ...previous, x: size.w / 2 - wx * previous.k, y: size.h / 2 - wy * previous.k }));
			}, [minimap, size]);

			const hoverEntry = hoverId === null ? undefined : placedById.get(hoverId);
			const menuEntry = menuId === null ? undefined : placedById.get(menuId);
			const menuNode = menuEntry ? menuEntry.node : undefined;
			const noMatches = matchedIds !== null && matchedIds.size === 0;

			const cardPosition = (entry) => {
				if (!entry) return null;
				const screenX = entry.x * view.k + view.x;
				const screenY = entry.y * view.k + view.y;
				const width = 276;
				const left = clamp(screenX, 8, Math.max(8, size.w - width - 8));
				const nodeBottom = screenY + NODE_H * view.k;
				const estimated = 200;
				const top = nodeBottom + 10 + estimated > size.h ? Math.max(8, screenY - estimated - 10) : nodeBottom + 10;
				return { left, top };
			};

			const hoverCard = hoverEntry && hoverId !== menuId ? h('div', { className: 'dsm-card dsm-preview', style: cardPosition(hoverEntry), 'aria-hidden': true },
				h('div', { className: 'dsm-card-title' }, hoverEntry.node.title),
				h('div', { className: 'dsm-card-meta' },
					h('span', null, formatRelative(hoverEntry.node.updatedAt, t)),
					hoverEntry.node.children.length > 0 ? h('span', null, t('node.children', { n: hoverEntry.node.children.length })) : h('span', { className: 'dsm-badge dsm-badge-leaf' }, t('node.blindEnd')),
					hoverEntry.node.current ? h('span', { className: 'dsm-badge dsm-badge-current' }, t('node.current')) : null),
				h('div', { className: 'dsm-card-preview' }, firstPromptOf(hoverEntry.node.row) || t('preview.empty')),
				h('div', { className: 'dsm-card-hint' }, t('preview.branchHint'))) : null;

			const menuCard = menuEntry && menuNode ? h('div', { className: 'dsm-card', style: cardPosition(menuEntry), 'data-dsm-ui': 'menu', role: 'dialog', 'aria-label': t('node.actions') },
				h('div', { className: 'dsm-card-title' }, menuNode.title),
				h('div', { className: 'dsm-card-meta' },
					menuNode.leaf ? h('span', { className: 'dsm-badge dsm-badge-leaf' }, t('node.blindEnd')) : menuNode.origin === 'subagent' ? h('span', { className: 'dsm-badge' }, t('node.subagent')) : menuNode.parentId !== undefined ? h('span', { className: 'dsm-badge' }, t('node.fork')) : null,
					h('span', null, formatRelative(menuNode.updatedAt, t))),
				h('div', { className: 'dsm-card-actions' },
					h('button', { type: 'button', className: 'dsm-action', autoFocus: true, onClick: () => {
						setMenuId(null);
						if (menuNode.archived) showNotice(t('open.archived'));
						else actions.open(menuNode.id);
					} },
						h('strong', null, menuNode.leaf ? t('menu.continue') : t('menu.open')),
						h('span', null, menuNode.leaf ? t('menu.continueHint') : t('menu.openHint'))),
					h('button', { type: 'button', className: 'dsm-action', disabled: busyId === menuNode.id || menuNode.archived, onClick: () => { void forkFrom(menuNode); } },
						h('strong', null, t('menu.fork')),
						h('span', null, t('menu.forkHint')))),
				h('div', { className: 'dsm-card-foot' },
					h('span', { className: 'dsm-time' }, t('menu.heading')),
					h('button', { type: 'button', className: 'dsm-link', onClick: () => setMenuId(null) }, t('menu.close')))) : null;

			const empty = graph.total === 0 && sessions.phase !== 'pending';
			const loading = sessions.phase === 'pending';
			const statusText = (node) => {
				const parts = [];
				if (node.current) parts.push(t('status.current'));
				parts.push(node.running ? t('status.running') : node.leaf ? t('status.leaf') : t('status.normal'));
				return parts.join(' · ');
			};

			return h('section', { className: 'dsm-page', 'aria-label': t('title') },
				h(Styles),
				h('header', { className: 'dsm-head' },
					h('div', { className: 'dsm-heading' },
						h('h1', { className: 'dsm-title' }, t('title'))),
					h('div', { className: 'dsm-toolbar', 'data-dsm-ui': 'toolbar' },
						h('label', { className: 'dsm-search' },
							h(IconSearch, null),
							h('input', {
								type: 'search',
								value: query,
								placeholder: t('toolbar.searchPlaceholder'),
								'aria-label': t('toolbar.searchLabel'),
								onChange: (event) => setQuery(event.target.value),
							})),
						h('button', { type: 'button', className: 'dsm-btn dsm-icon-only', title: t('toolbar.zoomOut'), 'aria-label': t('toolbar.zoomOut'), onClick: () => zoomBy(0.8) }, h(IconMinus, null)),
						h('span', { className: 'dsm-zoom', 'aria-label': t('zoom.label') }, `${Math.round(view.k * 100)}%`),
						h('button', { type: 'button', className: 'dsm-btn dsm-icon-only', title: t('toolbar.zoomIn'), 'aria-label': t('toolbar.zoomIn'), onClick: () => zoomBy(1.25) }, h(IconPlus, null)),
						h('button', { type: 'button', className: 'dsm-btn dsm-icon-only', title: t('toolbar.fit'), 'aria-label': t('toolbar.fit'), onClick: fitView }, h(IconFit, null)),
						h('button', {
							type: 'button',
							className: 'dsm-btn dsm-icon-only',
							title: t('toolbar.reset'),
							'aria-label': t('toolbar.reset'),
							onClick: () => {
								setOffsets({});
								setFitRequest((previous) => previous + 1);
							},
						}, h(IconReset, null)),
						h('button', {
							type: 'button',
							className: 'dsm-btn',
							title: showArchived ? t('toolbar.hideArchived') : t('toolbar.archived'),
							'aria-pressed': showArchived,
							onClick: () => setShowArchived((previous) => !previous),
						}, h(IconArchive, null), showArchived ? t('toolbar.hideArchived') : t('toolbar.archived')),
						h('button', { type: 'button', className: 'dsm-btn dsm-primary', onClick: () => newSessionIn(current ? current.workspaceId : undefined) },
							h(IconPlus, null),
							t('toolbar.new')))),
				h('div', {
					ref: canvasRef,
					className: 'dsm-canvas',
					role: 'region',
					'aria-label': t('canvas.label'),
					onPointerDown: startPan,
					onDoubleClick,
				},
					// No will-change/translateZ here: promoting the world to its own
					// layer makes Chromium upscale a raster captured at the previous
					// zoom, which is what made HIDPI zoomed-in text look soft. A plain
					// 2D transform is re-rasterized at the new scale, and rounding the
					// pan keeps glyphs off half pixels.
					h('div', { className: 'dsm-world', style: { transform: `translate(${Math.round(view.x)}px, ${Math.round(view.y)}px) scale(${view.k})` } },
						...layout.bands.map((band) => h('div', {
							key: `band-${band.workspaceId}`,
							className: 'dsm-band',
							style: { left: band.x, top: band.y, width: band.width, height: band.height },
						}, h('div', { className: 'dsm-band-label' }, band.workspaceId === UNGROUPED ? t('workspace.other') : band.title))),
						h('svg', { className: 'dsm-edges', width: 1, height: 1, 'aria-hidden': true },
							...edges.map((edge) => h('path', {
								key: edge.id,
								className: `dsm-edge${edge.subagent ? ' dsm-edge-sub' : ''}${edge.current ? ' dsm-edge-current' : ''}`,
								d: edge.path,
							}))),
						...placed.map((entry) => {
							const node = entry.node;
							const dim = matchedIds !== null && !matchedIds.has(node.id);
							const classes = ['dsm-node'];
							if (node.leaf) classes.push('dsm-leaf');
							if (node.running) classes.push('dsm-running');
							if (node.current) classes.push('dsm-current');
							if (menuId === node.id) classes.push('dsm-menu-open');
							if (dim) classes.push('dsm-dim');
							return h('div', {
								key: node.id,
								className: classes.join(' '),
								style: { left: entry.x, top: entry.y },
								'data-dsm-node': node.id,
								onPointerEnter: () => setHoverId(node.id),
								onPointerLeave: () => setHoverId((previous) => (previous === node.id ? null : previous)),
							},
								h('div', {
									className: 'dsm-node-hit',
									role: 'button',
									tabIndex: 0,
									'aria-label': t('aria.node', { title: node.title, status: statusText(node) }),
									'aria-haspopup': node.leaf ? 'dialog' : undefined,
									'aria-expanded': node.leaf ? menuId === node.id : undefined,
									onPointerDown: (event) => dragNode(event, node),
									onKeyDown: (event) => {
										if (event.key !== 'Enter' && event.key !== ' ') return;
										event.preventDefault();
										if (node.archived) showNotice(t('open.archived'));
										else if (node.leaf) setMenuId(node.id);
										else actions.open(node.id);
									},
								},
									h('span', { className: 'dsm-node-top' },
										h('span', { className: 'dsm-dot', 'aria-hidden': true }),
										h('span', { className: 'dsm-node-title' }, node.title)),
									h('span', { className: 'dsm-node-meta' },
										node.origin === 'subagent' ? h('span', { className: 'dsm-badge' }, t('node.subagent')) : node.parentId !== undefined ? h('span', { className: 'dsm-badge' }, t('node.fork')) : null,
										node.current ? h('span', { className: 'dsm-badge dsm-badge-current' }, t('node.current')) : null,
										node.running ? h('span', { className: 'dsm-badge dsm-badge-run' }, t('node.running')) : null,
										node.archived ? h('span', { className: 'dsm-badge' }, t('node.archived')) : null,
										h('span', { className: 'dsm-time' }, formatRelative(node.updatedAt, t)))),
								node.leaf ? h('span', { className: 'dsm-cap', 'aria-hidden': true }) : null,
								h('button', {
									type: 'button',
									className: 'dsm-branch-add',
									title: t('node.branch'),
									'aria-label': t('node.branch'),
									'aria-haspopup': 'dialog',
									'aria-expanded': menuId === node.id,
									onPointerDown: (event) => event.stopPropagation(),
									onClick: (event) => {
										event.stopPropagation();
										setMenuId((previous) => (previous === node.id ? null : node.id));
									},
								}, h(IconPlus, { size: 12 })));
						})),
					hoverCard,
					menuCard,
					empty ? h('div', { className: 'dsm-empty' },
						h('div', { className: 'dsm-empty-glyph' }, h(IconMap, { size: 34 })),
						h('h2', null, t('empty.title')),
						h('p', null, t('empty.body')),
						h('button', { type: 'button', className: 'dsm-btn dsm-primary', onClick: () => newSessionIn(undefined) }, t('empty.action'))) : null,
					loading && !empty ? h('div', { className: 'dsm-empty' }, h('p', null, t('map.loading'))) : null,
					noMatches && !empty ? h('div', { className: 'dsm-empty' }, h('p', null, t('empty.filtered'))) : null,
					placed.length > 0 ? h('div', { className: 'dsm-hint' }, t('canvas.hint')) : null,
					placed.length > 0 ? h('div', { className: 'dsm-footer' },
						h('span', { className: 'dsm-chip' }, h('b', null, graph.total), t('footer.sessions')),
						h('span', { className: 'dsm-chip' }, h('b', null, graph.leafCount), t('footer.blindEnds')),
						graph.runningCount > 0 ? h('span', { className: 'dsm-chip' }, h('b', null, graph.runningCount), t('footer.running')) : null,
						h('span', { className: 'dsm-chip' }, h('span', { className: 'dsm-swatch' }), t('legend.fork')),
						h('span', { className: 'dsm-chip' }, h('span', { className: 'dsm-swatch dsm-swatch-sub' }), t('legend.subagent')),
						h('span', { className: 'dsm-chip' }, h('span', { className: 'dsm-swatch dsm-swatch-leaf' }), t('legend.blindEnd'))) : null,
					minimap && placed.length > 0 ? h('div', {
						className: 'dsm-minimap',
						'data-dsm-ui': 'minimap',
						role: 'presentation',
						onPointerDown: (event) => event.stopPropagation(),
						onClick: onMinimap,
					}, h('svg', { viewBox: `0 0 ${MINIMAP_W} ${MINIMAP_H}`, 'aria-hidden': true },
						...layout.bands.map((band) => h('rect', {
							key: `mm-band-${band.workspaceId}`,
							x: minimap.offsetX + band.x * minimap.scale,
							y: minimap.offsetY + band.y * minimap.scale,
							width: Math.max(1, band.width * minimap.scale),
							height: Math.max(1, band.height * minimap.scale),
							rx: 2,
							fill: 'var(--dsw-alias-bg-layer-2)',
							stroke: 'var(--dsw-alias-border-l1)',
							strokeWidth: 0.6,
						})),
						...placed.map((entry) => h('rect', {
							key: `mm-${entry.node.id}`,
							x: minimap.offsetX + entry.x * minimap.scale,
							y: minimap.offsetY + entry.y * minimap.scale,
							width: Math.max(1.5, NODE_W * minimap.scale),
							height: Math.max(1, NODE_H * minimap.scale),
							rx: 1.4,
							fill: entry.node.current ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
							opacity: entry.node.current ? 0.9 : 0.5,
						})),
						(() => {
							const worldX = -view.x / view.k;
							const worldY = -view.y / view.k;
							const worldW = size.w / view.k;
							const worldH = size.h / view.k;
							return h('rect', {
								x: minimap.offsetX + worldX * minimap.scale,
								y: minimap.offsetY + worldY * minimap.scale,
								width: Math.max(2, worldW * minimap.scale),
								height: Math.max(2, worldH * minimap.scale),
								rx: 2,
								fill: 'none',
								stroke: 'var(--dsw-alias-brand-primary)',
								strokeWidth: 1.2,
							});
						})())) : null,
					notice ? h('div', { className: 'dsm-notice', role: 'status', 'aria-live': 'polite' }, notice) : null,
					h('span', { className: 'dsm-sr', 'aria-live': 'polite' }, busyId ? t('notice.forking') : '')));
		}

		/** Sidebar entry icon; the sidebar owns the accessible label. */
		function SessionMapIcon({ size = 16 }) {
			return h(IconMap, { size });
		}

		const inject = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace'];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-map: dictionaries');
			const t = ctx.locale.bind(NS);
			const actions = {
				open: (sessionId) => {
					try {
						ctx.uiWorkspace.openSession(sessionId);
					} catch (error) {
						console.warn('[session-map] open failed', error);
					}
				},
				fork: async (sessionId) => {
					await ctx.sessions.fork({
						sessionId,
						increaseTitle: true,
						onCreated: (childId) => {
							ctx.uiWorkspace.openSession(childId);
						},
					});
				},
				newSession: (workspaceId) => {
					ctx.uiWorkspace.startSession(workspaceId);
				},
			};
			ctx.slots.inject('main', () => ctx.slots.register({
				name: 'main',
				key: PANEL_ID,
				locale: NS,
				inject: () => ({ actions }),
			}, (props) => h(MapBoundary, { t }, h(SessionMapPage, props))));
			ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
				name: 'sidebar.panellist',
				id: PANEL_ID,
				order: 20,
				locale: NS,
				label: () => t('panel'),
			}, SessionMapIcon));
		}

		exports.apply = apply;
		exports.inject = inject;
		// Pure functions for the Node test harness; inert in the browser.
		exports.__test = { buildGraph, layoutGraph, layoutForest, edgePath, zoomAt, formatRelative, firstPromptOf, truncate, zh, en, NODE_W, NODE_H, UNGROUPED, MIN_SCALE, MAX_SCALE };
		return module.exports;
	},
});
