import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import type { IContextTool, ToolResult } from "../types/tool";

const execFileAsync = promisify(execFile);

const InputSchema = z.object({
  pattern: z.string().min(1),
  paths: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  maxResults: z.number().int().positive().max(200).optional(),
});

type GrepInput = z.infer<typeof InputSchema>;

interface GrepData {
  matches: Array<{ file: string; line: number; content: string }>;
  totalMatches: number;
}

export const grepContextTool: IContextTool<GrepInput, GrepData> = {
  name: "grep-context",
  description: "Search for a pattern in files using grep/ripgrep",
  inputSchema: InputSchema,

  async execute(input: GrepInput): Promise<ToolResult & { data: GrepData }> {
    const start = Date.now();
    try {
      const args = [
        "-rn",
        "--no-heading",
        "-m",
        String(input.maxResults ?? 50),
        input.pattern,
        ...(input.paths ?? ["."]),
      ];

      const { stdout } = await execFileAsync("grep", args, {
        cwd: input.cwd ?? process.cwd(),
        maxBuffer: 1024 * 1024,
      }).catch(() => ({ stdout: "" }));

      const matches = stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [file, lineNum, ...rest] = line.split(":");
          return {
            file: file ?? "",
            line: parseInt(lineNum ?? "0", 10),
            content: rest.join(":").trim(),
          };
        });

      return {
        toolName: "grep-context",
        success: true,
        data: { matches, totalMatches: matches.length },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: "grep-context",
        success: false,
        data: { matches: [], totalMatches: 0 },
        error: String(err),
        durationMs: Date.now() - start,
      };
    }
  },
};
