# oc-advisor OpenCode V2 迁移设计方案

> 更新时间：2026-10-07
> 状态：**已定版**（里程碑 #2 设计定版，2026-10-07；范围锁定为里程碑 #1，2026-10-07）
> 归档：由 lifecycle-recorder（任务 DOC01，project-delivery-coordinator 派发）归档
> 目标版本：0.2.0
> 事实来源：用户已确认的范围、配置契约、架构、测试与发布流程；OpenCode V2 官方文档（见第 11 节）；本地调研报告 `OPENCODE_V2_MIGRATION_RESEARCH.md`（仅作输入，**不提交**）

本文档归档已批准的迁移设计。文中所有"目标行为"均为**计划中、未实现**状态（第一次开发 Commit 尚未发生）；"当前行为"均已对照仓库现有代码核实。除用户已确认的决定外，本文不引入任何新决定。

---

## 1. 背景与问题

当前插件以 OpenCode V1 API 实现，在 OpenCode 2.0.24 下无法加载。已核实的问题：

1. `opencode.json` 中 `"plugin": ["oc-advisor"]` 的裸包名会被当作 npm 包解析，公共 npm 不存在该包，加载 404。
2. 插件入口 `.opencode/plugin/advisor.ts` 使用 V1 插件 API（默认导出插件函数），V2 明确拒绝执行该入口形态。
3. 包入口指向 `./dist/plugin.js`，但仓库不含 `dist/`，且只有 `prepublishOnly` 钩子，没有面向 Git 安装的 `prepare` 生命周期，GitHub 安装无可用入口。

结论：直接发布纯 V2 版本（不做 V1 兼容），用 V2 原生推理接口替代临时子会话。

## 2. 范围

### 2.1 已确认范围（定版决定）

1. 插件仅支持 OpenCode V2，不兼容 V1；目标运行时和依赖基线 **2.0.24**。
2. 配置仅支持 V2 `plugins[].options` / `ctx.options`，移除 `.opencode/oc-advisor.json` side-file。
3. V2 入口为 `.opencode/plugins/advisor.ts`，`Plugin.define` 稳定 ID 为 `oc-advisor`。
4. `ctx.tool.transform` 注册 `ask_advisor`；`ctx.session.context` 读取转录；`ctx.generate.text` 推理，不创建会话、不污染历史；失败/取消退款。
5. `ctx.command.transform` 程序化注册 `/advisor`；删除文件式旧命令。
6. `opencode.json` 仅保留 schema，本地自动发现插件，防重复加载。
7. Git 安装时通过 `prepare` 构建 `dist/plugin.js`，不提交 `dist`；`@opencode/plugin` 2.0.24 为 V2 依赖并 externalize。
8. TDD：V2 转录、插件 mock 成功/失败/取消/额度、命令与配置；门禁 `bun test`/`typecheck`/`build`、包检查、OpenCode 2.0.24 实际加载与真实调用、会话不污染。
9. 文档：初始化/扩充 `AGENTS.md`，同步 `README`、`ARCHITECTURE`、包元数据和 lockfile；调研报告不提交。
10. 发布：版本 0.2.0；推送候选分支，从 `github:MoeShimaKaze/oc-advisor#<SHA>` 干净安装验证；同 SHA 发布 main；创建 v0.2.0 GitHub Release；清理候选分支。
11. 目标仓库 `https://github.com/MoeShimaKaze/oc-advisor`；当前 origin 仍是 `yuk1ty/oc-advisor`，后续由 Coordinator 调整远端。

### 2.2 明确不包含

- V1 兼容
- npm 发布
- UI 插件
- 持久化 / 跨实例额度
- advisor prompt 大改
- 数据库 / VAPD

## 3. 当前行为基线（V1，已核实）

以下为仓库现状（2026-10-07，基线 `yuk1ty/oc-advisor` main `3d2d368`）：

