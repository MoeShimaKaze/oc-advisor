import { Plugin } from "@opencode/plugin";

import { parseAdvisorConfig } from "../../src/config";
import { parseModelID } from "../../src/model_id";
import { buildAdvisorPrompt } from "../../src/prompt";
import { RateLimiter } from "../../src/rate_limiter";
import {
  extractTranscriptThenTruncate,
  type TranscriptMessage,
} from "../../src/transcript";

const TOOL_DESCRIPTION =
  "Consult a senior advisor model for strategic guidance, architecture review, a second opinion, or a course correction when a non-obvious decision or hidden risk is in play.";

const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string", minLength: 1 },
    context: { type: "string" },
  },
  required: ["question"],
  additionalProperties: false,
} as const;

type AdvisorInput = {
  readonly question: string;
  readonly context?: string;
};

type SessionMessage = Awaited<
  ReturnType<Plugin.Context["session"]["context"]>
>[number];

function toTranscriptMessage(message: SessionMessage): TranscriptMessage {
  switch (message.type) {
    case "user":
    case "system":
    case "synthetic":
      return { role: message.type, text: message.text };
    case "assistant":
      return {
        role: message.type,
        content: message.content.map((item) =>
          item.type === "text"
            ? { type: item.type, text: item.text }
            : { type: item.type },
        ),
      };
    default:
      return { role: message.type };
  }
}

function wasCancelled(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

const advisorPlugin = Plugin.define({
  id: "oc-advisor",
  async setup(ctx) {
    const config = parseAdvisorConfig(ctx.options);
    const model = parseModelID(config.advisorModel);
    const limiter = new RateLimiter(config.maxCallsPerSession);

    const toolRegistration = await ctx.tool.transform((editor) => {
      editor.add({
        name: "ask_advisor",
        description: TOOL_DESCRIPTION,
        input: TOOL_INPUT_SCHEMA,
        async execute(rawInput, toolContext) {
          const input = rawInput as AdvisorInput;
          const acquired = limiter.tryAcquire(toolContext.sessionID);
          if (!acquired.allowed) {
            return {
              content: "Advisor call limit reached for this session.",
              metadata: { remaining: 0 },
            };
          }

          try {
            const messages = await ctx.session.context({
              sessionID: toolContext.sessionID,
            });
            const transcript = extractTranscriptThenTruncate(
              messages.map(toTranscriptMessage),
              config.transcriptCharBudget,
            );
            const prompt = buildAdvisorPrompt({
              transcript,
              question: input.question,
              context: input.context,
            });
            const result = await ctx.generate.text(
              { prompt, model },
              { signal: toolContext.signal },
            );

            limiter.commit(toolContext.sessionID);
            return {
              content: result.text,
              metadata: {
                model: config.advisorModel,
                remaining: acquired.remaining,
              },
            };
          } catch (error) {
            limiter.refund(toolContext.sessionID);
            return {
              content: wasCancelled(error, toolContext.signal)
                ? "Advisor request cancelled."
                : "Advisor request failed. Please try again.",
              metadata: { remaining: acquired.remaining + 1 },
            };
          }
        },
      });
    });

    const commandRegistration = await ctx.command.transform((editor) => {
      editor.add({
        name: "advisor",
        description: "Show how to configure the oc-advisor plugin.",
        async execute(input) {
          await ctx.session.prompt({
            sessionID: input.sessionID,
            delivery: input.delivery,
            text: [
              "oc-advisor reads configuration only from its plugins[].options entry in opencode.json.",
              `Current advisorModel: ${config.advisorModel}`,
              `Current maxCallsPerSession: ${config.maxCallsPerSession}`,
              `Current transcriptCharBudget: ${config.transcriptCharBudget}`,
              "Edit advisorModel using provider/model form, then restart OpenCode. The /advisor command only explains configuration; ask_advisor performs consultations.",
            ].join("\n"),
          });
        },
      });
    });

    return async () => {
      await Promise.all([
        toolRegistration.dispose(),
        commandRegistration.dispose(),
      ]);
    };
  },
});

export default advisorPlugin;
