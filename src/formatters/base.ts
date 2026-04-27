import type { ReviewSession } from "../types/review";

export interface IFormatter {
  readonly name: string;
  readonly mimeType: string;
  readonly fileExtension: string;
  format(session: ReviewSession): string;
}

const _formatters = new Map<string, IFormatter>();

export function registerFormatter(f: IFormatter): void {
  _formatters.set(f.name, f);
}

export function getFormatter(name: string): IFormatter {
  const f = _formatters.get(name);
  if (!f) throw new Error(`Formatter "${name}" not registered`);
  return f;
}