| 领域 | 当前行为 |
| --- | --- |
| 插件入口 | `.opencode/plugin/advisor.ts`：导入 `@opencode-ai/plugin`、`@opencode-ai/sdk`，默认导出异步插件函数 `({ client, directory }, options)`，返回 `{ tool: { ask_advisor } }` |
| 工具 | `ask_advisor`，入参 `question`（必填）、`context`（可选），返回 `{ title, output }` |
| 推理 | `client.session.create`（parentID 子会话）→ `client.session.prompt` → `client.session.delete` 临时子会话模式 |
| 转录 | `client.session.messages()` 读取 V1 `{ info, parts }` 结构 |
| 配置 | 优先插件第二个 options 参数，否则读取 side-file `.opencode/oc-advisor.json` 与 `~/.config/opencode/oc-advisor.json` |
| 配置项 | `advisorModel`（默认 `opencode-go/kimi-k2.7-code`）、`maxCallsPerSession`（默认 20）、`transcriptCharBudget`（默认 20000） |
| 项目配置 | `opencode.json` 使用 `"plugin": ["oc-advisor"]`（裸包名） |
| 命令 | 文件式命令 `.opencode/command/advisor.md` |
| 额度 | `RateLimiter`（`src/rate_limiter.ts`）两阶段提交：`tryAcquire` → `commit` / `refund`，失败时退款 |
| 包 | `package.json` 0.1.0；`main`/`exports` 指向 `./dist/plugin.js`；仓库无 `dist/`；仅 `prepublishOnly`；peerDependencies 为 `@opencode-ai/*` |
| 远端 | origin 为 `yuk1ty/oc-advisor` |

**当前未实现（均属目标行为，见第 4 节）：** V2 入口、`Plugin.define`、`ctx.*` 扩展点、`plugins[].options` 配置、`ctx.command.transform` 命令注册、`prepare` 构建生命周期。这些均处于"计划中、未实现"状态。

## 4. 目标设计（V2，定版）

> 本节全部为**目标行为，未实现，计划中**；第一次开发提交形成后才到达里程碑 #3。

### 4.1 运行时与依赖基线

- 目标运行时：OpenCode **2.0.24**。
- 插件依赖：`@opencode/plugin` **2.0.24**（V2 依赖），构建时 externalize。
- 移除 `@opencode-ai/plugin`、`@opencode-ai/sdk` V1 依赖。
- 不做 V1 兼容：插件仅实现 V2 `setup()` 形态，不暴露 V1 `server()`。

### 4.2 插件入口与稳定 ID

```ts
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "oc-advisor",
  async setup(ctx) {
    // 解析配置、初始化 RateLimiter、注册工具与命令
  },
})
```

- 入口文件：`.opencode/plugins/advisor.ts`（V2 目录约定）。
- 稳定 ID：`oc-advisor`。
- 现有纯函数模块（`src/config.ts`、`src/model_id.ts`、`src/prompt.ts`、`src/rate_limiter.ts`、`src/transcript.ts`）保持 Actions/Calculations/Data 分层，按 V2 类型调整导出后复用。

### 4.3 配置契约

- **唯一配置来源**：V2 `plugins[].options`，插件内通过 `ctx.options` 读取。
- **移除 side-file**：删除 `.opencode/oc-advisor.json` 与 `~/.config/opencode/oc-advisor.json` 的读取逻辑。
- 配置项名称与语义保持不变：`advisorModel`、`maxCallsPerSession`、`transcriptCharBudget`（沿用 `parseAdvisorConfig` 校验与默认值）。

消费方（对象形式）示例：

```jsonc
{
  "plugins": [
    {
      "package": "github:MoeShimaKaze/oc-advisor#<commit>",
      "options": {
        "advisorModel": "provider/model",
        "maxCallsPerSession": 20,
        "transcriptCharBudget": 20000
      }
    }
  ]
}
```

- 插件仓库自身的 `opencode.json` **仅保留 `$schema`**（移除现有 `"plugin"` 字段），依靠 `.opencode/plugins/` 本地自动发现加载开发源码，避免本地源码与远端包重复加载同一插件 ID。

### 4.4 工具注册：`ask_advisor`

- 通过 `ctx.tool.transform` 在 `setup` 中注册 `ask_advisor`。
- 入参保持 `question`（必填）、`context`（可选），使用 JSON Schema 声明。
- 返回结构由 V1 `{ title, output }` 调整为 V2 `{ content, metadata? }`：模型可见建议文本放 `content`；模型名、剩余额度等辅助信息放 `metadata`。
- 错误返回保持简洁，不回显认证头、凭据或完整底层请求。

### 4.5 会话转录

- 通过 `ctx.session.context({ sessionID })` 读取 V2 转录（扁平消息结构，不再使用 V1 `{ info, parts }`）。
- 提取规则：`user`/`system`/`synthetic` 取 `message.text`；`assistant` 取 `message.content` 中 `type: "text"` 项；工具、reasoning、shell、状态等非对话消息跳过。
- 仅向 advisor 暴露用户与助手可见文本；字符预算（`transcriptCharBudget`）在提取后截取最近内容。

