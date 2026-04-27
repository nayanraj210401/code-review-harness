import { registerTool } from "./base";
import { gitDiffTool } from "./git-diff";
import { fileReaderTool } from "./file-reader";
import { grepContextTool } from "./grep-context";

export function initTools(): void {
  registerTool(gitDiffTool);
  registerTool(fileReaderTool);
  registerTool(grepContextTool);
}

export { registerTool, getTool, listTools, executeTool } from "./base";
