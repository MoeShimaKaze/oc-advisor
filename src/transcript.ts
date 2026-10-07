export type TranscriptMessage = {
  readonly role: string;
  readonly text?: string;
  readonly content?: ReadonlyArray<TranscriptContent>;
  readonly [key: string]: unknown;
};

export type TranscriptContent = {
  readonly type: string;
  readonly text?: string;
  readonly [key: string]: unknown;
};

function directText(message: TranscriptMessage): string {
  const hasDirectTextRole =
    message.role === "user" || message.role === "system" || message.role === "synthetic";
  return hasDirectTextRole && typeof message.text === "string" ? message.text : "";
}

function assistantText(message: TranscriptMessage): string {
  if (message.role !== "assistant" || message.content === undefined) return "";
  return message.content
    .filter(
      (item): item is TranscriptContent & { readonly text: string } =>
        item.type === "text" && typeof item.text === "string" && item.text.length > 0,
    )
    .map((item) => item.text)
    .join(" ");
}

export function extractTranscript(messages: ReadonlyArray<TranscriptMessage>): string {
  return messages
    .map((message) => {
      const text = directText(message) || assistantText(message);
      return text.length === 0 ? "" : `[${message.role}] ${text}`;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

export function truncate(text: string, budget: number): string {
  if (budget <= 0) return "";
  if (text.length <= budget) return text;
  return text.slice(text.length - budget);
}

export function extractTranscriptThenTruncate(
  messages: ReadonlyArray<TranscriptMessage>,
  budget: number,
): string {
  return truncate(extractTranscript(messages), budget);
}
