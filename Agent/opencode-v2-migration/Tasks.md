# Tasks — OpenCode V2 Migration

## Task Overview

| ID | Title | Type | Direct dependencies | Status | Responsible Agent | File ownership | Task |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Pure V2 configuration and transcript core | Implementation | — | ✅ Completed | Coordinator (takeover) | `src/config.ts`, `src/model_id.ts`, `src/prompt.ts`, `src/transcript.ts`, `src/index.ts`, matching core tests | [T01](tasks/T01-pure-v2-core.md) |
| T02 | V2 plugin runtime and effects | Implementation | T01 | 🟡 Ready | task-executor | `.opencode/plugins/advisor.ts`, delete old plugin/command, `test/plugin.test.ts` | [T02](tasks/T02-v2-plugin-runtime.md) |
| T03 | Package, build, and local discovery | Implementation | T02 | ⏳ Pending | Unassigned | `package.json`, `bun.lock`, `opencode.json`, package assertions | [T03](tasks/T03-package-build.md) |
| T04 | V2 instructions and documentation | Documentation | — | ⏳ Pending | Unassigned | `AGENTS.md`, `README.md`, `ARCHITECTURE.md` | [T04](tasks/T04-v2-docs.md) |
| T05 | Independent verification and GitHub release | Verification/Release | T01, T02, T03, T04 | ⏳ Pending | Coordinator + Verifier | No product files; isolated evidence, authorized target repository release operations | [T05](tasks/T05-verification-release.md) |

## Status Legend

- ⏳ Pending
- 🟡 Ready
- 🔄 In Progress
- ✅ Completed
- ⛔ Blocked
- ❌ Cancelled

## DAG

```text
T01 ──> T02 ──> T03 ──┐
                      ├──> T05
T04 ──────────────────┘
```

## Initial Parallel Groups

- Group A: T01 and T04 may run concurrently; file ownership does not overlap.
- Group B: T02 starts after T01 only.
- Group C: T03 starts after T02 only.
- Final gate: T05 starts after T01–T04 are completed. Group labels are scheduling hints, not barriers for independent ready work.

## Contract

- Approved spec: `docs/superpowers/specs/2026-10-07-opencode-v2-migration-design.md` (final).
- Plan: `docs/superpowers/plans/2026-10-07-opencode-v2-migration.md`.
- API contract version: V2-only, baseline OpenCode and `@opencode/plugin` 2.0.24; see Spec sections 4–6.
- `ctx.options` is the sole configuration source. Plugin ID `oc-advisor`; tool `ask_advisor`; command `/advisor`; result `{ content, metadata? }`.

## Dispatch and Reading Rules

- Coordinator alone changes statuses, dependencies, and progress.
- Before dispatch, mark a task Ready only if its direct dependencies are Completed and no active task owns overlapping files.
- Executors receive their task file, `AGENTS.md`, spec, plan, exact allowed paths, forbidden paths, upstream contract, commands, and receipt format.
- Executors do not modify `Tasks.md`, `Progress.md`, this dependency graph, docs/spec, Memory, VAPD, or release remotes.
- A self-reported completion is only a candidate; independent verification is required before coordinator marks Completed.
- Never stage or commit `OPENCODE_V2_MIGRATION_RESEARCH.md` or generated `dist/`.
