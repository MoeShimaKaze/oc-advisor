# Architecture

This document describes the design rationale, module boundaries, and key mechanisms of oc-advisor.

---

## Design Principles

### Actions / Calculations / Data Separation

The plugin follows the "Grokking Simplicity" principle, clearly separating three layers:

#### Calculations (pure functions) — `src/`

Functions with input → output semantics that involve no server I/O, state mutation, or time dependence.

| File | Responsibility |
|------|----------------|
| `src/model_id.ts` | Splits a `provider/model` string into `{providerID, modelID}`. Throws `InvalidModelError` on invalid input. |
| `src/config.ts` | `parseAdvisorConfig(opts?)` normalizes plugin options into a type-safe `AdvisorConfig`. `parseAdvisorConfigJSON(text)` parses a JSON string and falls back to defaults on malformed input. Ignores unknown keys, validates types, falls back to defaults. |
| `src/rate_limiter.ts` | `RateLimiter` class. Implements a two-phase commit (`tryAcquire` → `commit` / `refund`) to refund quota on I/O failure. State is held in `Map<string, number>`. |
| `src/transcript.ts` | `extractTranscript` (message array → string), `truncate` (keep most recent N chars), and the composite `extractTranscriptThenTruncate`. |
| `src/prompt.ts` | `buildAdvisorPrompt({transcript, question, context?})` → `{system, user}`. |
| `src/index.ts` | Public API re-export. |

#### Actions (side effects) — `.opencode/plugin/advisor.ts`

The thin glue layer that imports pure modules and wires them into OpenCode hooks. It performs:
- `readFileSync()` of `.opencode/oc-advisor.json` and `~/.config/opencode/oc-advisor.json` (I/O — reads configuration at plugin init)
- `client.session.messages()` (I/O — reads transcript)
- `client.session.create()` / `client.session.prompt()` / `client.session.delete()` (I/O — spawns a throwaway child session, runs advisor inference, cleans up)
- `RateLimiter` state changes (`tryAcquire` / `commit` / `refund`)
- Dependency on `ctx` (session ID, message ID, etc.)

#### Data — `opencode.json`, `AdvisorConfig`, type definitions

Immutable configuration values and type definitions.

---

## How Advisor Inference Works

`ask_advisor` uses the OpenCode SDK's `client.session.prompt({ body: { model: { providerID, modelID }, ... } })` to run inference on the **advisor model**. The target is **not** the current user session. Instead, a **throwaway child session** is created via `client.session.create({ body: { parentID: <current session>, title: "advisor" } })`. This ensures that the advisor's prompt and response stay entirely within the child session and **never pollute the user's active session history**. After inference, the child session is deleted in a `finally` block.

This pattern mirrors `opencode-background-agents`, which uses the same `parentID`-based child session approach.

### Why not post directly to the user session?

An earlier design posted the advisor prompt to `ctx.sessionID` directly. This caused two problems:

1. The advisor's prompt (containing the full transcript + question) and its response were permanently appended to the user's visible conversation history.
2. On every subsequent `ask_advisor` call, `client.session.messages()` re-read those prior advisor prompts and responses as part of the user transcript. After N calls, the advisor's "transcript" was dominated by nested copies of itself, not by the user's actual conversation.

The throwaway child session eliminates both issues.

---

## Rate Limiting: Two-Phase Commit

A naive counter (`count++` on every call) has a critical flaw: if the advisor I/O fails (network blip, provider 5xx, expired auth), the quota slot is consumed with no advice delivered. After enough consecutive failures, the user permanently loses advisor access for that session.

To prevent this, oc-advisor uses a **two-phase commit**:

1. **`tryAcquire(sessionID)`** — If the session is under the cap, increment the counter and reserve a slot. If at cap, deny without incrementing.
2. **`commit(sessionID)`** — Called only after the advisor response is successfully extracted. Releases the reservation (counter stays).
3. **`refund(sessionID)`** — Called on any I/O failure. Decrements the counter and releases the reservation, allowing the next call to proceed.

This guarantees that the quota reflects **actual successful advice deliveries**, not mere attempts.

---

## Transcript Truncation Strategy

The transcript sent to the advisor is truncated to `transcriptCharBudget` characters (default: 20,000). The strategy is to **keep the most recent N characters** (the tail of the transcript string) and **discard the oldest content** (the head).

Rationale: the most recent messages are the most relevant for the advisor's strategic guidance. Older context is progressively less useful. A simple `text.slice(text.length - budget)` achieves this without needing to reason about message boundaries.

---

## Model ID Parsing

Model IDs follow the `provider/model` format. The parser splits on the **first** `/` only, so that providers like `lmstudio` whose model IDs contain `/` (e.g., `lmstudio/google/gemma-3n-e4b`) are handled correctly:

- `"opencode-go/kimi-k2.7-code"` → `{ providerID: "opencode-go", modelID: "kimi-k2.7-code" }`
- `"lmstudio/google/gemma-3n-e4b"` → `{ providerID: "lmstudio", modelID: "google/gemma-3n-e4b" }`

Invalid inputs (no `/`, empty provider or model, empty string) throw `InvalidModelError` immediately, so callers can validate before any I/O occurs.

---

## Configuration via Side-File

OpenCode's `opencode.json` plugin array accepts **string package names only** (per the official plugin docs). The tuple form `[name, options]` is not supported for npm plugins. Therefore, advisor options live in a **side-file**:

- Project-local: `.opencode/oc-advisor.json` (in the project root)
- Global: `~/.config/opencode/oc-advisor.json`

The plugin checks the project-local file first; if absent, it falls back to the global file; if neither is present, defaults apply. Malformed files (unparseable JSON, non-object root) are silently ignored.

`opencode.json` itself only registers the plugin:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "oc-advisor"
  ]
}
```

And `.opencode/oc-advisor.json` holds the options:

```json
{
  "advisorModel": "opencode-go/kimi-k2.7-code",
  "maxCallsPerSession": 20,
  "transcriptCharBudget": 20000
}
```

File reading is an Action (it lives in `.opencode/plugin/advisor.ts`, not in `src/`). The pure parsing logic (`parseAdvisorConfigJSON`) is a Calculation and is unit-tested in `test/config.test.ts`.

---

## `/advisor` Command: Configuration, Not Query

The `/advisor` command is intentionally **not** a direct query to the advisor model. It only displays the current advisor configuration and guides the user on how to change it.

Rationale: OpenCode commands are templates that become user messages to the LLM — they cannot rewrite config files programmatically. Therefore, the command's role is safely limited to "show current settings + explain how to edit." The user follows the guidance and manually edits `.opencode/oc-advisor.json`, then restarts OpenCode.

The actual advisor query is performed exclusively by the `ask_advisor` tool, which the executor model calls autonomously when it needs strategic guidance.