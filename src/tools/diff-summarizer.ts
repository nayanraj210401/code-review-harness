export interface FileChangeSummary {
  path: string;
  extension: string;
  additions: number;
  deletions: number;
  changeType: "added" | "modified" | "deleted" | "renamed";
}

export interface DiffSummary {
  filesChanged: FileChangeSummary[];
  totalAdditions: number;
  totalDeletions: number;
  languages: string[];
  keyTokens: string[];
  sizeCategory: "small" | "medium" | "large" | "xlarge";
  rawLines: number;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript/React", js: "JavaScript", jsx: "JavaScript/React",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin",
  cs: "C#", cpp: "C++", c: "C", php: "PHP", swift: "Swift", sol: "Solidity",
  sql: "SQL", sh: "Shell", yaml: "YAML", yml: "YAML", json: "JSON", md: "Markdown",
  html: "HTML", css: "CSS", scss: "CSS/SCSS",
};

// Extract meaningful tokens from changed lines to help routing
const TOKEN_PATTERNS: RegExp[] = [
  /import\s+\{([^}]+)\}/g,
  /from\s+['"]([^'"]+)['"]/g,
  /async\s+function\s+(\w+)/g,
  /class\s+(\w+)/g,
  /interface\s+(\w+)/g,
  /SELECT\b|INSERT\b|UPDATE\b|DELETE\b|DROP\b/gi,
  /eval\s*\(|exec\s*\(|spawn\s*\(/g,
  /password|secret|token|apiKey|api_key|credential/gi,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bauth\b|\blogin\b|\bsession\b|\bcookie\b|\bjwt\b/gi,
];

export function summarizeDiff(diff: string): DiffSummary {
  const lines = diff.split("\n");
  const rawLines = lines.length;

  const fileMap = new Map<string, FileChangeSummary>();
  const keyTokenSet = new Set<string>();
  let currentFile = "";

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/diff --git a\/.+ b\/(.+)/);
      if (m) currentFile = m[1];
      continue;
    }

    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6).trim();
      const ext = currentFile.split(".").pop() ?? "";
      if (!fileMap.has(currentFile)) {
        fileMap.set(currentFile, {
          path: currentFile,
          extension: ext,
          additions: 0,
          deletions: 0,
          changeType: "modified",
        });
      }
      continue;
    }

    if (line.startsWith("+++ /dev/null")) {
      fileMap.get(currentFile) && (fileMap.get(currentFile)!.changeType = "deleted");
      continue;
    }
    if (line.startsWith("--- /dev/null")) {
      fileMap.get(currentFile) && (fileMap.get(currentFile)!.changeType = "added");
      continue;
    }
    if (line.startsWith("rename to ")) {
      fileMap.get(currentFile) && (fileMap.get(currentFile)!.changeType = "renamed");
      continue;
    }

    const entry = fileMap.get(currentFile);
    if (entry) {
      if (line.startsWith("+") && !line.startsWith("+++")) entry.additions++;
      if (line.startsWith("-") && !line.startsWith("---")) entry.deletions++;
    }

    // Extract tokens only from changed lines
    if ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")) {
      const content = line.slice(1);
      for (const pattern of TOKEN_PATTERNS) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(content)) !== null) {
          const token = (m[1] ?? m[0]).trim().slice(0, 50);
          if (token.length > 2) keyTokenSet.add(token.toLowerCase());
        }
      }
    }
  }

  const files = Array.from(fileMap.values());
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  const langSet = new Set<string>();
  for (const f of files) {
    const lang = EXT_TO_LANG[f.extension.toLowerCase()];
    if (lang) langSet.add(lang);
  }

  const totalChangedLines = totalAdditions + totalDeletions;
  const sizeCategory =
    totalChangedLines < 100 ? "small" :
    totalChangedLines < 500 ? "medium" :
    totalChangedLines < 2000 ? "large" : "xlarge";

  return {
    filesChanged: files,
    totalAdditions,
    totalDeletions,
    languages: Array.from(langSet),
    keyTokens: Array.from(keyTokenSet).slice(0, 60),
    sizeCategory,
    rawLines,
  };
}

export function formatDiffSummaryForRouter(summary: DiffSummary): string {
  const fileLines = summary.filesChanged
    .map((f) => `  ${f.path} [${f.changeType}, +${f.additions}/-${f.deletions}]`)
    .join("\n");

  return [
    `Diff size: ${summary.sizeCategory} (${summary.totalAdditions}+ / ${summary.totalDeletions}-)`,
    `Languages: ${summary.languages.join(", ") || "unknown"}`,
    `Files changed (${summary.filesChanged.length}):`,
    fileLines || "  (none detected)",
    `Key tokens: ${summary.keyTokens.slice(0, 25).join(", ")}`,
  ].join("\n");
}
