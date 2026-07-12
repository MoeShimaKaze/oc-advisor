# oc-advisor

An OpenCode plugin that lets a fast, inexpensive executor model (e.g. DeepSeek V4 Flash) consult a smarter, higher-intelligence model (e.g. GLM-5.2, Kimi, Claude) for strategic advice when it gets stuck during a task.

Inspired by Claude Code's `/advisor` tool (the pattern where the executor model asks an advisor model for guidance mid-generation), reimagined for OpenCode.

---

## Overview

oc-advisor provides **two entry points**:

| Entry point | Role | Invoked by |
|-------------|------|------------|
| `/advisor` command | Selects and configures **which upstream model to consult** (the advisor model) | User |
| `ask_advisor` tool | Performs the **actual query** to the advisor model (passes the full conversation transcript and receives strategic advice) | Executor model (autonomous) |

The executor model does **not** get instant advice by invoking `/advisor`. `/advisor` is merely an entry point for selecting and confirming the advisor model. The `ask_advisor` tool is the sole path that performs the actual query.

### Flow

```
User: /advisor         → Shows / guides changes to advisor settings in opencode.json
User: (lets executor model work)
Executor: (gets stuck)  → Calls ask_advisor tool
                        → Advisor model reads the full conversation history and generates strategic advice
                        → Executor continues based on that advice
```

For design rationale, module boundaries, and internal mechanisms, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Requirements

- [OpenCode](https://opencode.ai) runtime
- Bun (used for plugin execution and tests)
- API key for the provider you want to use as the advisor model (authenticated in OpenCode)

---

## Installation

### A. From npm (recommended)

Install the package as a dependency of your OpenCode project:

```bash
bun add oc-advisor
```

Then register it in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "oc-advisor"
  ]
}
```

That's it — the `ask_advisor` tool and `/advisor` command are now available. The default advisor model (`opencode-go/kimi-k2.7-code`) is used out of the box.

To override options, create a file at `.opencode/oc-advisor.json` in your project root:

```json
{
  "advisorModel": "opencode-go/glm-5.2",
  "maxCallsPerSession": 30,
  "transcriptCharBudget": 30000
}
```

> OpenCode's `plugin` array in `opencode.json` only accepts **string package names**
> (per the official plugin docs). That's why advisour options live in a side-file
> rather than next to the plugin entry itself.

### B. Global usage (personal)

To use the plugin across all projects, install it globally and configure it in your global OpenCode config:

```bash
bun add --global oc-advisor
```

In `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "oc-advisor"
  ]
}
```

For global overrides, place the options file at `~/.config/opencode/oc-advisor.json`:

```json
{
  "advisorModel": "opencode-go/glm-5.2"
}
```

The plugin checks the project-local file first; if absent, it falls back to the global file; if neither is present, defaults apply.

### C. Testing locally with `bun link` (pre-publish / development)

If you want to use the plugin in another project before publishing to npm, or while iterating on the source, `bun link` lets you register the package globally from your clone and consume it from any other project as if it were installed.

From the oc-advisor repository root (first time, and after each source edit):

```bash
bun install
bun run build       # regenerates dist/plugin.js
bun link            # registers "oc-advisor" globally
```

Then in the project where you want to use it:

```bash
cd /path/to/other-project
bun link oc-advisor  # symlinks the global registration into node_modules
```

Configure `opencode.json` exactly as the npm case — note the **string form**, not a tuple:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "oc-advisor"
  ]
}
```

Optionally add `.opencode/oc-advisor.json` in the consumer project to override options. Launch OpenCode from that project. The plugin resolves through the symlink to your local `dist/plugin.js`.

> **Tip:** The symlink points at the **built bundle**, not the TypeScript source. After editing files under `src/` or `.opencode/plugin/advisor.ts`, re-run `bun run build` in the oc-advisor repo to refresh `dist/plugin.js`. The symlink stays in place; no re-link needed.

To unlink later:

```bash
bun unlink oc-advisor    # in the consumer project
bun unlink               # in the oc-advisor repo (removes global registration)
```

### D. From source (for development / contributors)

Clone this repository and run OpenCode directly from it. The local `opencode.json` references the unbundled TypeScript source via a relative path, so source edits take effect immediately:

```bash
git clone https://github.com/yuk1ty/oc-advisor.git
cd oc-advisor
bun install
opencode
```

To verify your build, the bundled artifact can be regenerated with:

```bash
bun run build    # outputs dist/plugin.js
bun test         # runs the unit tests on src/
```

The published npm package is this bundled single file (`dist/plugin.js`) plus documentation. All `@opencode-ai/*` modules are externalized as peer dependencies, so they are resolved from the OpenCode runtime, not bundled.

---

## Configuring the Advisor Model

### Defaults

| Setting | Default |
|---------|---------|
| `advisorModel` | `opencode-go/kimi-k2.7-code` |
| `maxCallsPerSession` | `20` |
| `transcriptCharBudget` | `20000` |

