# 场景 WebMCP 交付与验收记录

更新日期：2026-09-09。

当前状态：登录跨域问题已修复，2026-09-09 真实无痕登录态的读取与五类暂存/取消验收通过。未提交或发布真实场景；Unity 预览沿用上轮结果。

## 当前实现与范围

`src/services/webmcp/scene-editor-tools.ts` 汇总 18 个工具，由 `src/views/verse/scene.vue` 在页面挂载时注册、卸载时通过 AbortController 清理。`model-context.ts` 对不支持 WebMCP 的浏览器无操作，并处理同步、异步注册失败。

| 能力 | 工具 |
| --- | --- |
| 读取、检查、搜索（5） | `xrugc_get_scene_editor_context`、`xrugc_get_scene_modules`、`xrugc_inspect_scene_module`、`xrugc_validate_scene`、`xrugc_search_entities` |
| 放置、变换、属性、删除、发布（10） | 每项分别提供 `xrugc_stage_scene_*` 与 `xrugc_complete_scene_*` |
| Unity 预览（3） | `xrugc_get_scene_runtime_preview_status`、`xrugc_start_scene_runtime_preview`、`xrugc_stop_scene_runtime_preview` |

场景页面依赖 editor 子模块中的 `plugin/webmcp/VerseScene*Handlers.ts` 和 `plugin/bootstrap/verse-bootstrap.ts`。交付时必须包含 web 与 editor 子模块的对应改动，不能仅提交超级项目的子模块指针。工作树另有 Blockly、实体、脚本、邮件验证、环境配置等既有改动；本轮未把它们当作新增内容提交或清理。

## 本轮代码审查与修复

五类场景草稿分别位于 `scene-entity-placement-tools.ts`、`scene-module-transform-tools.ts`、`scene-module-property-tools.ts`、`scene-module-deletion-tools.ts`、`scene-publication-tools.ts`。

- 在等待确认框之前消费草稿，阻止同一 draftId 并发重放引发多次提交。
- 确认框返回后再次检查五分钟有效期及当前场景 ID。过期或切换场景均不进入保存/发布回调。
- 缓存仅在新增草稿时预留空位；缓存恰好满额时，读取最早草稿不会错误淘汰它。
- 页面 complete 回调仍复核权限、未保存状态及场景版本，编辑器命令仍携带 expectedSceneVersion。发布继续要求可见确认，并使用现有 take-photo 接口。

## 验证结果与证据口径

用户移交的上轮结果：18/18 注册、读取/校验/搜索通过，五种操作 staged 后取消，Unity `closed → loading → running → closed`，场景写请求 0，定向测试 87/87。对应实现、注册断言与验收脚本在当前工作树存在；未找到上轮原始日志，不能将 87/87 当作本轮重新执行结果。

本轮执行：

- 原有五类场景草稿测试：15/15 通过。
- 新增 `test/unit/services/webmcp/scene-draft-lifecycle.spec.ts`：20/20 通过，覆盖并发重放、确认期间过期、确认期间切换场景及满容量读取。
- `pnpm run type-check`：通过。
- 五个修改的服务文件 ESLint：通过。
- 验收脚本 `node --check`：通过。
- `git diff --check`：通过（未跟踪文件另经语法及定向检查）。

## 可复用登录态验收

脚本：`scripts/webmcp-scene-e2e.mjs`。使用已经认证的 Chrome **副本**，避免占用或修改用户原始浏览器目录。登录态和证据目录不要提交到 Git。

```bash
XRUGC_PROFILE=/absolute/path/to/authenticated-profile-copy \
XRUGC_BASE_URL=http://localhost:3001 \
XRUGC_API_BASE_URL=http://localhost:3001/dev-api \
XRUGC_SCENE_ID=2220 \
XRUGC_SKIP_PREVIEW=true \
XRUGC_E2E_ARTIFACT_DIR=/absolute/path/to/artifacts \
pnpm exec node scripts/webmcp-scene-e2e.mjs
```

本轮跳过已通过且未修改的 Unity 预览；需完整验收时移除 `XRUGC_SKIP_PREVIEW=true`，确保 3006 预览服务可用。完整验收要求实际达到 running，attention 不再视为通过。

脚本阻止所有 frame 中除 GET/HEAD/OPTIONS 以外的请求，仅精确允许指定 API base 下的 POST `/v1/auth/refresh`（包括本地 `/dev-api` 前缀） 恢复现有会话。Service Worker 被禁用以保证拦截生效。场景保存、删除、快照发布均无放行选项。任何被拦截的写请求都会使验收失败；确认框只点击取消。

脚本自动创建证据目录，成功写入 `report.json` 与截图；失败写入 `failure.json` 与 `failure.png`。失败日志只记录 HTTP 状态、无查询参数的接口路径，不保存 token 或响应体。零变更断言包含请求数、dirty、实例数量、首实例标题与变换、最终校验结果。

## 剩余验证边界

- 本脚本通过 document.modelContext shim 验证页面注册和执行合同，不代表原生浏览器 WebMCP transport 已验收。
- 未授权真实场景保存/删除/发布，所以服务器写入成功、保存失败后的恢复、多客户端竞争不属于此次线上验收结果；需要独立可丢弃测试场景才能进一步验证。
- 本轮修复针对场景工具；实体与脚本等其他工具的完整登录态验收不应由场景结果推断。
- 生产部署必须同时构建并部署匹配的 editor 子模块和 web。当前仍是未提交工作树，未发布线上版本。

## 2026-09-07 登录态验收阻塞（历史记录，现已解除）

主 Chrome 与 Codex profile 副本均未能完成登录态回归：页面最终重定向到 `/web/index?redirect=...`。在用户实际 Chrome 中打开场景页同样显示“登录过期，请重新登录”，因此不能用副本失败推断场景工具失效，也不能把本轮 E2E 标记为通过。

