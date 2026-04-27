import type Database from "better-sqlite3";
import type { ReviewSession } from "../types/review";
import { ReviewSessionRepo } from "./repositories/review-session.repo";

export class ReviewSearch {
  private sessionRepo: ReviewSessionRepo;

  constructor(private db: Database.Database) {
    this.sessionRepo = new ReviewSessionRepo(db);
  }

  search(query: string, limit = 10): ReviewSession[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT rs.* FROM review_sessions rs
           JOIN reviews_fts ON reviews_fts.session_id = rs.id
           WHERE reviews_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(query, limit) as Record<string, unknown>[];

      return rows.map((r) => this.sessionRepo["rowToSession"](r));
    } catch {
      // FTS not available or query malformed — fall back to LIKE
      return this.fallbackSearch(query, limit);
    }
  }

  private fallbackSearch(query: string, limit: number): ReviewSession[] {
    const term = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM review_sessions
         WHERE summary LIKE ? OR diff_snippet LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(term, term, limit) as Record<string, unknown>[];

    return rows.map((r) => this.sessionRepo["rowToSession"](r));
  }
}
