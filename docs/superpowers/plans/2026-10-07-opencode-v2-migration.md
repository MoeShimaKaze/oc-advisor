# oc-advisor OpenCode V2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `oc-advisor` to a pure OpenCode V2 plugin, prove clean Git installation and non-polluting advisor execution, and publish version 0.2.0 to the authorized GitHub repository.

**Architecture:** Keep configuration, transcript extraction, prompt construction, model parsing, and rate limiting in pure/testable `src/` modules. Put OpenCode V2 effects in `.opencode/plugins/advisor.ts`, using `Plugin.define`, `ctx.tool.transform`, `ctx.command.transform`, `ctx.session.context`, and `ctx.generate.text`; remove all V1 entrypoints and side-file config. Build the V2 entry on Git install with `prepare`, and promote a single verified candidate SHA to `main` before creating the release.

**Tech Stack:** TypeScript strict mode, Bun, `@opencode/plugin@2.0.24`, OpenCode `2.0.24`, Bun test, TypeScript compiler, GitHub Git dependency.

**Spec:** `docs/superpowers/specs/2026-10-07-opencode-v2-migration-design.md`

## Global Constraints

- Support OpenCode V2 only; do not preserve V1 compatibility.
- Plugin ID is `oc-advisor`; V2 source entry is `.opencode/plugins/advisor.ts`.
- The only plugin configuration source is `ctx.options` from V2 `plugins[].options`; remove side-file readers.
- `ctx.generate.text` must not create sessions, invoke tools, or write advisor request/response into session history.
- Advisor errors/cancellation refund the reserved per-session call; success commits it; exhausting the limit must not generate.
- `@opencode/plugin` is exactly `2.0.24` and external to the bundled plugin output.
- Version is `0.2.0`; build `dist/plugin.js` during Git installation with `prepare`, but never commit `dist/`.
- Preserve `OPENCODE_V2_MIGRATION_RESEARCH.md` as local-only input; never stage or release it.
- No npm publish, V1 fallback, UI plugin, persistent/cross-instance quota, prompt redesign, database, or VAPD work.
- Publish only to `https://github.com/MoeShimaKaze/oc-advisor`; verify a clean Git install at a candidate SHA before promoting that same SHA to `main` and tagging `v0.2.0`.

## File Ownership Map

| Task | Files owned | Responsibility |
| --- | --- | --- |
| T01 | `src/config.ts`, `src/model_id.ts`, `src/prompt.ts`, `src/transcript.ts`, related `test/*.test.ts` | Pure V2 data/config/transcript/prompt contracts and tests |
| T02 | `.opencode/plugins/advisor.ts`, `.opencode/plugin/advisor.ts` (delete), `.opencode/command/advisor.md` (delete), `test/plugin.test.ts` | V2 OpenCode effects, tool and command registration, quota/error behavior |
| T03 | `package.json`, `bun.lock`, `opencode.json`, package/build tests if present | V2 dependency/build lifecycle/package metadata and project auto-discovery config |
| T04 | `AGENTS.md`, `README.md`, `ARCHITECTURE.md` | V2 project instructions and user/architecture documentation |
| T05 | no product-file ownership; isolated validation scripts/evidence only | Full gates, real OpenCode load/call, clean install, release/promotion |

Tasks T01 and T04 can run independently. T02 depends on T01. T03 depends on T02's entrypoint contract. T05 depends on T01–T04 and independent verification. No parallel tasks may edit overlapping files.

---

### Task 1: Pure V2 Configuration and Transcript Core (T01)

**Files:**
- Modify: `src/config.ts`
- Modify: `src/model_id.ts`
- Modify: `src/prompt.ts`
- Modify: `src/transcript.ts`
- Modify: the existing config/model/prompt/transcript tests under `test/`

**Interfaces:**
- Keep `parseAdvisorConfig(opts?: unknown): AdvisorConfig`; remove `parseAdvisorConfigJSON` and all side-file-only parsing.
- Keep `parseModelID(raw: string)` validation and change/extend its V2 result to `{ readonly providerID: string; readonly id: string }` for `ctx.generate.text`.
- Keep `buildAdvisorPrompt(input: AdvisorPromptInput)` as a pure calculation; add a deterministic single-prompt composition suitable for `ctx.generate.text({ model, prompt })`, preserving the existing system instruction and user sections without redesigning their content.
- Define V2 transcript input types matching `ctx.session.context`: `user`/`system`/`synthetic` messages contribute `message.text`; `assistant` contributes only text items in `message.content`; ignore tools/reasoning/shell/status/other message types.

