# T04 — V2 Instructions and Documentation

- **Type / status:** Documentation / ⏳ Pending
- **Direct dependencies:** None
- **Downstream:** T05
- **Spec:** Sections 2, 4, 6–9
- **Business goal:** Make maintainer and user instructions truthful for the sole supported V2 behavior.
- **Current behavior:** `AGENTS.md` only states TypeScript/functional principles; README and ARCHITECTURE contain V1 config, paths, APIs, side-file, and child-session behavior.
- **Target behavior:** Preserve repo principles; document V2-only setup, Git install/options config, plugin ID, tool/command, context/generate flow, quota behavior, test/build commands, and non-compatibility.
- **Allowed files:** `AGENTS.md`, `README.md`, `ARCHITECTURE.md`.
- **Forbidden:** Code/tests/package/lock/config files, research input, Task/progress/spec files.
- **Inputs:** Approved spec and plan; `AGENTS.md` rules; design contract (maintain consistency if parallel implementation exposes a spec ambiguity—report it rather than decide).
- **Validation:** Search owned docs for stale V1 API/config/path/side-file claims; inspect all Git installation and configuration examples for `plugins[].options` and full target Git spec.
- **Acceptance:** Docs agree with approved V2 contract, retain project Actions/Calculations/Data rules, and make no unsupported claim.
- **Return format:** Documentation receipt listing exact files, stale-reference scan terms/results, link/snippet checks, deviations.
- **Docs/Memory/VAPD:** This Task owns only the three named project docs; no Memory/VAPD operations.
