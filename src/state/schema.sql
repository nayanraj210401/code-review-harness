CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_sessions (
  id                  TEXT PRIMARY KEY,
  created_at          TEXT NOT NULL,
  completed_at        TEXT,
  status              TEXT NOT NULL,
  level               TEXT NOT NULL,
  format              TEXT NOT NULL,
  council_mode        INTEGER NOT NULL DEFAULT 0,
  context_hash        TEXT NOT NULL,
  diff_snippet        TEXT,
  summary             TEXT,
  total_tokens        INTEGER,
  duration_ms         INTEGER,
  router_decision_json TEXT,
  request_json        TEXT NOT NULL,
  error               TEXT,
  UNIQUE(context_hash)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  agent_name      TEXT NOT NULL,
  model           TEXT NOT NULL,
  is_ephemeral    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,
  started_at      TEXT,
  completed_at    TEXT,
  tokens_used     INTEGER,
  duration_ms     INTEGER,
  skills_used_json TEXT,
  error_message   TEXT
);

CREATE TABLE IF NOT EXISTS findings (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  agent_run_id    TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  severity        TEXT NOT NULL,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  suggestion      TEXT NOT NULL,
  file_path       TEXT,
  line_start      INTEGER,
  line_end        INTEGER,
  confidence      REAL NOT NULL DEFAULT 1.0,
  skill_id        TEXT,
  deduplicated    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skill_runs (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  skill_id        TEXT NOT NULL,
  mode            TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  duration_ms     INTEGER,
  result_json     TEXT
);

CREATE TABLE IF NOT EXISTS council_stages (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  stage_number    INTEGER NOT NULL,
  stage_name      TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  tokens_used     INTEGER,
  output_json     TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS reviews_fts USING fts5(
  session_id UNINDEXED,
  summary,
  findings_text,
  diff_snippet,
  content='review_sessions',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS reviews_fts_insert AFTER INSERT ON review_sessions BEGIN
  INSERT INTO reviews_fts(rowid, session_id, summary, diff_snippet)
  VALUES (new.rowid, new.id, new.summary, new.diff_snippet);
END;

CREATE INDEX IF NOT EXISTS idx_sessions_created ON review_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_hash ON review_sessions(context_hash);
CREATE INDEX IF NOT EXISTS idx_findings_session ON findings(session_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id);
