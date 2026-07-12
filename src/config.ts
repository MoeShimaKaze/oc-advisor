import { parseModelID } from "./model_id";

export type AdvisorConfig = {
  readonly advisorModel: string;
  readonly maxCallsPerSession: number;
  readonly transcriptCharBudget: number;
};

export const DEFAULT_ADVISOR_CONFIG: AdvisorConfig = {
  advisorModel: "opencode-go/kimi-k2.7-code",
  maxCallsPerSession: 20,
  transcriptCharBudget: 20000,
};

type RawOptions = {
  readonly advisorModel?: unknown;
  readonly maxCallsPerSession?: unknown;
  readonly transcriptCharBudget?: unknown;
  readonly [key: string]: unknown;
};

function isPlainObject(value: unknown): value is RawOptions {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function pickPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function parseAdvisorConfig(opts?: unknown): AdvisorConfig {
  if (!isPlainObject(opts)) {
    return DEFAULT_ADVISOR_CONFIG;
  }

  const advisorModel = pickString(opts.advisorModel, DEFAULT_ADVISOR_CONFIG.advisorModel);
  parseModelID(advisorModel);

  return {
    advisorModel,
    maxCallsPerSession: pickPositiveNumber(opts.maxCallsPerSession, DEFAULT_ADVISOR_CONFIG.maxCallsPerSession),
    transcriptCharBudget: pickPositiveNumber(opts.transcriptCharBudget, DEFAULT_ADVISOR_CONFIG.transcriptCharBudget),
  };
}