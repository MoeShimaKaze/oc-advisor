# OpenCode V2 API Contract

Version: V2-only / OpenCode 2.0.24 / `@opencode/plugin` 2.0.24

## Pure interfaces

- `parseAdvisorConfig(opts?: unknown): AdvisorConfig`
- `parseModelID(raw: string): { readonly providerID: string; readonly id: string }`
- `buildAdvisorPrompt(input: AdvisorPromptInput): string`
- Transcript extraction accepts the V2 `ctx.session.context` message array and returns tail-truncated visible dialogue text.

## Plugin interfaces

- Default export: `Plugin.define({ id: "oc-advisor", async setup(ctx) { ... } })`
- Configuration source: `ctx.options` only.
- Tool: `ask_advisor`, registered once through `ctx.tool.transform`.
- Tool input JSON Schema: required string `question`, optional string `context`.
- Tool output: `{ content: string, metadata?: object }`.
- Command: `/advisor`, registered once through `ctx.command.transform`; its handler forwards the invocation `delivery` to `ctx.session.prompt` and reports effective configuration without calling the advisor model.
- Generation: `ctx.generate.text({ model: { providerID, id }, prompt })`.
- Quota: reserve before context/generation, commit on success, refund on every post-reservation error or cancellation; exhaustion does not call context or generation.

## Packaging interfaces

- Source entry: `.opencode/plugins/advisor.ts`.
- Package entry: `dist/plugin.js`, built by `prepare`; `dist/` remains untracked.
- Repository `opencode.json` contains only `$schema` and relies on local plugin discovery.
