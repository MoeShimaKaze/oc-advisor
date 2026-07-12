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

### A. Use as a project-local setup (recommended)

Use this repository as your working directory and launch OpenCode directly.

```bash
git clone <this-repo> ./my-project
cd my-project
bun install
opencode
```

`opencode.json` already registers the advisor plugin, so launching OpenCode enables both the `ask_advisor` tool and the `/advisor` command.

### B. Embed into an existing project

You only need three things from this repository:

- `src/` (pure logic)
- `.opencode/plugin/advisor.ts` (glue)
- `.opencode/command/advisor.md` (command)

Copy:

```bash
cp -r path/to/oc-advisor/src                ./src
cp -r path/to/oc-advisor/.opencode/plugin    ./.opencode/plugin
cp -r path/to/oc-advisor/.opencode/command   ./.opencode/command
```

Add the advisor to the `plugin` array in your project's `opencode.json` using a relative path:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["./.opencode/plugin/advisor.ts", {
      "advisorModel": "opencode-go/kimi-k2.7-code",
      "maxCallsPerSession": 20,
      "transcriptCharBudget": 20000
    }]
  ]
}
```

OpenCode auto-discovers `.opencode/plugin/*.ts`. Even without an explicit entry in `opencode.json`, the plugin will load — but to **override the advisor model**, you must use the tuple form `[path, options]` in the `plugin` array (see below).

Install dependencies:

```bash
bun add @opencode-ai/plugin @opencode-ai/sdk zod
bun add -d @types/bun typescript
```

Restart OpenCode to apply.

### C. Global usage (personal)

To use across multiple projects, specify an absolute path in your global config at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["/absolute/path/to/oc-advisor/.opencode/plugin/advisor.ts", {
      "advisorModel": "opencode-go/kimi-k2.7-code"
    }]
  ]
}
```

> **Note:** Since the plugin imports from `../../src/...`, the `src/` directory must be placed alongside the plugin.

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

Override via the second element (options object) of the plugin tuple in `opencode.json`:

```json
"plugin": [
  ["./.opencode/plugin/advisor.ts", {
    "advisorModel": "opencode-go/glm-5.2",
    "maxCallsPerSession": 30,
    "transcriptCharBudget": 30000
  }]
]
```

### Example advisor models

| Model | Setting string | Intended use |
|-------|----------------|--------------|
| Kimi K2.7 Code (default) | `opencode-go/kimi-k2.7-code` | Coding-focused, available via OpenCode Go subscription |
| GLM-5.2 | `opencode-go/glm-5.2` | General-purpose high-intelligence model in OpenCode Go |
| DeepSeek V4 Pro | `opencode-go/deepseek-v4-pro` | Reasoning-heavy tasks |
| Claude Opus | `anthropic/claude-opus-4-20250514` | Anthropic alternative (requires Anthropic provider auth) |

### ⚠️ Important configuration notes

- **Never place unknown top-level keys** (e.g. `advisor_model`) in `opencode.json`. OpenCode will fail to start with `ConfigInvalidError`. All configuration must go through the **plugin tuple options**.
- `advisorModel` must use the `provider/model` format (e.g. `opencode-go/kimi-k2.7-code`). It is split on the first `/` into provider ID and model ID, so IDs like `lmstudio/google/gemma-3n-e4b` (where the model side contains `/`) are also supported.
- An invalid `advisorModel` (no `/`, empty string, etc.) will cause an error at plugin load time.

---

## `/advisor` Command — Model Selection & Configuration

`/advisor` is a command to **check the current advisor configuration and guide configuration changes**.

```
/advisor
```

When executed, the executor model reads `opencode.json` and returns:

1. The current values of `advisorModel` / `maxCallsPerSession` / `transcriptCharBudget`
2. How to change them (editing the `plugin` tuple options in `opencode.json`)
3. Alternative model candidates
4. A note clarifying that `/advisor` is for configuration only, not for direct advisor queries

OpenCode commands cannot rewrite `opencode.json` directly (a command template is just a user message to the LLM). Therefore, the user follows the guidance and manually edits `opencode.json`. After editing, **OpenCode must be restarted** (config is loaded at startup and not hot-reloaded).

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

```json
"plugin": [
  ["./.opencode/plugin/advisor.ts", {
    "advisorModel": "opencode-go/glm-5.2",
    "maxCallsPerSession": 30,
    "transcriptCharBudget": 30000
  }]
]
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
| `ask_advisor` not in tool list | The `plugin` path in `opencode.json` is wrong, or `.opencode/plugin/advisor.ts` doesn't exist. Also check that `bun install` has been run. |
| `Cannot find module '../../src/...'` | Ensure `src/` is placed correctly relative to the plugin path. The glue file is at `.opencode/plugin/advisor.ts` and refers to `../../src`. |
| Advisor response leaks into the current session history | This was a bug in an older version. The current version runs advisor inference in a **throwaway child session** and never posts to `ctx.sessionID`. Verify that `.opencode/plugin/advisor.ts` calls `client.session.create({ body: { parentID } })` → `client.session.prompt({ path: { id: childID } })` → `client.session.delete()`. |

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