# oc-advisor

An OpenCode **V2** plugin that lets a fast, inexpensive executor model (e.g. DeepSeek V4 Flash) consult a smarter, higher-intelligence model (e.g. GLM-5.2, Kimi, Claude) for strategic advice when it gets stuck during a task.

Inspired by Claude Code's `/advisor` tool (the pattern where the executor model asks an advisor model for guidance mid-generation), reimagined for OpenCode.

> **V2 only.** This version requires **OpenCode 2.0.24+** and is built against the V2 plugin API (`@opencode/plugin` 2.0.24). It is **not compatible with OpenCode V1** — do not attempt to load it with a V1 runtime, and expect no V1 fallbacks.

---

## Overview

oc-advisor provides **two entry points**:

| Entry point | Role | Invoked by |
|-------------|------|------------|
| `/advisor` command | Shows the **current advisor configuration** and explains how to change it | User |
| `ask_advisor` tool | Performs the **actual query** to the advisor model (passes the visible conversation transcript and receives strategic advice) | Executor model (autonomous) |

The executor model does **not** get instant advice by invoking `/advisor`. `/advisor` only reports configuration; the `ask_advisor` tool is the sole path that performs the actual query.

### Flow

```
User: /advisor         → The plugin submits a configuration summary into the session
User: (lets executor model work)
Executor: (gets stuck)  → Calls ask_advisor tool
                        → Advisor model reads the recent visible conversation and generates strategic advice
                        → Executor continues based on that advice
```

Advisor inference runs through the V2 `ctx.generate.text` API: it **creates no sessions, invokes no tools, and writes nothing into the session history**. The advisor's prompt and response exist only as the tool result.

For design rationale, module boundaries, and internal mechanisms, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Requirements

- OpenCode **2.0.24 or later** (V2 plugin API)
- Bun (used for plugin build, tests, and the Git-install `prepare` step)
- API key for the provider you want to use as the advisor model (authenticated in OpenCode)

---

## Installation

oc-advisor is distributed as a **Git dependency**, not an npm package. OpenCode resolves the full Git spec and runs the package's `prepare` lifecycle, which builds `dist/plugin.js` locally.

### A. Project install (recommended)

Add the plugin to your project's `opencode.json` using the V2 `plugins` object form with a **full Git spec**:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:MoeShimaKaze/oc-advisor#<commit>",
      "options": {}
    }
  ]
}
```

Replace `<commit>` with a full commit SHA from the [repository](https://github.com/MoeShimaKaze/oc-advisor). Pinning an exact SHA makes your setup reproducible.

> ⚠️ **Never use a bare `oc-advisor` string** (e.g. `"plugin": ["oc-advisor"]`). A bare name is resolved as an **npm package**; no such npm package exists, so loading fails with a 404. The V1-era `"plugin"` array and side-file configuration are **no longer supported**.

That's it — the `ask_advisor` tool and `/advisor` command become available with the default advisor model (`opencode-go/kimi-k2.7-code`). To override options, fill the `options` object (see [Configuring the Advisor Model](#configuring-the-advisor-model)).

### B. Global usage (personal)

To use the plugin across all projects, add the same `plugins` entry to your global config at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:MoeShimaKaze/oc-advisor#<commit>",
      "options": {
        "advisorModel": "opencode-go/glm-5.2"
      }
    }
  ]
}
```

### C. From source (for development / contributors)

Clone the repository and run OpenCode directly from it. The repository's own `opencode.json` is **schema-only**; the plugin source is loaded through `.opencode/plugins/` **auto-discovery**, so source edits take effect without any package registration:

```bash
git clone https://github.com/MoeShimaKaze/oc-advisor.git
cd oc-advisor
bun install
opencode
```

To verify your build and run the tests:

```bash
bun run build    # outputs dist/plugin.js
bun test         # runs the unit tests
bun run typecheck
```

The bundle `dist/plugin.js` is what Git installs receive (built automatically by the `prepare` lifecycle). It is **not committed** to the repository, and `@opencode/plugin` is externalized, so it is resolved from the OpenCode runtime, not bundled.

---

## Configuring the Advisor Model

### Defaults

| Setting | Default |
|---------|---------|
| `advisorModel` | `opencode-go/kimi-k2.7-code` |
| `maxCallsPerSession` | `20` |
| `transcriptCharBudget` | `20000` |

