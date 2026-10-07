# T01 — Pure V2 Configuration and Transcript Core

- **Type / status:** Implementation / ⏳ Pending
- **Direct dependencies:** None
- **Downstream:** T02
- **Spec:** Sections 4.3, 4.5, 4.6, 5, 6
- **Business goal:** Make configuration, model IDs, prompt composition, and transcript extraction match V2 using deterministic pure functions.
- **Current behavior:** `src/config.ts` has JSON side-file parsing; model output uses `modelID`; transcript expects V1 `{info, parts}`; prompt builder returns separate system/user strings.
- **Target behavior:** Options-only parser; V2 model `{providerID,id}`; V2 context message extraction; one composed prompt preserving existing prompt content.
- **Allowed files:** `src/config.ts`, `src/model_id.ts`, `src/prompt.ts`, `src/transcript.ts`, matching existing unit tests in `test/`.
- **Forbidden:** `.opencode/**`, package metadata/lockfile, docs, unrelated tests, task/progress/spec files, side-file additions, prompt redesign.
- **Inputs:** Approved V2 spec and plan; `AGENTS.md`; installed baseline Bun/TypeScript.
- **Outputs:** Updated pure modules and focused TDD tests; no OpenCode effects in `src/`.
- **Validation:** `bun test test/config.test.ts test/model_id.test.ts test/prompt.test.ts test/transcript.test.ts`; include failing-before/passing-after evidence.
- **Acceptance:** All spec transcript cases, config defaults/fallbacks, V2 model fields, combined prompt, and no JSON side-file parser.
- **Return format:** Implementation receipt listing files, tests/exit status, behavior, deviations, and remaining issues. Do not edit global state files.
- **Docs/Memory/VAPD:** No direct edits; notify Coordinator of required doc implications, if any.
