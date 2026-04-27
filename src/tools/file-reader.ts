import { existsSync, readFileSync } from "fs";
import { z } from "zod";
import type { IContextTool, ToolResult } from "../types/tool";

const InputSchema = z.object({
  paths: z.array(z.string()).min(1).max(20),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
});

type FileReaderInput = z.infer<typeof InputSchema>;

interface FileReaderData {
  files: Array<{ path: string; content: string; exists: boolean }>;
}

export const fileReaderTool: IContextTool<FileReaderInput, FileReaderData> = {
  name: "file-reader",
  description: "Read one or more files with optional line range",
  inputSchema: InputSchema,

  async execute(input: FileReaderInput): Promise<ToolResult & { data: FileReaderData }> {
    const start = Date.now();
    const files: FileReaderData["files"] = [];

    for (const path of input.paths) {
      if (!existsSync(path)) {
        files.push({ path, content: "", exists: false });
        continue;
      }
      let content = readFileSync(path, "utf8");
      if (input.lineStart !== undefined || input.lineEnd !== undefined) {
        const lines = content.split("\n");
        const from = (input.lineStart ?? 1) - 1;
        const to = input.lineEnd ?? lines.length;
        content = lines.slice(from, to).join("\n");
      }
      files.push({ path, content, exists: true });
    }

    return {
      toolName: "file-reader",
      success: true,
      data: { files },
      durationMs: Date.now() - start,
    };
  },
};