初次保护拦截了会话刷新（没有场景写请求）；精确放行刷新后重试仍无法维持登录。最终 Codex 副本运行的 `blockedWrites` 为 0，未执行场景提交或发布。Unity 预览未重复执行。

本地证据位于 Git 忽略目录 `test-results/webmcp-2026-09-07/`：`codex-session/failure.json`、`codex-session/failure.png`、各次尝试证据、类型检查/ESLint/新增测试日志。恢复 `http://localhost:3001` 登录态后，复制新的认证 profile，按上面的跳过预览命令继续五类 stage/取消回归即可。


## 2026-09-09：登录网络错误的根因与修复

用户截图明确显示线上 API 的 CORS 策略未允许 localhost:3001，部署信息 GET 和登录 OPTIONS 预检均被浏览器阻止。因此此前的“登录过期”提示不能单独证明凭证已失效。

开发配置现通过 `http://localhost:3001/dev-api` 调用 Vite 代理，目标由 `VITE_APP_API_PROXY_TARGET=https://api.bujiaban.com` 指定。代理去除 `/dev-api` 前缀并保留 TLS 校验；没有修改线上 CORS 或关闭浏览器安全策略。API base 使用绝对本地地址，供 3002 编辑器 iframe 复用。生产构建继续使用既有 `/api`。

Playwright 在真实浏览器网络环境验证：部署信息返回 HTTP 200 JSON，空登录参数返回预期 HTTP 400 JSON，CORS 错误数为 0。没有使用用户密码或发起成功登录，也未操作场景数据。证据：`test-results/webmcp-2026-09-09/login-proxy.json`。用户当前登录框已重新打开，等待登录后继续原定场景验收。


## 2026-09-09：真实登录态场景验收通过

用户完成本地无痕登录后，在原标签页复用会话进行验收，没有读取或导出密码、token、浏览器 profile。使用受支持的标签页 CDP 执行工具，与 Playwright 按钮点击配合；此轮没有重新启动 profile 版脚本。

- 场景 2220：中国空间站（开发教程）。18/18 工具注册，ready=true、loading=false。
- 读取实例、检查、校验、实体搜索通过，搜索结果 1 项，校验无错误/警告。
- 放置、变换、属性、删除、发布全部返回 staged，分别显示可见确认框后点击“否”或“取消”，5/5 返回 cancelled。
- 前后 dirty=false，实例数量 1→1，完整实例列表相同，标题与变换未变，最终校验有效，published=false。
- 主页面 fetch/XHR 写入保护在全部操作期间生效，除精确会话刷新以外的写入尝试数 0。保存/发布回调均在主页面执行，没有提交线上变更。
- CDP 留存的 107 条网络请求无写请求，但其环形缓冲区标记 truncated=true，不能当作完整网络抓包。零变更依据同时包括全程主页面写入保护及前后状态比较；此轮证据强度与独立脚本的 context.route 全请求拦截不同。
- Unity 预览按约定跳过，保留此前 closed→loading→running→closed 结果。
- 完成后刷新标签页，验证临时 registry、报告变量及 fetch/XHR 保护已清除，保留用户登录态和场景页。

可机器读取的证据：`test-results/webmcp-2026-09-09/scene-live-report.json`；最终场景截图同时保留在本次对话工具输出中。本轮未改动业务实现或重复已通过单元测试；相关测试仍为此前已执行的 35/35，不计为重新运行。


## 2026-09-09：线上前端与 WebGL 插件可行性

使用用户现有线上无痕登录态，在 `https://d.xrugc.com` 验证场景 2220。线上页面版本 `2026.09.02-1708`，公共插件“WebGL 场景运行器”显示版本 `2026.08.15-0934`。

1. 线上场景编辑器正常加载空间站，显示 34,573 顶点、12,286 三角形。
2. 从“实用工具 → 公共插件 → WebGL 场景运行器”进入插件，读取“我的场景”并选择“中国空间站（开发教程） #2220”。
3. 点击运行，观察场景读取和 Unity 下载进度，首次资源约 205 MB。
4. Unity 实际渲染空间站、标签和按钮；连续截图可见模型朝向变化。
5. 点击停止后回到场景选择和运行按钮，Unity 内层 iframe 回到 about:blank。

核心线上预览链路通过。模型放大/分解按钮曾点击，但没有充分隔离自动旋转与按钮效果，交互功能不计为验收通过。Chrome 运行期间曾报告约 1.5 GB 内存，较弱设备仍需单独验证。

线上场景路由加载 `/js/scene.DAmIAeF-.js`；该 bundle 未包含 `modelContext`、`xrugc_`、`webmcp` 等本次工具实现标识。这与本地修改尚未部署的状态一致。结论：线上已有场景可通过现有 UI 与 WebGL 插件预览；本地新增 WebMCP 工具不能直接当作线上已具备的能力，仍需部署匹配的 web/editor 版本后另行验收。此次未执行部署。

本次扩展标签页连接超时，改用原生 Chrome UI；没有保存、删除或发布操作，没有完整网络抓包，不能宣称具备网络层全量零写证据。结构化报告：`test-results/webmcp-2026-09-09/online-preview-report.json`，加载进度、渲染结果和停止状态截图/界面记录保留在对话工具输出中。


## 2026-09-10：可靠性更新

新增三个只读检查工具，当前场景注册数为 21。发布确认前后重新读取实体资源，增加预览错误回传；实现、部署依赖和未验证边界见 [可靠性更新](webmcp-reliability.md)。历史 18/18 与之前线上验收记录保留为历史证据，不能视为本轮通过。
