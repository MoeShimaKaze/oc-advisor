import { describe, expect, test } from "bun:test";
import {
  extractTranscript,
  extractTranscriptThenTruncate,
  truncate,
} from "../src/transcript";

describe("extractTranscript", () => {
  test("should extract user, system, and synthetic message text", () => {
    const messages = [
      { role: "user", text: "Hello" },
      { role: "system", text: "System note" },
      { role: "synthetic", text: "Injected context" },
    ];

    expect(extractTranscript(messages)).toBe(
      "[user] Hello\n[system] System note\n[synthetic] Injected context",
    );
  });

  test("should join multiple assistant text content items", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "First segment" },
          { type: "text", text: "Second segment" },
        ],
      },
    ];

    expect(extractTranscript(messages)).toBe("[assistant] First segment Second segment");
  });

  test("should ignore other message roles and non-text assistant content", () => {
    const messages = [
      { role: "assistant", content: [{ type: "tool", name: "shell", text: "not visible" }] },
      { role: "assistant", content: [{ type: "reasoning", text: "private reasoning" }] },
      { role: "assistant", content: [{ type: "status", text: "working" }] },
      { role: "tool", text: "tool result" },
      { role: "reasoning", text: "private" },
      { role: "shell", text: "command" },
      { role: "status", text: "busy" },
      { role: "other", text: "unknown" },
    ];

    expect(extractTranscript(messages)).toBe("");
  });

  test("should handle empty messages array", () => {
    expect(extractTranscript([])).toBe("");
  });

  test("should skip messages without visible text", () => {
    const messages = [
      { role: "user", text: "" },
      { role: "assistant", content: [] },
      { role: "assistant", content: [{ type: "text", text: "" }] },
    ];

    expect(extractTranscript(messages)).toBe("");
  });
});

describe("truncate", () => {
  test("should keep most recent content within char budget and drop oldest", () => {
    const text = "[user]aaa[assistant]bbb[user]ccc";
    expect(truncate(text, 10)).toBe(text.slice(text.length - 10));
  });

  test("should return full text when within budget", () => {
    expect(truncate("abcde", 100)).toBe("abcde");
  });

  test("should return empty string when budget is not positive", () => {
    expect(truncate("abc", 0)).toBe("");
    expect(truncate("abc", -5)).toBe("");
  });

  test("should return empty string for empty text", () => {
    expect(truncate("", 10)).toBe("");
  });
});

describe("extractTranscriptThenTruncate", () => {
  test("should extract V2 messages then keep the tail within the budget", () => {
    const messages = [
      { role: "user", text: "AAAAAAAAAA" },
      { role: "assistant", content: [{ type: "text", text: "BBBBBBBBBB" }] },
      { role: "user", text: "CCCCCCCCCC" },
    ];
    const transcript = extractTranscript(messages);

    expect(extractTranscriptThenTruncate(messages, 15)).toBe(truncate(transcript, 15));
  });

  test("should return empty string for empty messages with a budget", () => {
    expect(extractTranscriptThenTruncate([], 100)).toBe("");
  });
});
