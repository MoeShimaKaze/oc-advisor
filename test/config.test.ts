import { describe, expect, test } from "bun:test";
import { InvalidModelError } from "../src/model_id";
import * as ConfigModule from "../src/config";
import { DEFAULT_ADVISOR_CONFIG, parseAdvisorConfig } from "../src/config";

describe("parseAdvisorConfig", () => {
  test("should return current V2 defaults when options are undefined", () => {
    expect(parseAdvisorConfig(undefined)).toEqual({
      advisorModel: "opencode-go/kimi-k2.7-code",
      maxCallsPerSession: 20,
      transcriptCharBudget: 20000,
    });
    expect(parseAdvisorConfig(undefined)).toEqual(DEFAULT_ADVISOR_CONFIG);
  });

  test("should override advisorModel when provided", () => {
    const cfg = parseAdvisorConfig({ advisorModel: "provider/model" });
    expect(cfg.advisorModel).toBe("provider/model");
    expect(cfg.maxCallsPerSession).toBe(20);
    expect(cfg.transcriptCharBudget).toBe(20000);
  });

  test("should override maxCallsPerSession with positive number", () => {
    expect(parseAdvisorConfig({ maxCallsPerSession: 5 }).maxCallsPerSession).toBe(5);
  });

  test("should fall back for invalid maxCallsPerSession values", () => {
    expect(parseAdvisorConfig({ maxCallsPerSession: 0 }).maxCallsPerSession).toBe(20);
    expect(parseAdvisorConfig({ maxCallsPerSession: -3 }).maxCallsPerSession).toBe(20);
  });

  test("should override transcriptCharBudget with positive number", () => {
    expect(parseAdvisorConfig({ transcriptCharBudget: 5000 }).transcriptCharBudget).toBe(5000);
  });

  test("should fall back for invalid transcriptCharBudget values", () => {
    expect(parseAdvisorConfig({ transcriptCharBudget: 0 }).transcriptCharBudget).toBe(20000);
  });

  test("should validate advisorModel format and throw when invalid", () => {
    expect(() => parseAdvisorConfig({ advisorModel: "no-slash-string" })).toThrow(InvalidModelError);
  });

  test("should ignore unknown keys in options", () => {
    expect(parseAdvisorConfig({ foo: "bar", advisorModel: "provider/model" })).toEqual({
      advisorModel: "provider/model",
      maxCallsPerSession: 20,
      transcriptCharBudget: 20000,
    });
  });

  test("should return defaults for non-object options", () => {
    expect(parseAdvisorConfig("foo")).toEqual(DEFAULT_ADVISOR_CONFIG);
    expect(parseAdvisorConfig(null)).toEqual(DEFAULT_ADVISOR_CONFIG);
  });

  test("should fall back for wrong-typed option values", () => {
    expect(parseAdvisorConfig({ advisorModel: 123 }).advisorModel).toBe("opencode-go/kimi-k2.7-code");
    expect(
      parseAdvisorConfig({ maxCallsPerSession: "20", transcriptCharBudget: "5000" }),
    ).toEqual(DEFAULT_ADVISOR_CONFIG);
  });
});

describe("V2 options-only configuration", () => {
  test("should not export a side-file JSON parser", () => {
    expect("parseAdvisorConfigJSON" in ConfigModule).toBe(false);
  });
});
