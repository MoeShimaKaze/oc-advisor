# Architecture

This document describes the design rationale, module boundaries, and key mechanisms of oc-advisor.

**Runtime basis:** OpenCode **V2 only** (runtime 2.0.24, dependency `@opencode/plugin` 2.0.24). There is no V1 compatibility: the V1 default-export plugin, `@opencode-ai/*` SDK calls, temporary child sessions, side-file configuration, and `{ title, output }` tool results are all removed.

---

## Design Principles

### Actions / Calculations / Data Separation

The plugin follows the "Grokking Simplicity" principle, clearly separating three layers:

#### Calculations (pure functions) — `src/`

Functions with input → output semantics that involve no I/O, state mutation, or time dependence.

| File | Responsibility |
|------|----------------|
| `src/model_id.ts` | `parseModelID(raw)` splits a `provider/model` string into the V2 shape `{ providerID, id }` for `ctx.generate.text`. Throws `InvalidModelError` on invalid input. |
| `src/config.ts` | `parseAdvisorConfig(opts?)` normalizes `ctx.options` (from `plugins[].options`) into a type-safe `AdvisorConfig`. Unknown keys are ignored; invalid individual values fall back to defaults; the model string is validated via `parseModelID`. There is no side-file JSON parsing. |
| `src/rate_limiter.ts` | `RateLimiter` class. Implements a two-phase commit (`tryAcquire` → `commit` / `refund`) to refund quota on I/O failure or cancellation. State is held in in-memory `Map`s per session ID. |
| `src/transcript.ts` | V2 transcript handling: `extractTranscript` (message array → visible dialogue text), `truncate` (keep the most recent N chars), and the composite `extractTranscriptThenTruncate`. |
| `src/prompt.ts` | `buildAdvisorPrompt({transcript, question, context?})` → a single combined prompt string (advisor instructions + transcript + question), matching the `ctx.generate.text` single-`prompt` contract. |
| `src/index.ts` | Public API re-export of the pure modules. |

#### Actions (side effects) — `.opencode/plugins/advisor.ts`

The thin glue layer, defined via `Plugin.define({ id: "oc-advisor", async setup(ctx) { ... } })`, is the **sole** plugin entrypoint. It performs all OpenCode effects:

