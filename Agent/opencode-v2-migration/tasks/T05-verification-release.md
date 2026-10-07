# T05 — Independent Verification and GitHub Release

- **Type / status:** Verification and release / ⏳ Pending
- **Direct dependencies:** T01, T02, T03, and T04 all ✅ Completed and Task-level verified.
- **Downstream:** None
- **Spec:** Sections 6–10
- **Business goal:** Independently establish the development baseline, validate actual OpenCode V2 runtime behavior and clean Git installation, then publish the exact verified SHA.
- **Current behavior:** No V2 verification or target-repository release has occurred. `origin` currently points to the upstream `yuk1ty/oc-advisor`; design commit `f065f93` is on local main; research report is local-only.
- **Target behavior:** Full tests/build/typecheck pass; OpenCode 2.0.24 loads and runs the plugin once; advisor call does not affect session history; candidate Git install works; same SHA promoted to authorized target main and released as `v0.2.0`.
- **Allowed:** Read-only project inspection, temporary scripts/evidence in approved independent run directory, and authorized remote writes only to `https://github.com/MoeShimaKaze/oc-advisor` after verifying remote identity/auth and gate results. Coordinator owns branch/remote/tag operations.
- **Forbidden:** Product code/doc edits under this verification Task; force push, destructive Git commands, npm publish, publishing research input or `dist/`; any write to a repository other than the user-authorized target.
- **Inputs:** Completed T01–T04 receipts, approved spec/plan, `AGENTS.md`, local profile; confirm branch/worktree ownership and GitHub target identity before writes.
- **Validation:** `bun test`; `bun run typecheck`; `bun run build`; package contents; OpenCode 2.0.24 local load, registrations, one real configured call and before/after session history; clean install from `github:MoeShimaKaze/oc-advisor#<full-SHA>`; same SHA on target `main`; Release `v0.2.0`.
- **Acceptance:** All commands exit successfully with full evidence; real call succeeds and does not pollute current session; same candidate SHA is on main and tagged/released; temporary branch cleanup only after confirmation. If any gate fails, mark Blocked and do not publish/promote.
- **Return format:** Independent verifier report plus release receipt: run/attempt IDs where applicable, command exit statuses/assertions, candidate/full SHA, target URL, release URL, cleanup status, unverified risks.
- **Docs/Memory/VAPD:** Coordinator invokes lifecycle-recorder after development baseline (#3) and user acceptance (#4); do not self-record milestone or write Memory/VAPD.
