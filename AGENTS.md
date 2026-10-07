# Project Rules

## Language and Style

- Use TypeScript's strict mode.
- Follow functional programming style.
  - Prefer to make data immutable.
  - Specify three components: Actions, Calculation, Data (This principle is written in the book "Grokking Simplicity"). Specifically, carefully isolate Actions.
    - Actions: Depend on how many times or when it is run. Also called functions with side-effects, side-effecting functions, impure functions. Examples: Send an email, read from a database, including I/O operations.
    - Calculations: Computations from input to output. Also called pure functions, mathematical functions. Examples: Find the maximum number, check if an email address is valid.
    - Data: Facts about events. Examples: The email address a user gave us, the dollar amount read from a bank's API.

## OpenCode V2 Plugin Rules

- This plugin supports **OpenCode V2 only** (baseline runtime OpenCode `2.0.24`, dependency `@opencode/plugin` exactly `2.0.24`). There is **no V1 compatibility**: do not add default-export plugin functions, `@opencode-ai/*` imports, `.opencode/plugin/` entrypoints, file-based commands under `.opencode/command/`, side-file config readers, or `{ title, output }` tool results.
- The sole plugin entrypoint is `.opencode/plugins/advisor.ts`, defined via `Plugin.define` with the stable ID `oc-advisor`. All OpenCode effects (Actions) live there.
- The only configuration source is V2 `plugins[].options`, read inside the plugin as `ctx.options`. Never read side files (`.opencode/oc-advisor.json`, `~/.config/opencode/oc-advisor.json`) or other external config.
- Keep all pure logic in `src/` as Calculations: `src/config.ts`, `src/model_id.ts`, `src/prompt.ts`, `src/rate_limiter.ts`, `src/transcript.ts`, re-exported from `src/index.ts`.
- `ctx.generate.text` is used for advisor inference. It must not create sessions, invoke tools, or write anything into session history.
- Quota is a two-phase commit per session: `tryAcquire` before context/generation, `commit` only on success, `refund` on any failure or cancellation. An exhausted quota makes no context or generation call.
- Tool results use the V2 `{ content, metadata? }` shape. Error output stays concise and never leaks credentials, auth headers, or raw provider errors.
- Packaging: `dist/plugin.js` is built by `bun run build` (input `.opencode/plugins/advisor.ts`, `@opencode/plugin` externalized). `dist/` is never committed. The `prepare` lifecycle builds for Git installation from `github:MoeShimaKaze/oc-advisor#<SHA>`. The repository `opencode.json` stays schema-only; local loading relies on `.opencode/plugins/` auto-discovery.
- Consumer configuration examples must always use a full Git spec (`github:MoeShimaKaze/oc-advisor#<commit>`) inside the `plugins` object form — never a bare `oc-advisor` string, which would be resolved as an npm package and fail.

## Development Workflow

- Test-driven development: write the failing test first, then the minimal implementation.
- Gates before completing any code task: `bun test`, `bun run typecheck`, `bun run build` — all must pass with evidence.
- `OPENCODE_V2_MIGRATION_RESEARCH.md` is a local research input and must never be staged or committed.