import type { Plugin, ToolContext } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import type { Part, TextPart } from "@opencode-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AdvisorConfig } from "../../src/config";
import { DEFAULT_ADVISOR_CONFIG, parseAdvisorConfig, parseAdvisorConfigJSON } from "../../src/config";
import { parseModelID } from "../../src/model_id";
import { RateLimiter } from "../../src/rate_limiter";
import { extractTranscriptThenTruncate } from "../../src/transcript";
import { buildAdvisorPrompt } from "../../src/prompt";

const BLOCKED_TITLE = "Advisor blocked";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readConfigFile(directory: string): AdvisorConfig {
  const candidates = [
    join(directory, ".opencode", "oc-advisor.json"),
    join(homedir(), ".config", "opencode", "oc-advisor.json"),
  ];
  for (const path of candidates) {
    try {
      const text = readFileSync(path, "utf-8");
      return parseAdvisorConfigJSON(text);
    } catch {
      // try next
    }
  }
  return DEFAULT_ADVISOR_CONFIG;
}

const advisor: Plugin = async ({ client, directory }, options) => {
  const config: AdvisorConfig = isPlainObject(options)
    ? parseAdvisorConfig(options)
    : readConfigFile(directory);
  const { providerID, modelID } = parseModelID(config.advisorModel);
  const limiter = new RateLimiter(config.maxCallsPerSession);

  const extractAdvisorText = (parts: ReadonlyArray<Part>): string =>
    parts
      .filter((p: Part): p is TextPart => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();

  return {
    tool: {
      ask_advisor: tool({
        description:
          "Consult a senior advisor model for strategic guidance, architecture review, a second opinion, or a course correction when you are stuck or unsure. Use this sparingly, only when a non-obvious design decision or hidden risk is in play. The advisor runs on a separate, higher-intelligence model and receives the current session transcript plus your question.",
        args: {
          question: tool.schema
            .string()
            .describe("The specific question or decision you want advice on. Be concrete."),
          context: tool.schema
            .string()
            .optional()
            .describe("Optional extra context: file paths, code snippets, prior decisions, or constraints the advisor should weigh."),
        },
        async execute(args, ctx: ToolContext) {
          const acquired = limiter.tryAcquire(ctx.sessionID);
          if (!acquired.allowed) {
            return {
              title: BLOCKED_TITLE,
              output: `Advisor call limit (${config.maxCallsPerSession}) reached for this session. Raise "maxCallsPerSession" in .opencode/oc-advisor.json, or start a new session.`,
            };
          }

          const messagesResult = await client.session.messages({
            path: { id: ctx.sessionID },
          });
          if (messagesResult.error) {
            limiter.refund(ctx.sessionID);
            return {
              title: "Advisor error",
              output: `Failed to read session transcript: ${String(messagesResult.error)}`,
            };
          }

          const transcript = extractTranscriptThenTruncate(
            messagesResult.data ?? [],
            config.transcriptCharBudget,
          );
          const { system, user } = buildAdvisorPrompt({
            transcript,
            question: args.question,
            context: args.context,
          });

          const sessionResult = await client.session.create({
            body: { parentID: ctx.sessionID, title: "advisor" },
          });
          if (sessionResult.error) {
            limiter.refund(ctx.sessionID);
            return {
              title: "Advisor error",
              output: `Failed to open advisor session: ${String(sessionResult.error)}`,
            };
          }

          const childID = sessionResult.data.id;

          try {
            const promptResult = await client.session.prompt({
              path: { id: childID },
              body: {
                model: { providerID, modelID },
                system,
                parts: [{ type: "text", text: user }],
              },
            });
            if (promptResult.error) {
              limiter.refund(ctx.sessionID);
              return {
                title: "Advisor error",
                output: `Advisor model (${config.advisorModel}) failed: ${String(promptResult.error)}`,
              };
            }

            const text = extractAdvisorText(promptResult.data?.parts ?? []);
            limiter.commit(ctx.sessionID);
            return {
              title: `Advisor Response (${config.advisorModel})`,
              output: text.length > 0 ? text : "(advisor returned no text response)",
            };
          } finally {
            await client.session
              .delete({ path: { id: childID } })
              .catch(() => undefined);
          }
        },
      }),
    },
  };
};

export default advisor;