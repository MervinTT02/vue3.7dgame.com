# WebMCP 可靠性更新

日期：2026-09-10。此文描述本地工作树的新增能力，尚未部署上线。

## 新增工具

场景页面在支持的 registry 中注册 21 个工具，新增以下三个只读工具，参数均为 `{}`：

| 工具 | 结果与边界 |
| --- | --- |
| `xrugc_check_scene_resource_readiness` | 重新 GET 引用实体及其资源，报告缺失数据、资源清单、引用、文件信息、同节点互斥交互组件；返回元数据检查结果及未知项 |
| `xrugc_check_scene_publication_readiness` | 资源检查加已有场景结构校验，包含未保存、加载、权限、场景版本与检查期间变更 |
| `xrugc_get_scene_runtime_diagnostics` | 当前页面 Unity 预览阶段、运行确认、脱敏错误码和下一步建议 |

资源检查按实体 ID 去重，最多读取 100 个实体；超过上限不会报告成功。不会下载资源、初始化模型、修改实体或自动修复。API 不提供统一初始化状态，因此返回 `initialization: unknown`，资源网络可访问性与 Unity 兼容性亦不冒充已验证。缺少资源清单时不会把它视为有效的空清单。

`metadataReady` 只表示检查到的元数据没有阻塞项。`publicationReady` 还要求已有场景结构校验通过，并不证明运行器、脚本行为、动画名称或设备兼容性通过。

## 发布集成

WebMCP 发布暂存之前和用户确认之后都重新检查资源。任一已知阻塞项阻止进入发布请求。检查完成后再次比对待发布场景 ID 与版本，防止异步读取期间切换场景或修改草稿。

原有确认、权限、未保存状态、草稿有效期、防重放和版本保护仍保留。此次未修改手工发布路径，也未实现服务端跨资源事务锁；其他客户端在最后检查后修改实体仍可能产生竞争。

## 运行错误

本地 `plugins/webgl-preview/public/embed.html` 回传 `UNITY_LOAD_FAILED` 或 `SCENE_FORWARD_FAILED`。前端桥接校验当前 iframe 来源与 origin，忽略关闭预览后的消息；异步准备场景失败返回 `SCENE_PAYLOAD_FAILED`。返回结果只包含允许的错误码和阶段，不回传消息正文、token 或资源签名 URL。

需要同时交付匹配的 web 与 WebGL 预览桥接 HTML；此修改不重建 Unity 二进制，也不会让线上旧插件自动具备诊断能力。未接入的在线运行器 `WGP-ASSET-DENIED` 内部拒绝详情仍需运行器日志定位。

## 验收

定向测试覆盖资源缺失、资源清单缺失、损坏实体数据、文件缺失、重复实体去重、异步版本变化、未保存状态、API 异常脱敏，以及预览消息来源校验和异步错误捕获。运行命令：

```bash
pnpm run test:run test/unit/services/webmcp test/unit/composables/useUnityPreviewBridge.spec.ts test/unit/utils/unityPreviewPayload.spec.ts test/unit/utils/unityPreviewLocalRequests.spec.ts
pnpm run type-check
```

既有 `scripts/webmcp-scene-e2e.mjs` 已更新注册数和新增三个工具的读取验收。该脚本依然阻止真实写入，五类写操作仅暂存后取消；不能拿它证明真实发布成功。

本轮实际尝试在现有浏览器 profile 的隔离副本运行脚本，但被重定向到登录页。证据保存在忽略目录 `test-results/webmcp-reliability-2026-09-10/failure.json` 和截图；未发生场景写入。恢复可控浏览器登录态后，先进行新工具只读验收，再使用独立测试场景完成真实保存、发布、重读及目标运行端验证。

## 尚未覆盖

- 上传处理队列的服务端状态与初始化接口：当前接口没有统一状态合同。
- 完整脚本/动画语义校验和真实交互执行。已检查同节点 Action/Moved/Trigger 互斥；脚本仅报告 Blockly/JS/Lua 元数据是否存在。
- 线上运行器的完整资源拒绝链路、头显验证。
- 服务端发布幂等键、跨实体版本锁、失败恢复。

这些边界在工具返回和交付说明中明确保留，不以元数据检查替代。


## 本轮最终结果

- 单元回归：28 个文件、120/120 测试通过；TypeScript、修改文件 ESLint、脚本语法与 diff 空白检查通过。
- 用户重新登录后，通过 Playwright 操作独立标签页，使用仅限本地页面的 WebMCP registry shim 验证注册/调用合同；不视为原生 WebMCP transport 已验收。
- 已有发动机场景只读验收：1 个实体、6 个资源，元数据检查通过。
- 新建独立场景 **2323：WebMCP可靠性验收 20260910-1715**，放置既有实体但未修改实体；保存后重新加载，实例和资源引用仍正确。
- 空场景检查返回阻塞；模拟浏览器响应中的模型文件缺失时，发布暂存被阻止，新增写请求为 0。故障只在测试标签页响应中注入，未修改服务器资源。
- 测试场景发布接口两次返回同一快照 **1076**（验证修正后的返回合同），没有创建第二个测试场景。受保护阶段仅放行场景 2323 的 PUT 和 take-photo POST，以及必要认证刷新；未对既有场景/实体写入。
- 本地桥接故障注入：拦截 Unity loader，实际返回 `attention / UNITY_LOAD_FAILED / runtime_load`；关闭后恢复 closed。当前 Vite 默认预览指向线上旧桥接，验收时通过标签页临时 GET 代理读取本地桥接，已撤销。新错误回传需部署匹配桥接后才在线上生效。
- 临时路由、故障注入及预览已清理。测试场景保留供复查。

### 发布状态修正与后端边界

真实接口没有返回 `verseRelease`，即使显式 expand 也没有；因此读取工具现在以 `published: null` 表示未知，不再误报 false。发布回调要求有效快照 ID，返回 `verification: server_acknowledged` 与 `readBackVerified: false`，明确区别服务器确认和独立重读。

本环境快照读取请求返回 404；尚不能确认已发布快照的独立重读或运行。创建快照响应不能替代此验证，也不能证明线上 WebGL 或头显通过。初始化统一状态及可靠的快照查询接口需要后端配套，未在本轮修改后端。

### 证据目录

`test-results/webmcp-reliability-2026-09-10/`（Git 忽略）：

- `live-read-tools.json`：真实场景只读结果。
- `live-publication.json`、`final-publication.json`：测试场景发布及状态修正结果。
- `publication-blocked-fault.json`：缺失文件阻止发布，0 新增写请求。
- `local-bridge-fault-passed.json`、`loader-fault.png`：本地桥接故障注入。
- `failure.json`、`live-loader-fault.json`：初次登录态缺失及旧桥接未产生新错误码的失败记录，保留而不计为通过。