### 4.6 Advisor 推理与额度

- 使用 `ctx.generate.text({ model: { providerID, id }, prompt })` 推理。官方语义（已核对 2.0.24 文档）：不创建会话、不调用工具、不写入会话历史——替代 V1 临时子会话方案。
- 模型标识由 V1 `{ providerID, modelID }` 调整为 V2 `{ providerID, id }`。
- `ctx.generate.text` 仅接受单一 `prompt` 参数：现有 `src/prompt.ts` 产出的 system 与 user 提示合并为单个 prompt 构造，不做独立 system role。
- 额度流程沿用两阶段提交：`tryAcquire(sessionID)` 预占 → 读取上下文与调用模型（try 块）→ 成功 `commit(sessionID)`；任意异常或取消执行 `refund(sessionID)`。

### 4.7 `/advisor` 命令

- 通过 `ctx.command.transform` 在 `setup` 中程序化注册 `/advisor`。
- 命令执行时通过 `ctx.session.prompt` 向当前会话提交一段配置说明，内容由插件在注册时根据有效配置生成，并沿用命令调用的 `delivery`；它不调用 advisor 模型。
- 配置说明包含 `advisorModel`、`maxCallsPerSession`、`transcriptCharBudget` 当前值，以及修改 `plugins[].options` 后重新加载插件的指引。
- 删除文件式旧命令 `.opencode/command/advisor.md`。

### 4.8 构建、包与 Git 安装

- 新增 `prepare` 生命周期，Git 安装时构建 `dist/plugin.js`；`dist/` 不提交仓库。
- 构建输入更新为 V2 入口 `.opencode/plugins/advisor.ts`，externalize `@opencode/plugin`。
- 包版本升至 0.2.0；包元数据与 lockfile 随依赖变更同步更新。

### 4.9 版本与仓库

- 目标仓库：`https://github.com/MoeShimaKaze/oc-advisor`。
- 当前 origin 仍为 `yuk1ty/oc-advisor`，远端调整由 Coordinator 负责（不在本设计实施范围内重复操作）。
- 消费方安装一律使用明确 Git 规格 `github:MoeShimaKaze/oc-advisor#<commit>`，禁止裸包名 `oc-advisor`（会被当作 npm 包导致 404）。

## 5. API 对照（V1 → V2）

| 当前 V1 实现 | 目标 V2 实现 |
| --- | --- |
| `@opencode-ai/plugin` | `@opencode/plugin` |
| 默认导出插件函数 | `Plugin.define({ id, setup })` |
| `directory` 参数 | `ctx.location.directory` |
| 第二个 options 参数 | `ctx.options` |
| 返回 `tool` map | `ctx.tool.transform` 注册 |
| `tool.schema` | JSON Schema |
| `client.session.messages()` | `ctx.session.context({ sessionID })` |
| 临时子会话推理 | `ctx.generate.text()` |
| `{ providerID, modelID }` | `{ providerID, id }` |
| `{ title, output }` | `{ content, metadata? }` |
| `plugin` 配置字段 + side-file | `plugins[].options` / `ctx.options` |
| 文件式命令 `.opencode/command/advisor.md` | `ctx.command.transform` 程序化注册 |

## 6. 测试与验收门禁（TDD）

测试范围（先行编写）：

1. V2 转录：user/system/synthetic 文本、assistant 多文本片段、assistant 工具/reasoning 片段忽略、非对话消息忽略、空上下文、截断保留最近内容。
2. 插件上下文 mock：成功、模型失败、取消、额度耗尽与退款路径。
3. 命令：`/advisor` 程序化注册。
4. 配置：`ctx.options` 解析、默认值回退。

验收门禁：

- `bun test`、`bun run typecheck`、`bun run build` 全部通过。
- 包检查：依赖为 V2 API（`@opencode/plugin` 2.0.24）、构建产物入口有效。
- OpenCode 2.0.24 实际加载：插件列表显示稳定 ID `oc-advisor`，`ask_advisor` 只注册一次，无 V1 default export 报错、无 npm 裸包 404。
- 真实调用：配置 provider 后执行一次 `ask_advisor` 端到端验证，使用配置的 advisor 模型。
- 会话不污染：advisor 请求与响应不写入当前会话历史。

