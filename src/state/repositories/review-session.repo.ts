import type Database from "better-sqlite3";
import type { ReviewSession, ReviewStatus } from "../../types/review";

export class ReviewSessionRepo {
  constructor(private db: Database.Database) {}

  create(session: ReviewSession): void {
    // Clear stale incomplete sessions with the same hash so the UNIQUE constraint doesn't block retries
    this.db
      .prepare(`DELETE FROM review_sessions WHERE context_hash = ? AND status != 'complete'`)
      .run(session.contextHash);

    this.db
      .prepare(
        `INSERT INTO review_sessions (
          id, created_at, status, level, format, council_mode,
          context_hash, diff_snippet, request_json, router_decision_json,
          total_tokens, duration_ms, error
        ) VALUES (
          @id, @createdAt, @status, @level, @format, @councilMode,
          @contextHash, @diffSnippet, @requestJson, @routerDecisionJson,
          @totalTokens, @durationMs, @error
        )`,
      )
      .run({
        id: session.id,
        createdAt: session.createdAt,
        status: session.status,
        level: session.request.level,
        format: session.request.format,
        councilMode: session.request.councilMode ? 1 : 0,
        contextHash: session.contextHash,
        diffSnippet: session.request.diff?.slice(0, 500) ?? null,
        requestJson: JSON.stringify(session.request),
        routerDecisionJson: session.routerDecision
          ? JSON.stringify(session.routerDecision)
          : null,
        totalTokens: session.totalTokensUsed,
        durationMs: session.durationMs,
        error: session.error ?? null,
      });
  }

  updateStatus(id: string, status: ReviewStatus, extra: Record<string, unknown> = {}): void {
    const fields = ["status = @status"];
    const params: Record<string, unknown> = { id, status };

    if ("completedAt" in extra) {
      fields.push("completed_at = @completedAt");
      params.completedAt = extra.completedAt;
    }
    if ("summary" in extra) {
      fields.push("summary = @summary");
      params.summary = extra.summary;
    }
    if ("totalTokens" in extra) {
      fields.push("total_tokens = @totalTokens");
      params.totalTokens = extra.totalTokens;
    }
    if ("durationMs" in extra) {
      fields.push("duration_ms = @durationMs");
      params.durationMs = extra.durationMs;
    }
    if ("error" in extra) {
      fields.push("error = @error");
      params.error = extra.error;
    }
    if ("routerDecisionJson" in extra) {
      fields.push("router_decision_json = @routerDecisionJson");
      params.routerDecisionJson = extra.routerDecisionJson;
    }

    this.db
      .prepare(`UPDATE review_sessions SET ${fields.join(", ")} WHERE id = @id`)
      .run(params);
  }

  findById(id: string): ReviewSession | null {
    const row = this.db
      .prepare("SELECT * FROM review_sessions WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToSession(row) : null;
  }

  findByHash(hash: string): ReviewSession | null {
    const row = this.db
      .prepare("SELECT * FROM review_sessions WHERE context_hash = ? AND status = 'complete'")
      .get(hash) as Record<string, unknown> | undefined;
    return row ? this.rowToSession(row) : null;
  }

  list(limit = 20, offset = 0): ReviewSession[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM review_sessions ORDER BY created_at DESC LIMIT ? OFFSET ?",
      )
      .all(limit, offset) as Record<string, unknown>[];
    return rows.map((r) => this.rowToSession(r));
  }

  private rowToSession(row: Record<string, unknown>): ReviewSession {
    return {
      id: row.id as string,
      createdAt: row.created_at as string,
      completedAt: row.completed_at as string | undefined,
      status: row.status as ReviewStatus,
      request: JSON.parse(row.request_json as string),
      contextHash: row.context_hash as string,
      routerDecision: row.router_decision_json
        ? JSON.parse(row.router_decision_json as string)
        : undefined,
      agentResults: [],
      findings: [],
      summary: (row.summary as string) ?? "",
      totalTokensUsed: (row.total_tokens as number) ?? 0,
      durationMs: (row.duration_ms as number) ?? 0,
      error: row.error as string | undefined,
    };
  }
}
