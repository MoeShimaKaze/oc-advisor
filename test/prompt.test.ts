import { describe, expect, test } from "bun:test";
import { ADVISOR_SYSTEM_PROMPT, buildAdvisorPrompt } from "../src/prompt";

describe("buildAdvisorPrompt", () => {
  test("should return one composed prompt containing the fixed advisor instruction", () => {
    const prompt = buildAdvisorPrompt({ transcript: "t", question: "q" });

    expect(typeof prompt).toBe("string");
    expect(prompt).toContain(ADVISOR_SYSTEM_PROMPT);
    expect(prompt).toContain("advisor");
  });

  test("should include transcript and question sections", () => {
    const prompt = buildAdvisorPrompt({ transcript: "TLINE", question: "Do we split services?" });

    expect(prompt).toContain("## Current Session Transcript\nTLINE");
    expect(prompt).toContain("## Question\nDo we split services?");
  });

  test("should include additional context only when context is provided", () => {
    const withContext = buildAdvisorPrompt({
      transcript: "t",
      question: "q",
      context: "extra hint",
    });
    const withoutContext = buildAdvisorPrompt({ transcript: "t", question: "q" });

    expect(withContext).toContain("## Additional Context\nextra hint");
    expect(withoutContext).not.toContain("## Additional Context");
  });

  test("should preserve double-newline section composition", () => {
    const prompt = buildAdvisorPrompt({ transcript: "TLINE", question: "Q?", context: "C" });
    const sections = prompt.split("\n\n");

    expect(sections[0]).toBe(ADVISOR_SYSTEM_PROMPT);
    expect(sections[1]).toBe("## Current Session Transcript\nTLINE");
    expect(sections[2]).toBe("## Question\nQ?");
    expect(sections[3]).toBe("## Additional Context\nC");
  });
});
