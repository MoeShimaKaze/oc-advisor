# T03 — Package, Build, and Local Discovery

- **Type / status:** Implementation / ⏳ Pending
- **Direct dependencies:** T02 must be ✅ Completed and independently verified.
- **Downstream:** T05
- **Spec:** Sections 4.1, 4.3, 4.8–4.9, 6
- **Business goal:** Ensure V2 users can install from Git and get the declared built plugin entry, while repository development uses local auto-discovery exactly once.
- **Current behavior:** package v0.1.0 builds from V1 entry, lacks `prepare`, externalizes V1 packages, declares V1 peer dependencies; `opencode.json` has broken bare npm package config.
- **Target behavior:** Version 0.2.0; `@opencode/plugin@2.0.24`; build V2 entry to `dist/plugin.js`; externalize V2 runtime; `prepare` builds Git installs; schema-only project config.
- **Allowed files:** `package.json`, `bun.lock`, `opencode.json`, narrowly scoped package assertions if required by existing test structure.
- **Forbidden:** `.opencode/**`, `src/**`, docs, research input, Task/progress/spec files, committing `dist/`.
- **Inputs:** Verified T02 entrypoint path/imports, approved spec, plan, `AGENTS.md`.
- **Validation:** `bun install`; `bun run build`; `bun run typecheck`; package metadata/build assertions; inspect bundle imports and `git status --short` for generated files.
- **Acceptance:** V2 package contract is consistent, lockfile selects exactly 2.0.24, exports resolve, Git `prepare` builds entry, `dist/` remains ignored, and opencode.json has only `$schema`.
- **Return format:** Implementation receipt with package diff summary, lockfile resolved version, command outputs/status, bundle inspection, deviations.
- **Docs/Memory/VAPD:** No docs edits here; notify Coordinator of consumer config/package behavior. No Memory/VAPD writes.