The default is Kimi K2.7 Code, available under the OpenCode Go provider (confirmed via the [OpenCode Go models list](https://opencode.ai/docs/go/)).

### How to override

Create or edit `.opencode/oc-advisor.json` in your project root:

```json
{
  "advisorModel": "opencode-go/glm-5.2",
  "maxCallsPerSession": 30,
  "transcriptCharBudget": 30000
}
```

For global use, place the file at `~/.config/opencode/oc-advisor.json`. Project-local settings take precedence over global; both take precedence over the built-in defaults.

### Example advisor models

| Model | Setting string | Intended use |
|-------|----------------|--------------|
| Kimi K2.7 Code (default) | `opencode-go/kimi-k2.7-code` | Coding-focused, available via OpenCode Go subscription |
| GLM-5.2 | `opencode-go/glm-5.2` | General-purpose high-intelligence model in OpenCode Go |
| DeepSeek V4 Pro | `opencode-go/deepseek-v4-pro` | Reasoning-heavy tasks |
| Claude Opus | `anthropic/claude-opus-4-20250514` | Anthropic alternative (requires Anthropic provider auth) |

### ⚠️ Important configuration notes

- OpenCode's `opencode.json` plugin array accepts **string package names only** — no tuple form `[name, options]`. Per the [official plugin docs](https://opencode.ai/docs/plugins). That's why advisour options live in a side-file (`.opencode/oc-advisor.json`) instead of beside the `plugin` entry.
- The side-file is optional. If absent, defaults are used. If present but malformed (unparseable JSON, non-object root), the file is silently ignored and defaults apply.
- `advisorModel` must use the `provider/model` format (e.g. `opencode-go/kimi-k2.7-code`). It is split on the first `/` into provider ID and model ID, so IDs like `lmstudio/google/gemma-3n-e4b` (where the model side contains `/`) are also supported.
- An invalid `advisorModel` (no `/`, empty string, etc.) will cause an error at plugin load time.

---

## `/advisor` Command — Model Selection & Configuration

`/advisor` is a command to **check the current advisor configuration and guide configuration changes**.

```
/advisor
```

When executed, the executor model reads `opencode.json` (for the plugin entry) and `.opencode/oc-advisor.json` (for the options) and returns:

1. The current values of `advisorModel` / `maxCallsPerSession` / `transcriptCharBudget` (from `.opencode/oc-advisor.json`, or defaults if the file doesn't exist)
2. How to change them (edit `.opencode/oc-advisor.json`)
3. Alternative model candidates
4. A note clarifying that `/advisor` is for configuration only, not for direct advisor queries

OpenCode commands cannot rewrite config files directly (a command template is just a user message to the LLM). Therefore, the user follows the guidance and manually edits `.opencode/oc-advisor.json`. After editing, **OpenCode must be restarted** (config is loaded at startup and not hot-reloaded).

---

## `ask_advisor` Tool — The Sole Query Path

A tool that the executor model calls autonomously. It is registered in OpenCode's tool list as `ask_advisor`.

When the tool executes, it:

1. Checks the **per-session call limit**. If the limit is reached, it returns a block response immediately (no advisor model query → no cost).
2. Retrieves the current session's message list via the SDK and builds a transcript (on failure, refunds the quota slot and exits).
3. Truncates the transcript to `transcriptCharBudget` characters (**discards the oldest content, keeps the most recent N characters**).
4. Creates a **throwaway child session** (`parentID` = current session) via `client.session.create()`. Advisor inference runs entirely within this child session, so **neither the advisor's prompt nor its response pollutes the user's active session history**.
5. Calls `client.session.prompt()` on the child session, overriding the model to the advisor model (on failure, refunds the quota slot).
6. Extracts the advisor response text. On success, commits the quota slot.
7. Deletes the child session for cleanup.
8. Returns the advisor's response text as the tool result. The executor model receives the advice and continues working.

Tool arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `question` | string (required) | The specific question or decision to ask the advisor |
| `context` | string (optional) | Additional context (file paths, code snippets, prior decisions, constraints) |

### How to make the executor call the tool

The executor model may not call the advisor on its own. To ensure it does, give an explicit instruction:

```
This is a design decision point, so use the ask_advisor tool
to consult the advisor on "mutex vs RWLock — which should we adopt?",
and proceed with the implementation based on its advice.
```

---

## Abuse Limits

To prevent LLM abuse and cost explosions, two limits are enforced:

### 1. Per-session call limit (`maxCallsPerSession`)

Maximum number of `ask_advisor` calls per session. Default: **20**.

- When the limit is reached, subsequent calls return `{ title: "Advisor blocked", output: "Advisor call limit (20) reached..." }` without invoking the advisor model.
- The limit is per-session; starting a new session resets it.
- Implemented via the `RateLimiter` class (`Map<sessionID, count>`). Calls that are denied do not increment the counter, so hammering the limit has no side effects.
- **Failure refund**: If any of transcript retrieval, child session creation, or advisor inference fails, the consumed slot is immediately refunded (`refund`). Consecutive transient failures will never permanently disable the advisor. A slot is only committed when the advisor response is successfully extracted.

### 2. Transcript character budget (`transcriptCharBudget`)

Character limit for the transcript sent to the advisor. Default: **20,000 characters**.

- When the conversation grows long, **the oldest content is discarded and the most recent N characters** are kept.
- Prevents output token explosions from long transcripts.

### Configuration example

`.opencode/oc-advisor.json`:

```json
{
  "advisorModel": "opencode-go/glm-5.2",
  "maxCallsPerSession": 30,
  "transcriptCharBudget": 30000
}
```

---

## Tests

### Requirements

- Bun (install per the Bun documentation)

### Running

```bash
bun install
bun test
```

Watch mode:

```bash
bun run test:watch
```

### Coverage

Only pure logic (`src/`) is unit-tested. Tests live under `test/`:

| Test file | Module |
|-----------|--------|
| `test/model_id.test.ts` | `src/model_id.ts` |
| `test/config.test.ts` | `src/config.ts` |
| `test/rate_limiter.test.ts` | `src/rate_limiter.ts` |
| `test/transcript.test.ts` | `src/transcript.ts` |
| `test/prompt.test.ts` | `src/prompt.ts` |

The glue layer (`advisor.ts`), `command/advisor.md`, and `opencode.json` are not unit-tested (they depend on side effects). They are covered by manual smoke tests.

### Type checking

```bash
./node_modules/.bin/tsc --noEmit
```

Confirmed zero errors under strict mode.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---------|------------|
| OpenCode won't start (`ConfigInvalidError`) | `opencode.json` has an **unknown top-level key**. Do not create keys like `advisor_model`; configure everything inside the `plugin` tuple options. |
| Advisor doesn't respond / auth error | The advisor provider's API key is not configured. Run `opencode auth` to check authentication for the target provider. |
| Invalid advisor model ID | Verify that `advisorModel` is in `provider/model` format and not empty. Strings without `/` are rejected. |
| Advisor call limit reached | `ask_advisor` output shows `Advisor call limit (20) reached`. Raise `maxCallsPerSession` or start a new session. |
| Config changes not applied | Config is loaded at startup. **Restart OpenCode** after editing `opencode.json`. |
| `ask_advisor` not in tool list | The `plugin` entry in `opencode.json` is wrong, or `oc-advisor` is not installed. Run `bun add oc-advisor` (or `bun add --global oc-advisor` for global use). Also confirm the package is resolvable from OpenCode's plugin resolution context. |
| `Cannot find module 'oc-advisor'` | The package isn't installed in the location OpenCode resolves from. Try installing it under `.opencode/` (some setups expect plugin deps there): `cd .opencode && bun add oc-advisor`. |
| Advisor response leaks into the current session history | This was a bug in an older version. The current version runs advisor inference in a **throwaway child session** and never posts to `ctx.sessionID`. Verify that the bundled plugin calls `client.session.create({ body: { parentID } })` → `client.session.prompt({ path: { id: childID } })` → `client.session.delete()`. |

---

## Manual Smoke Test

A procedure for verifying the implementation.

### Prerequisites

1. `bun install` succeeds.
2. `bun test` is all green.
3. `./node_modules/.bin/tsc --noEmit` reports zero errors.

### Steps

1. **`opencode.json` validation**
   - Launch `opencode` in this directory and confirm it starts without `ConfigInvalidError`.

2. **`/advisor` command**
   - Type `/advisor` in the TUI.
   - Confirm the current advisor settings (`advisorModel` / `maxCallsPerSession` / `transcriptCharBudget`) and change instructions are displayed.
   - Confirm **no sub-agent launch or direct query occurs**.

3. **`ask_advisor` tool**
   - Give the executor model an instruction that explicitly triggers the tool:
     ```
     Use the ask_advisor tool to consult the advisor on
     "are there any concurrency pitfalls in this design?"
     ```
   - Confirm the tool executes and the advisor model's response is returned as tool output.
   - Confirm the title is something like `Advisor Response (opencode-go/kimi-k2.7-code)`.

4. **Abuse limit**
   - Call `ask_advisor` `maxCallsPerSession + 1` times in the same session (repeat "ask the advisor again" etc.).
   - Confirm the N+1th call is rejected with `Advisor call limit (20) reached for this session.`

5. **Model switching**
   - Change `advisorModel` in `opencode.json` to e.g. `opencode-go/glm-5.2`.
   - Restart OpenCode.
   - Call `ask_advisor` again and confirm the title becomes `Advisor Response (opencode-go/glm-5.2)`.

---

## License

MIT

---

## References

- Claude Code advisor tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool
- OpenCode Plugins: https://opencode.ai/docs/plugins
- OpenCode Commands: https://opencode.ai/docs/commands
- OpenCode Go models list: https://opencode.ai/docs/go/
- OpenCode config schema: https://opencode.ai/config.json