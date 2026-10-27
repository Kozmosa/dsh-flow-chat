# dsh-flow-chat

DSH (DeepSeek Harness) 本地插件工作区：把对话做成一棵可分支的思维导图。

## 包

| 包 | 说明 |
|---|---|
| [`dsh-session-map`](dsh-session-map/README.md) | 会话地图：会话为节点、血统为边的画布面板；盲端（叶子）可继续或 fork，任意节点可从尾部开分支 |
| `dsh-session-rename` | 给 Agent 提供 `rename_session` 工具（基于内置 session-title 服务） |

## 安装（DSH profile 内）

```
plugin_manager install_bundle <本仓库>/dsh-session-map
plugin_manager install_bundle <本仓库>/dsh-session-rename
```

## 测试

```
node dsh-session-map/test/graph.test.mjs
node dsh-session-rename/test/tool.test.mjs
```