- [ ] **Step 1: Add failing transcript tests** for user/system/synthetic text, multiple assistant text segments, ignored tool/reasoning/non-text/status content, empty input, and budget truncation retaining the tail.
- [ ] **Step 2: Run the targeted test** with `bun test test/transcript.test.ts`; verify it fails against the old `{ info, parts }` contract.
- [ ] **Step 3: Implement the V2 transcript data shape and pure extraction/truncation** in `src/transcript.ts`; retain immutable inputs and deterministic output.
- [ ] **Step 4: Add failing config/model/prompt tests** proving options-only parsing, current defaults (`opencode-go/kimi-k2.7-code`, 20, 20000), invalid-value fallback, V2 `{providerID,id}`, and the combined prompt content.
- [ ] **Step 5: Remove JSON side-file parsing and implement the V2 model/prompt output** in the owned `src/` modules without altering the advisor's strategic prompt intent.
- [ ] **Step 6: Run all owned unit tests** with `bun test test/config.test.ts test/model_id.test.ts test/prompt.test.ts test/transcript.test.ts`; expect PASS.

**Acceptance:** Pure unit tests enforce all transcript acceptance cases, option defaults, V2 model shape, and a combined prompt; no side-file reader remains in `src/`.

### Task 2: V2 Plugin Runtime and Effects (T02)

**Files:**
- Create: `.opencode/plugins/advisor.ts`
- Delete: `.opencode/plugin/advisor.ts`
- Delete: `.opencode/command/advisor.md`
- Create: `test/plugin.test.ts`

**Interfaces:**
- Default export `Plugin.define({ id: "oc-advisor", async setup(ctx) { ... } })` from `@opencode/plugin`.
- Parse only `ctx.options`; initialize one in-memory `RateLimiter` for the plugin instance.
- Register `ask_advisor` via `ctx.tool.transform` with JSON Schema input `question` required and `context` optional; handler returns `{ content, metadata? }`.
- Build the command `/advisor` via `ctx.command.transform`; executing it calls `ctx.session.prompt` to deliver effective config values and reload guidance using the transform command's `delivery`, and does not call the advisor model.
- Tool effect order: `tryAcquire(sessionID)` → `ctx.session.context({ sessionID })` → pure transcript/prompt calculations → `ctx.generate.text({ model: { providerID, id }, prompt })` → `commit`; catch any context/generation/cancellation error, `refund`, and return a concise non-sensitive error.

- [ ] **Step 1: Add plugin mock tests** for stable plugin ID, tool and command registration exactly once, options-based model choice, command delivery/config message, successful generation and commit, context failure and generation failure/cancellation refund, and exhausted quota making no context/generation call.
- [ ] **Step 2: Run `bun test test/plugin.test.ts`** and confirm expected failures expose missing V2 implementation.
- [ ] **Step 3: Implement the V2 entrypoint** with imports and types from the installed `@opencode/plugin@2.0.24` contract; isolate IO in tool/command handlers and delegate calculations to T01 pure functions.
- [ ] **Step 4: Ensure quota cleanup covers every post-reservation throw/cancellation** and never leaks raw provider errors, credentials, or authorization headers in tool output.
- [ ] **Step 5: Delete the V1 plugin and file-command definitions** so only the V2 plugin entrypoint registers the feature.
- [ ] **Step 6: Run `bun test test/plugin.test.ts` and `bun run typecheck`**; expect PASS with no V1 API imports.

**Acceptance:** Mock tests prove registration, command behavior, success commit, failure/cancellation refund, and rate-limit short-circuit; no V1 entrypoint or command file remains.

### Task 3: Package, Build, and Local Discovery (T03)

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `opencode.json`

**Interfaces:**
- Package exports/main/module continue to point to `./dist/plugin.js`.
- `build:plugin` bundles `.opencode/plugins/advisor.ts` for Bun and externalizes `@opencode/plugin`; `prepare` runs the build for Git installs.
- V2 runtime dependency is exactly `@opencode/plugin@2.0.24`; remove V1 `@opencode-ai/plugin`/`@opencode-ai/sdk` references.
- `opencode.json` retains only `$schema`, relying on `.opencode/plugins/` auto-discovery and preventing package duplication.

- [ ] **Step 1: Add/adjust package assertions** to check exact version, V2 dependency, no V1 dependency, prepare/build entry, exports, and externalization.
- [ ] **Step 2: Update metadata and build lifecycle**: set version `0.2.0`; point build input to the V2 entry; add `prepare`; remove obsolete V1 peer dependencies/scripts.
- [ ] **Step 3: Run `bun install`** to update `bun.lock` and verify the exact V2 package version is resolved.
- [ ] **Step 4: Replace the old `plugin` config with schema-only `opencode.json`** without changing unrelated config (there are no unrelated settings in the approved baseline).
- [ ] **Step 5: Run `bun run build`, inspect `dist/plugin.js` imports and exports, and run package assertions**; verify `@opencode/plugin` remains external and `dist/` remains gitignored.

