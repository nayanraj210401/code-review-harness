import type Database from "better-sqlite3";
import type { Finding } from "../../types/agent";

export class FindingRepo {
  constructor(private db: Database.Database) {}

  createMany(findings: Finding[], sessionId: string, agentRunId: string): void {
    const stmt = this.db.prepare(
      `INSERT INTO findings (
        id, session_id, agent_run_id, severity, category, title,
        description, suggestion, file_path, line_start, line_end,
        confidence, skill_id
      ) VALUES (
        @id, @sessionId, @agentRunId, @severity, @category, @title,
        @description, @suggestion, @filePath, @lineStart, @lineEnd,
        @confidence, @skillId
      )`,
    );

    const insertAll = this.db.transaction((items: Finding[]) => {
      for (const f of items) {
        stmt.run({
          id: f.id,
          sessionId,
          agentRunId,
          severity: f.severity,
          category: f.category,
          title: f.title,
          description: f.description,
          suggestion: f.suggestion,
          filePath: f.filePath ?? null,
          lineStart: f.lineStart ?? null,
          lineEnd: f.lineEnd ?? null,
          confidence: f.confidence,
          skillId: f.skillId ?? null,
        });
      }
    });

    insertAll(findings);
  }

  findBySession(sessionId: string): Finding[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM findings WHERE session_id = ? ORDER BY severity, confidence DESC",
      )
      .all(sessionId) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: r.id as string,
      agentId: (r.agent_run_id as string).split(":")[0] ?? "",
      severity: r.severity as Finding["severity"],
      category: r.category as string,
      title: r.title as string,
      description: r.description as string,
      suggestion: r.suggestion as string,
      filePath: r.file_path as string | undefined,
      lineStart: r.line_start as number | undefined,
      lineEnd: r.line_end as number | undefined,
      confidence: r.confidence as number,
      skillId: r.skill_id as string | undefined,
    }));
  }
}
