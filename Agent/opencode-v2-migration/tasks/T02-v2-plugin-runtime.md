# T02 — V2 Plugin Runtime and Effects

- **Type / status:** Implementation / ⏳ Pending
- **Direct dependencies:** T01 must be ✅ Completed and independently verified.
- **Downstream:** T03, T05
- **Spec:** Sections 4.1–4.7, 5, 6
- **Business goal:** Implement the only OpenCode V2 plugin entry, preserving the advisor tool and `/advisor` command without creating advisor sessions or polluting history.
- **Current behavior:** V1 default export, returned tool map, child-session create/prompt/delete, side-file support, and file-based command.
- **Target behavior:** `Plugin.define` ID `oc-advisor`; options from `ctx.options`; `ctx.tool.transform` tool and `ctx.command.transform` command; context via `ctx.session.context`; generation via `ctx.generate.text`; reserved quota commits on success and refunds on all post-reservation errors/cancel.
- **Allowed files:** `.opencode/plugins/advisor.ts` (create), `.opencode/plugin/advisor.ts` (delete), `.opencode/command/advisor.md` (delete), `test/plugin.test.ts` (create).
- **Forbidden:** `src/**`, `package.json`, `bun.lock`, `opencode.json`, docs, research input, Task/progress/spec files.
- **Inputs:** T01 verified pure function signatures, approved spec, plan, `AGENTS.md`, `@opencode/plugin@2.0.24` types/docs.
- **Output contract:** `ask_advisor` JSON input has required `question` and optional `context`; tool result is `{content, metadata?}`. `/advisor` posts current effective config values plus reload instructions via command delivery and never calls the advisor model.
- **Validation:** `bun test test/plugin.test.ts`; `bun run typecheck`.
- **Acceptance:** Tests prove single registration, chosen model, command output, successful commit, context/generation/cancellation refund, exhausted quota short-circuit, concise sanitized errors, and absence of old V1 entry/command.
- **Return format:** Implementation receipt with changed/deleted paths, test commands/exit status, exact API types used, deviations, unresolved issues.
- **Docs/Memory/VAPD:** No direct edits; report changes impacting docs. No Memory/VAPD writes.