**Acceptance:** package metadata has the `0.2.0` Git-install contract, lockfile resolves `@opencode/plugin@2.0.24`, output is valid at the declared entry, and project config contains no plugin package declaration.

### Task 4: V2 Instructions and Documentation (T04)

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:** Documentation must match the stable configuration contract and runtime interfaces from the spec; consumer snippets use a full GitHub Git spec and `plugins` object with `options`.

- [ ] **Step 1: Rewrite `AGENTS.md`** to preserve TypeScript strict and functional Actions/Calculations/Data principles and add V2-only plugin layout/config/test rules.
- [ ] **Step 2: Update README installation/configuration/use instructions** to V2, include `plugins[].options`, explain defaults and `/advisor`/`ask_advisor`, and remove V1/side-file installation guidance.
- [ ] **Step 3: Update ARCHITECTURE.md** for pure `src/` calculations, V2 entrypoint effects, context/transcript flow, generation behavior, and quota commit/refund behavior.
- [ ] **Step 4: Search the three files** for stale `plugin` field, `.opencode/plugin/`, `@opencode-ai/*`, `client.session.*`, temporary child sessions, side-file paths, and `{ title, output }`; remove stale migration instructions while accurately distinguishing historical context if retained.
- [ ] **Step 5: Check Markdown links/config snippets and diff**; ensure the private research report is neither copied into docs nor staged.

**Acceptance:** User and maintainer documentation describe only the supported V2 installation and behavior; project principles remain explicit; no documented feature contradicts the code/spec.

### Task 5: Independent Full Verification and GitHub Release (T05)

**Files:**
- No product-file modifications; keep temporary validation scripts and raw evidence outside tracked source/docs.
- Release metadata only via the authorized repository after all code gates pass.

**Interfaces:** Candidate source is a single full commit SHA on a temporary branch in `MoeShimaKaze/oc-advisor`; the same SHA is promoted to `main` only after clean-install and runtime acceptance.

- [ ] **Step 1: Run the repository gates**: `bun test`, `bun run typecheck`, and `bun run build`; record complete output and exit status.
- [ ] **Step 2: Inspect package content and project tree**: validate `dist/plugin.js` entry, V2 external dependency, no V1 source/config references in shipped files, no committed `dist/`, and no accidental staging of `OPENCODE_V2_MIGRATION_RESEARCH.md`.
- [ ] **Step 3: Launch OpenCode 2.0.24 with the repository plugin discovered locally**; confirm plugin ID `oc-advisor`, one `ask_advisor` registration, one `/advisor` registration, and no V1 export or bare npm package failure.
- [ ] **Step 4: Perform one authorized real `ask_advisor` call** with a configured provider; capture before/after current-session history and prove the advisor request/response did not enter the session. User accepted possible model usage charges.
- [ ] **Step 5: After independent verification passes, push the candidate branch** to `https://github.com/MoeShimaKaze/oc-advisor`; install from a clean directory using `github:MoeShimaKaze/oc-advisor#<full-candidate-SHA>` and repeat build/load/real-call acceptance.
- [ ] **Step 6: Promote that exact candidate SHA to target `main`**, create GitHub Release `v0.2.0` for that SHA, then remove the temporary candidate branch only after release verification.
- [ ] **Step 7: Record final SHA, test evidence, release URL, and remaining risks** in the project task results/progress; do not claim success for any gate without process success and complete evidence.

**Acceptance:** All unit/build/type checks pass; OpenCode V2.0.24 loads and runs the plugin once; an end-to-end call succeeds without current-session history pollution; clean Git dependency installation succeeds from candidate SHA; the same SHA is on `main` and tagged by Release `v0.2.0`.

## DAG and Verification Order

```text
T01 Pure core ──> T02 V2 plugin ──> T03 package/config ──┐
                                                        ├──> T05 full verification/release
T04 docs/instructions ──────────────────────────────────┘
```

T01 and T04 are independent. T02 starts only after T01 is completed. T03 starts only after the T02 entrypoint path and imports are finalized. T05 starts only after T01–T04 pass their task-level acceptance; release actions remain gated on independent verification and clean Git installation.

## Spec Coverage Self-Review

- V2 runtime and API shape, stable plugin ID, tool result/schema, command registration, context extraction, generation, prompt composition, and quota semantics: T01–T02.
- Options-only configuration, side-file removal, schema-only repository config, package `prepare`, V2 dependency, output entry, version 0.2.0: T01–T03.
- AGENTS/README/ARCHITECTURE updates and research-file exclusion: T04–T05.
- Unit coverage, typecheck/build gates, actual OpenCode 2.0.24 load, real call/non-pollution, clean Git install, candidate-SHA promotion and Release: T01–T05.
- Explicit exclusions (V1 compatibility, npm publish, UI, persistent quota, prompt redesign, database/VAPD): Global Constraints.