- Reads configuration once from `ctx.options` (I/O-free but runtime-provided — the only config source)
- `ctx.tool.transform` registers `ask_advisor` exactly once with a JSON Schema (`question` required, `context` optional)
- `ctx.command.transform` registers `/advisor` exactly once
- `ctx.session.context({ sessionID })` (I/O — reads the current session's visible conversation)
- `ctx.generate.text({ model: { providerID, id }, prompt }, { signal })` (I/O — advisor inference, abort-aware)
- `ctx.session.prompt` inside the `/advisor` command (submits the configuration summary using the invocation's `delivery`)
- `RateLimiter` state changes (`tryAcquire` / `commit` / `refund`)

#### Data — `opencode.json`, `AdvisorConfig`, type definitions

Immutable configuration values and type definitions. The repository's own `opencode.json` is **schema-only**; local development relies on `.opencode/plugins/` auto-discovery, which also prevents double-loading the plugin from source and package simultaneously.

---

## How Advisor Inference Works

`ask_advisor` runs advisor inference through the V2 **`ctx.generate.text({ model: { providerID, id }, prompt })`** API. Per the V2 contract, this call:

- **Does not create any session** — not even a temporary one
- **Does not invoke tools**
- **Does not write anything into the current session history**

The advisor's prompt (combined instructions + transcript + question) and its response exist only inside the tool execution; the response is returned to the executor as the tool result `{ content, metadata? }`. This stateless generation is what guarantees **session non-pollution** — there is no session to clean up because none is ever created.

### Why not the earlier child-session approach?

The V1 implementation ran inference inside a **throwaway child session** (`client.session.create({ parentID })` → `client.session.prompt` → `client.session.delete`). That worked, but it:

1. Required three SDK round-trips and careful cleanup in a `finally` block.
2. Created real (if short-lived) session records in the runtime.
3. Risked leaking the advisor exchange into session storage on failure paths.

V2's `ctx.generate.text` eliminates all three concerns by design: generation is a pure request/response that touches no session store. This is why the migration replaced the child-session pattern entirely.

### Transcript visibility

`ctx.session.context({ sessionID })` returns the V2 flat message structure. The pure extraction keeps only **visible dialogue text**:

- `user` / `system` / `synthetic` messages contribute their `text`
- `assistant` messages contribute only their `type: "text"` content items
- Tool calls, reasoning, shell output, status, and other non-dialogue content are skipped

Only this visible text (tail-truncated to `transcriptCharBudget`) is shown to the advisor. The executor's private reasoning and tool internals are never exposed.

---

## Rate Limiting: Two-Phase Commit

A naive counter (`count++` on every call) has a critical flaw: if the advisor I/O fails (network blip, provider 5xx, expired auth) or the user cancels, the quota slot is consumed with no advice delivered. After enough consecutive failures, the user permanently loses advisor access for that session.

To prevent this, oc-advisor uses a **two-phase commit**:

1. **`tryAcquire(sessionID)`** — If the session is under the cap, increment the counter and reserve a slot. If at cap, deny without incrementing — **no context read and no generation call occur**, so an exhausted quota costs nothing.
2. **`commit(sessionID)`** — Called only after the advisor response is successfully extracted. Releases the reservation (counter stays).
3. **`refund(sessionID)`** — Called on any failure or cancellation after reservation (context read failure, generation error, `AbortError`, abort signal). Decrements the counter and releases the reservation, allowing the next call to proceed.

This guarantees that the quota reflects **actual successful advice deliveries**, not mere attempts. Quota state is in-memory per plugin instance; it is not persisted across restarts or shared across instances.

---

## Transcript Truncation Strategy

The transcript sent to the advisor is truncated to `transcriptCharBudget` characters (default: 20,000). The strategy is to **keep the most recent N characters** (the tail of the transcript string) and **discard the oldest content** (the head).

Rationale: the most recent messages are the most relevant for the advisor's strategic guidance. Older context is progressively less useful. A simple `text.slice(text.length - budget)` achieves this without needing to reason about message boundaries.

---

## Model ID Parsing

Model IDs follow the `provider/model` format. The parser splits on the **first** `/` only, so that providers like `lmstudio` whose model IDs contain `/` (e.g., `lmstudio/google/gemma-3n-e4b`) are handled correctly:

- `"opencode-go/kimi-k2.7-code"` → `{ providerID: "opencode-go", id: "kimi-k2.7-code" }`
- `"lmstudio/google/gemma-3n-e4b"` → `{ providerID: "lmstudio", id: "google/gemma-3n-e4b" }`

Invalid inputs (no `/`, empty provider or model, empty string) throw `InvalidModelError` immediately, so callers can validate before any I/O occurs. The parsed shape is the V2 `{ providerID, id }` required by `ctx.generate.text`.

---

## Configuration via `plugins[].options`

The **only** configuration source is the V2 `plugins` object form in `opencode.json`, read inside the plugin as `ctx.options`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:MoeShimaKaze/oc-advisor#<commit>",
      "options": {
        "advisorModel": "opencode-go/kimi-k2.7-code",
        "maxCallsPerSession": 20,
        "transcriptCharBudget": 20000
      }
    }
  ]
}
```

- Unknown option keys are ignored; invalid individual values fall back to defaults; `advisorModel` format is validated at load time via `parseModelID`.
- The V1 **side-file** mechanism (`.opencode/oc-advisor.json` project-local, `~/.config/opencode/oc-advisor.json` global) is **removed** — the plugin never reads any file for configuration.
- The repository's own `opencode.json` stays **schema-only** (`$schema` only). During development, `.opencode/plugins/` auto-discovery loads the TypeScript source directly; the schema-only config also prevents the local source and a Git-installed package from both registering the same plugin ID.

Configuration parsing is a Calculation (`parseAdvisorConfig` in `src/config.ts`, unit-tested in `test/config.test.ts`); receiving `ctx.options` is the Action boundary in `.opencode/plugins/advisor.ts`.

---

## `/advisor` Command: Configuration, Not Query

The `/advisor` command is registered programmatically via `ctx.command.transform` — there is no file-based command. It is intentionally **not** a direct query to the advisor model.

When executed, it calls `ctx.session.prompt` with the invocation's `delivery`, submitting a short configuration summary into the current session: the effective `advisorModel`, `maxCallsPerSession`, and `transcriptCharBudget`, plus guidance to edit `plugins[].options` and restart OpenCode. It never calls `ctx.generate.text` or the advisor model.

Rationale: OpenCode commands cannot rewrite config files programmatically. The command's role is safely limited to "show current settings + explain how to edit." The actual advisor query is performed exclusively by the `ask_advisor` tool, which the executor model calls autonomously when it needs strategic guidance.

---

## Packaging and Installation

- The Git-installable artifact is a single bundled file, `dist/plugin.js`, built by `bun run build` from the V2 entry `.opencode/plugins/advisor.ts` with `@opencode/plugin` **externalized** (resolved from the OpenCode runtime at load time).
- The package `prepare` lifecycle runs the build, so installing from `github:MoeShimaKaze/oc-advisor#<SHA>` compiles the bundle on the consumer's machine. `dist/` is **never committed**.
- Package version is 0.2.0; the only runtime dependency is `@opencode/plugin` at exactly 2.0.24. No `@opencode-ai/*` V1 packages remain.
- Installation must always use the full Git spec; a bare `oc-advisor` string is resolved as an npm package and fails (no npm publish is planned).
