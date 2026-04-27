import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import type { IContextTool, ToolResult } from "../types/tool";
import { truncateLines } from "../utils/truncate";

const execFileAsync = promisify(execFile);

const InputSchema = z.object({
  staged: z.boolean().optional(),
  args: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  maxLines: z.number().int().positive().optional(),
  cwd: z.string().optional(),
});

type GitDiffInput = z.infer<typeof InputSchema>;

interface GitDiffData {
  diff: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  totalLines: number;
}

export const gitDiffTool: IContextTool<GitDiffInput, GitDiffData> = {
  name: "git-diff",
  description: "Get git diff output for staged changes, a range, or specific files",
  inputSchema: InputSchema,

  async execute(input: GitDiffInput): Promise<ToolResult & { data: GitDiffData }> {
    const start = Date.now();
    try {
      const args = buildArgs(input);
      const { stdout } = await execFileAsync("git", args, {
        cwd: input.cwd ?? process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      });

      const diff = input.maxLines
        ? truncateLines(stdout, input.maxLines)
        : stdout;

      const filesChanged = extractFiles(stdout);
      const { additions, deletions } = countChanges(stdout);

      return {
        toolName: "git-diff",
        success: true,
        data: {
          diff,
          filesChanged,
          additions,
          deletions,
          totalLines: stdout.split("\n").length,
        },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: "git-diff",
        success: false,
        data: { diff: "", filesChanged: [], additions: 0, deletions: 0, totalLines: 0 },
        error: String(err),
        durationMs: Date.now() - start,
      };
    }
  },
};

function buildArgs(input: GitDiffInput): string[] {
  const args = ["diff"];
  if (input.staged) args.push("--staged");
  if (input.args?.length) args.push(...input.args);
  if (input.files?.length) {
    args.push("--");
    args.push(...input.files);
  }
  return args;
}

function extractFiles(diff: string): string[] {
  const files: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      files.push(line.slice(6));
    }
  }
  return [...new Set(files)];
}

function countChanges(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
}
