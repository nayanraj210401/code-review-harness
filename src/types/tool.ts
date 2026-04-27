import type { ZodSchema } from "zod";

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  data: unknown;
  error?: string;
  durationMs: number;
}

export interface IContextTool<
  TInput extends ToolInput = ToolInput,
  TData = unknown,
> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodSchema<TInput>;
  execute(input: TInput): Promise<ToolResult & { data: TData }>;
}

export interface ToolManifest {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