The default is Kimi K2.7 Code, available under the OpenCode Go provider.

### How to override

Set the options inside your `plugins` entry in `opencode.json` (project-local or global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:MoeShimaKaze/oc-advisor#<commit>",
      "options": {
        "advisorModel": "opencode-go/glm-5.2",
        "maxCallsPerSession": 30,
        "transcriptCharBudget": 30000
      }
    }
  ]
}
```

Options are read **only** from `plugins[].options` (exposed to the plugin as `ctx.options`). There is no side-file, no environment variable, and no fallback config source. Invalid or missing individual values fall back to the defaults; an invalid `advisorModel` format is rejected at plugin load time.

### Example advisor models

| Model | Setting string | Intended use |
|-------|----------------|--------------|
| Kimi K2.7 Code (default) | `opencode-go/kimi-k2.7-code` | Coding-focused, available via OpenCode Go subscription |
| GLM-5.2 | `opencode-go/glm-5.2` | General-purpose high-intelligence model in OpenCode Go |
| DeepSeek V4 Pro | `opencode-go/deepseek-v4-pro` | Reasoning-heavy tasks |
| Claude Opus | `anthropic/claude-opus-4-20250514` | Anthropic alternative (requires Anthropic provider auth) |

### ⚠️ Important configuration notes

- Options live **beside the package reference** in the V2 `plugins` object form (`{ "package": ..., "options": ... }`). The V1 `"plugin": ["oc-advisor"]` string-array form and the old side-file (`.opencode/oc-advisor.json`, `~/.config/opencode/oc-advisor.json`) are **removed** and no longer read.
- `advisorModel` must use the `provider/model` format (e.g. `opencode-go/kimi-k2.7-code`). It is split on the first `/` into provider ID and model ID, so IDs like `lmstudio/google/gemma-3n-e4b` (where the model side contains `/`) are also supported.
- An invalid `advisorModel` (no `/`, empty string, etc.) will cause an error at plugin load time.
- Config is loaded at plugin startup. After editing `opencode.json`, **restart OpenCode** for changes to take effect.

---

## `/advisor` Command — Configuration Guidance

`/advisor` is a programmatically registered command (via `ctx.command.transform`) that **reports the current advisor configuration and explains how to change it**. It does not call the advisor model.

```
/advisor
```

When executed, the plugin submits a configuration summary into the current session containing:

1. The current values of `advisorModel` / `maxCallsPerSession` / `transcriptCharBudget` (from `plugins[].options`, or defaults for unset values)
2. How to change them (edit the `plugins[].options` entry in `opencode.json`)
3. A note that `ask_advisor` is the only path that consults the advisor model

OpenCode commands cannot rewrite config files directly. The user follows the guidance and manually edits the `plugins` entry. After editing, **OpenCode must be restarted** (config is loaded at startup, not hot-reloaded).

---

## `ask_advisor` Tool — The Sole Query Path

A tool the executor model calls autonomously. It is registered once in OpenCode's tool list as `ask_advisor` (via `ctx.tool.transform`) with a JSON Schema declaring `question` (required string) and `context` (optional string).

When the tool executes, it:

1. Checks the **per-session call limit** via a two-phase quota (`tryAcquire`). If the limit is reached, it returns a concise block response immediately — no transcript read and no advisor model call, so no cost.
2. Reads the current session's **visible conversation context** through the V2 `ctx.session.context` API and extracts a transcript (on failure, refunds the quota slot and exits).
3. Truncates the transcript to `transcriptCharBudget` characters (**discards the oldest content, keeps the most recent N characters**).
4. Builds a single combined prompt (advisor instructions + transcript + your question) and runs advisor inference through **`ctx.generate.text`**. This is a stateless generation call: it **creates no child session, invokes no tools, and writes nothing into the current session history** — the advisor's prompt and response never pollute your conversation.
5. On success, commits the quota slot and returns `{ content, metadata }` where `content` is the advisor's advice and `metadata` includes the advisor model and remaining quota.
6. On any failure or cancellation (transcript read, generation, user abort), **refunds the quota slot** and returns a concise error that never exposes credentials, auth headers, or raw provider errors.

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

- When the limit is reached, subsequent calls return a short "Advisor call limit reached" message without reading context or invoking the advisor model.
- The limit is per-session; starting a new session resets it. Quota state is in-memory per plugin instance (not persisted).
- **Two-phase commit with refund**: a slot is reserved (`tryAcquire`) before any I/O, committed only after the advisor response is successfully extracted, and **refunded on every failure or cancellation**. Consecutive transient failures will never permanently disable the advisor for the session.

### 2. Transcript character budget (`transcriptCharBudget`)

Character limit for the transcript sent to the advisor. Default: **20,000 characters**.

- When the conversation grows long, **the oldest content is discarded and the most recent N characters** are kept.
- Prevents output token explosions from long transcripts.

### Configuration example

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:MoeShimaKaze/oc-advisor#<commit>",
      "options": {
        "advisorModel": "opencode-go/glm-5.2",
        "maxCallsPerSession": 30,
        "transcriptCharBudget": 30000
      }
    }
  ]
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

All logic is unit-tested. Tests live under `test/`:

| Test file | Module |
|-----------|--------|
| `test/model_id.test.ts` | `src/model_id.ts` |
| `test/config.test.ts` | `src/config.ts` |
| `test/rate_limiter.test.ts` | `src/rate_limiter.ts` |
| `test/transcript.test.ts` | `src/transcript.ts` |
| `test/prompt.test.ts` | `src/prompt.ts` |
| `test/plugin.test.ts` | `.opencode/plugins/advisor.ts` (V2 registration, quota, refund/cancel paths) |
| `test/package.test.ts` | `package.json` (V2 dependency, build/prepare contract) |

Pure `src/` calculations and the plugin's mock-driven behavior are covered. Loading in a real OpenCode runtime and a real advisor call are release-acceptance steps (see below).

### Type checking

```bash
bun run typecheck
```

Strict mode, zero errors.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---------|------------|
| Bare package name fails (`404` on `oc-advisor`) | A bare `oc-advisor` string is resolved as an **npm package** that doesn't exist. Always use the full Git spec `github:MoeShimaKaze/oc-advisor#<commit>` inside the `plugins` object form. |
| Options not applied | Options must be inside `plugins[].options`. The V1 side-file (`.opencode/oc-advisor.json` / `~/.config/opencode/oc-advisor.json`) is **no longer read** — move those values into `plugins[].options`. |
| Advisor doesn't respond / auth error | The advisor provider's API key is not configured. Run `opencode auth` to check authentication for the target provider. |
| Invalid advisor model ID | Verify that `advisorModel` is in `provider/model` format and not empty. Strings without `/` are rejected at load time. |
| Advisor call limit reached | `ask_advisor` returns "Advisor call limit reached for this session." Raise `maxCallsPerSession` or start a new session. |
| Config changes not applied | Config is loaded at plugin startup. **Restart OpenCode** after editing `opencode.json`. |
| `ask_advisor` not in tool list | Check that the `plugins` entry uses the full Git spec with a valid pinned SHA, and that Bun is available so the `prepare` build can produce `dist/plugin.js`. |
| Advisor response appears in session history | It should not. Advisor inference uses `ctx.generate.text`, which does not write to session history. If you observe pollution, report it with your OpenCode version — do not modify the plugin to post into the session. |

---

## Verification (Release Acceptance)

The following checks are part of the release process. Unit tests, typecheck, and build are run continuously during development; **real OpenCode loading and real advisor calls are acceptance steps**, not claims — they are performed and evidenced before a release is finalized:

1. `bun test`, `bun run typecheck`, `bun run build` all pass.
2. Package checks: dependency is `@opencode/plugin` 2.0.24 exactly, build entry `dist/plugin.js` valid, `dist/` not committed.
3. OpenCode 2.0.24 loads the plugin: stable ID `oc-advisor`, `ask_advisor` registered exactly once, no V1 default-export errors, no bare-package 404.
4. A real `ask_advisor` call with a configured provider returns advice from the configured advisor model.
5. **Session non-pollution**: the advisor request and response do not appear in the current session history after a real call.

---

## License

MIT

---

## References

- Claude Code advisor tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool
- OpenCode V2 plugin guide: https://opencode.ai/v2/docs/build/plugins
- OpenCode V2 plugin configuration: https://opencode.ai/v2/docs/plugins
- OpenCode V1 → V2 plugin migration: https://opencode.ai/v2/docs/build/plugins/migrate-v1
- OpenCode config schema: https://opencode.ai/config.json
