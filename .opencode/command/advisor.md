---
description: Show the current advisor model setting and explain how to change it
---
The user invoked `/advisor` to check or change which higher-intelligence model the `ask_advisor` tool consults.

Read the `opencode.json` at the workspace root and report, concisely:

1. The `advisorModel` currently set in the `plugin` options tuple (the entry pointing to `.opencode/plugin/advisor.ts`).
2. The current `maxCallsPerSession` and `transcriptCharBudget` values.
3. How to change the advisor model: edit the `advisorModel` field inside that tuple in `opencode.json`, then restart opencode. Use the `provider/model` form (for example `opencode-go/kimi-k2.7-code`, `opencode-go/glm-5.2`, `anthropic/claude-opus-4-20250514`).
4. The relationship to the `ask_advisor` tool: this command does **not** query the advisor model. The actual consultation is performed automatically by the executor model via the `ask_advisor` tool when it gets stuck. `/advisor` only configures which model that tool uses.

Important: do not modify `opencode.json` yourself. Only explain the steps so the user can edit it by hand.

$ARGUMENTS