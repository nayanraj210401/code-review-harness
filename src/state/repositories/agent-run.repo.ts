import type Database from "better-sqlite3";
import type { AgentResult } from "../../types/agent";

export class AgentRunRepo {
  constructor(private db: Database.Database) {}

  create(
    id: string,
    sessionId: string,
    agentId: string,
    agentName: string,
    model: string,
    isEphemeral = false,
  ): void {
    this.db
      .prepare(
        `INSERT INTO agent_runs (id, session_id, agent_id, agent_name, model, is_ephemeral, status, started_at)
         VALUES (@id, @sessionId, @agentId, @agentName, @model, @isEphemeral, 'running', datetime('now'))`,
      )
      .run({ id, sessionId, agentId, agentName, model, isEphemeral: isEphemeral ? 1 : 0 });
  }

  complete(id: string, result: AgentResult): void {
    this.db
      .prepare(
        `UPDATE agent_runs SET
           status = 'complete',
           completed_at = datetime('now'),
           tokens_used = @tokensUsed,
           duration_ms = @durationMs,
           skills_used_json = @skillsUsed
         WHERE id = @id`,
      )
      .run({
        id,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        skillsUsed: null,
      });
  }

  fail(id: string, error: string): void {
    this.db
      .prepare(
        `UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'), error_message = @error WHERE id = @id`,
      )
      .run({ id, error });
  }
}
