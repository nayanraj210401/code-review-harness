import { registerFormatter, getFormatter } from "./base";
import { jsonFormatter } from "./json";
import { markdownFormatter } from "./markdown";
import { prettyFormatter } from "./pretty";
import { sarifFormatter } from "./sarif";

export function initFormatters(): void {
  registerFormatter(jsonFormatter);
  registerFormatter(markdownFormatter);
  registerFormatter(prettyFormatter);
  registerFormatter(sarifFormatter);
}

export { getFormatter };