> 说明：本设计文档归档任务（DOC01）仅检查文档本身无未决事项与前后矛盾，不运行代码测试；代码门禁由后续开发任务执行。

## 7. 文档同步（随实施执行，未实现）

- 初始化/扩充 `AGENTS.md`。
- 同步 `README.md`、`ARCHITECTURE.md`：移除全部 V1 引用（`plugin` 字段、`.opencode/plugin/`、`@opencode-ai/*`、`client.session.*`、临时子会话、`{ title, output }`），改为 V2 配置与行为说明。
- 包元数据（`package.json`）与 lockfile 随依赖变更同步。
- 本地调研报告 `OPENCODE_V2_MIGRATION_RESEARCH.md` 仅作输入，**不提交**。

## 8. 发布流程（0.2.0，未执行）

1. 版本定为 0.2.0。
2. 推送候选分支。
3. 从 `github:MoeShimaKaze/oc-advisor#<SHA>` 在干净目录安装验证（真实加载与真实调用）。
4. 验证通过后，同一 SHA 发布至 main。
5. 创建 v0.2.0 GitHub Release。
6. 清理候选分支。

## 9. 实施状态对照

| 领域 | 当前行为 | 目标行为（本设计） | 状态 |
| --- | --- | --- | --- |
| 插件入口 | `.opencode/plugin/advisor.ts`（V1 函数） | `.opencode/plugins/advisor.ts`（`Plugin.define`，ID `oc-advisor`） | 未实现，计划中 |
| 工具注册 | 返回 `tool` map | `ctx.tool.transform` 注册 `ask_advisor` | 未实现，计划中 |
| 转录 | `client.session.messages()`（V1 结构） | `ctx.session.context({ sessionID })`（V2 结构） | 未实现，计划中 |
| 推理 | 临时子会话 create→prompt→delete | `ctx.generate.text()`，无会话、无历史污染 | 未实现，计划中 |
| 配置 | options 参数 + side-file | 仅 `plugins[].options` / `ctx.options` | 未实现，计划中 |
| 命令 | `.opencode/command/advisor.md` | `ctx.command.transform` 程序化 `/advisor` | 未实现，计划中 |
| 项目配置 | `"plugin": ["oc-advisor"]` | 仅保留 `$schema`，本地自动发现 | 未实现，计划中 |
| 构建/安装 | 仅 `prepublishOnly`，无 `dist/` | `prepare` 构建 `dist/plugin.js`，`dist` 不提交 | 未实现，计划中 |
| 依赖 | `@opencode-ai/*` peer | `@opencode/plugin` 2.0.24 依赖，externalize | 未实现，计划中 |
| 文档 | 引用 V1 概念（33+ 处） | V2 配置与行为 | 未实现，计划中 |
| 版本/仓库 | 0.1.0 / origin `yuk1ty/oc-advisor` | 0.2.0 / 目标仓库 `MoeShimaKaze/oc-advisor` | 未实现，计划中（远端由 Coordinator 调整） |

## 10. 里程碑记录

| 里程碑 | 日期 | 内容 | 记录位置 |
| --- | --- | --- | --- |
| #1 范围锁定 | 2026-10-07 | 用户确认 11 项范围与排除项（第 2 节） | 项目级 Memory + 本节 |
| #2 设计定版 | 2026-10-07 | 本文定版归档 | 项目级 Memory + 本节 |
| #3 第一次开发 Commit | — | 尚未发生，无记录 | — |
| #4 用户验收通过 | — | 尚未发生，无记录 | — |

里程碑 #3、#4 将在对应节点由 Coordinator 触发后增量追加，本文不预写。

## 11. 参考

- OpenCode V2 插件指南：<https://opencode.ai/v2/docs/build/plugins>
- OpenCode V1 插件迁移指南：<https://opencode.ai/v2/docs/build/plugins/migrate-v1>
- OpenCode V2 插件配置：<https://opencode.ai/v2/docs/plugins>
- OpenCode V2 指令文件指南：<https://opencode.ai/v2/docs/instructions>
- 本地调研报告：`OPENCODE_V2_MIGRATION_RESEARCH.md`（仅输入，不提交）
- 代码基线：`yuk1ty/oc-advisor` main `3d2d368b90f99533c53ef7fc9499ddd636fd8d79`（2026-10-07 核实）
