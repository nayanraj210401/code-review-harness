import type { IContextTool, ToolInput, ToolResult } from "../types/tool";

const _tools = new Map<string, IContextTool>();

export function registerTool(tool: IContextTool): void {
  _tools.set(tool.name, tool);
}

export function getTool(name: string): IContextTool | undefined {
  return _tools.get(name);
}

export function listTools(): IContextTool[] {
  return [..._tools.values()];
}

export async function executeTool(
  name: string,
  input: ToolInput,
): Promise<ToolResult> {
  const tool = _tools.get(name);
  if (!tool) {
    return {
      toolName: name,
      success: false,
      data: null,
      error: `Tool "${name}" not found`,
      durationMs: 0,
    };
  }

  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      toolName: name,
      success: false,
      data: null,
      error: `Invalid input: ${parsed.error.message}`,
      durationMs: 0,
    };
  }

  return tool.execute(parsed.data);
}
