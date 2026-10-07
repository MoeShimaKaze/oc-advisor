export class InvalidModelError extends Error {
  readonly raw: string;

  constructor(raw: string) {
    super(`Invalid model id: ${raw}`);
    this.name = "InvalidModelError";
    this.raw = raw;
  }
}

export type ModelID = {
  readonly providerID: string;
  readonly id: string;
};

export function parseModelID(raw: string): ModelID {
  const i = raw.indexOf("/");
  if (i <= 0 || i === raw.length - 1) {
    throw new InvalidModelError(raw);
  }
  return {
    providerID: raw.slice(0, i),
    id: raw.slice(i + 1),
  };
}
