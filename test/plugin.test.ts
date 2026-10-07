import { describe, expect, test } from "bun:test";
import type { Plugin } from "@opencode/plugin";

import advisorPlugin from "../.opencode/plugins/advisor";

type ToolResult = {
  readonly content?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

type ToolExecutionContext = {
  readonly sessionID: string;
  readonly signal: AbortSignal;
};

type AddedTool = {
  readonly name: string;
  readonly description: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly execute: (
    input: unknown,
    context: ToolExecutionContext,
  ) => Promise<ToolResult>;
};

type AddedCommand = {
  readonly name: string;
  readonly description?: string;
  readonly execute: (input: {
    readonly sessionID: string;
    readonly prompt: unknown;
    readonly delivery: "steer" | "queue";
  }) => Promise<void>;
};

type GenerateCall = {
  readonly input: {
    readonly prompt: string;
    readonly model?: {
      readonly providerID: string;
      readonly id: string;
    } | null;
  };
  readonly requestOptions?: { readonly signal?: AbortSignal };
};

type HarnessOptions = {
  readonly pluginOptions?: Readonly<Record<string, unknown>>;
  readonly getContext?: (sessionID: string) => Promise<readonly unknown[]>;
  readonly generate?: (call: GenerateCall) => Promise<{ readonly text: string }>;
};

const createHarness = async (options: HarnessOptions = {}) => {
  const tools: AddedTool[] = [];
  const commands: AddedCommand[] = [];
  const contextCalls: string[] = [];
  const generateCalls: GenerateCall[] = [];
  const promptCalls: Array<{
    readonly sessionID: string;
    readonly text: string;
    readonly delivery: "steer" | "queue";
  }> = [];

  const context = {
    options: options.pluginOptions ?? {},
    tool: {
      transform: async (transform: (editor: { add: (tool: AddedTool) => void }) => void) => {
        transform({ add: (tool) => tools.push(tool) });
        return { dispose: async () => undefined };
      },
    },
    command: {
      transform: async (
        transform: (editor: { add: (command: AddedCommand) => void }) => void,
      ) => {
        transform({ add: (command) => commands.push(command) });
        return { dispose: async () => undefined };
      },
    },
    session: {
      context: async ({ sessionID }: { readonly sessionID: string }) => {
        contextCalls.push(sessionID);
        return options.getContext?.(sessionID) ?? [];
      },
      prompt: async (input: {
        readonly sessionID: string;
        readonly text: string;
        readonly delivery: "steer" | "queue";
      }) => {
        promptCalls.push(input);
      },
    },
    generate: {
      text: async (
        input: GenerateCall["input"],
        requestOptions?: GenerateCall["requestOptions"],
      ) => {
        const call = { input, requestOptions };
        generateCalls.push(call);
        return options.generate?.(call) ?? { text: "advisor response" };
      },
    },
  };

  await advisorPlugin.setup(context as unknown as Plugin.Context);

  return {
    tools,
    commands,
    contextCalls,
    generateCalls,
    promptCalls,
  };
};

const executionContext = (sessionID = "session-1") => ({
  sessionID,
  signal: new AbortController().signal,
});

describe("oc-advisor V2 plugin", () => {
  test("defines a stable plugin id and registers one JSON Schema tool and command", async () => {
    const harness = await createHarness();

    expect(advisorPlugin.id).toBe("oc-advisor");
    expect(harness.tools).toHaveLength(1);
    expect(harness.tools[0]?.name).toBe("ask_advisor");
    expect(harness.tools[0]?.input).toEqual({
      type: "object",
      properties: {
        question: { type: "string", minLength: 1 },
        context: { type: "string" },
      },
      required: ["question"],
      additionalProperties: false,
    });
    expect(harness.commands).toHaveLength(1);
    expect(harness.commands[0]?.name).toBe("advisor");
  });

  test("uses ctx.options, current session context, selected model, and abort signal", async () => {
    const signal = new AbortController().signal;
    const harness = await createHarness({
      pluginOptions: {
        advisorModel: "anthropic/claude-sonnet",
        maxCallsPerSession: 2,
        transcriptCharBudget: 500,
      },
      getContext: async () => [
        { type: "user", text: "current problem" },
        {
          type: "assistant",
          content: [
            { type: "reasoning", text: "private reasoning" },
            { type: "text", text: "visible answer" },
          ],
        },
      ],
      generate: async () => ({ text: "use the simpler design" }),
    });

    const result = await harness.tools[0]?.execute(
      { question: "Which approach?", context: "Prefer low risk." },
      { sessionID: "session-42", signal },
    );

    expect(harness.contextCalls).toEqual(["session-42"]);
    expect(harness.generateCalls).toHaveLength(1);
    expect(harness.generateCalls[0]?.input.model).toEqual({
      providerID: "anthropic",
      id: "claude-sonnet",
    });
    expect(harness.generateCalls[0]?.input.prompt).toContain("current problem");
    expect(harness.generateCalls[0]?.input.prompt).toContain("visible answer");
    expect(harness.generateCalls[0]?.input.prompt).not.toContain("private reasoning");
    expect(harness.generateCalls[0]?.input.prompt).toContain("Which approach?");
    expect(harness.generateCalls[0]?.input.prompt).toContain("Prefer low risk.");
    expect(harness.generateCalls[0]?.requestOptions?.signal).toBe(signal);
    expect(result).toEqual({
      content: "use the simpler design",
      metadata: {
        model: "anthropic/claude-sonnet",
        remaining: 1,
      },
    });
  });

  test("registers /advisor as configuration guidance using the invocation delivery", async () => {
    const harness = await createHarness();

    await harness.commands[0]?.execute({
      sessionID: "session-command",
      prompt: [],
      delivery: "queue",
    });

    expect(harness.promptCalls).toHaveLength(1);
    expect(harness.promptCalls[0]).toEqual({
      sessionID: "session-command",
      text: expect.stringContaining("plugins[].options"),
      delivery: "queue",
    });
    expect(harness.promptCalls[0]?.text).toContain("advisorModel");
    expect(harness.generateCalls).toHaveLength(0);
  });

  test("refunds the reservation when session context loading fails", async () => {
    let shouldFail = true;
    const harness = await createHarness({
      pluginOptions: { maxCallsPerSession: 1 },
      getContext: async () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("database connection details");
        }
        return [];
      },
    });

    const first = await harness.tools[0]?.execute(
      { question: "First attempt" },
      executionContext(),
    );
    const second = await harness.tools[0]?.execute(
      { question: "Second attempt" },
      executionContext(),
    );

    expect(first?.content).toBe("Advisor request failed. Please try again.");
    expect(first?.content).not.toContain("database");
    expect(second?.content).toBe("advisor response");
    expect(harness.contextCalls).toHaveLength(2);
    expect(harness.generateCalls).toHaveLength(1);
  });

  test("refunds the reservation and hides details when generation fails", async () => {
    let shouldFail = true;
    const harness = await createHarness({
      pluginOptions: { maxCallsPerSession: 1 },
      generate: async () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("provider credential leaked");
        }
        return { text: "advisor response" };
      },
    });

    const first = await harness.tools[0]?.execute(
      { question: "First attempt" },
      executionContext(),
    );
    const second = await harness.tools[0]?.execute(
      { question: "Second attempt" },
      executionContext(),
    );

    expect(first?.content).toBe("Advisor request failed. Please try again.");
    expect(first?.content).not.toContain("credential");
    expect(second?.content).toBe("advisor response");
    expect(harness.generateCalls).toHaveLength(2);
  });

  test("refunds the reservation after cancellation", async () => {
    let shouldAbort = true;
    const harness = await createHarness({
      pluginOptions: { maxCallsPerSession: 1 },
      generate: async () => {
        if (shouldAbort) {
          shouldAbort = false;
          const error = new Error("cancelled request internals");
          error.name = "AbortError";
          throw error;
        }
        return { text: "advisor response" };
      },
    });

    const first = await harness.tools[0]?.execute(
      { question: "Cancelled attempt" },
      executionContext(),
    );
    const second = await harness.tools[0]?.execute(
      { question: "Retry" },
      executionContext(),
    );

    expect(first?.content).toBe("Advisor request cancelled.");
    expect(first?.content).not.toContain("internals");
    expect(second?.content).toBe("advisor response");
    expect(harness.generateCalls).toHaveLength(2);
  });

  test("does not load context or generate after the per-session limit is exhausted", async () => {
    const harness = await createHarness({
      pluginOptions: { maxCallsPerSession: 1 },
    });

    const first = await harness.tools[0]?.execute(
      { question: "Allowed" },
      executionContext("limited-session"),
    );
    const second = await harness.tools[0]?.execute(
      { question: "Blocked" },
      executionContext("limited-session"),
    );

    expect(first?.content).toBe("advisor response");
    expect(second).toEqual({
      content: "Advisor call limit reached for this session.",
      metadata: { remaining: 0 },
    });
    expect(harness.contextCalls).toHaveLength(1);
    expect(harness.generateCalls).toHaveLength(1);
  });
});
