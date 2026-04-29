import type { Command } from "commander";
import { loadConfig } from "../../config/loader";
import { getDb } from "../../state/db";
import { ReviewSessionRepo } from "../../state/repositories/review-session.repo";
import { ReviewSearch } from "../../state/search";
import { logger } from "../../utils/logger";

export function registerHistoryCommand(program: Command): void {
  program
    .command("history")
    .description("Browse past reviews")
    .option("-s, --search <query>", "Full-text search across reviews")
    .option("-n, --limit <n>", "Number of results", "10")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const config = loadConfig();
      logger.setLevel(config.logLevel);
      logger.debug(`[history] search="${opts.search ?? ""}" limit=${opts.limit} json=${!!opts.json} dbPath=${config.dbPath}`);
      const db = getDb(config.dbPath);

      let sessions;
      if (opts.search) {
        const searcher = new ReviewSearch(db);
        sessions = searcher.search(opts.search, parseInt(opts.limit, 10));
        logger.debug(`[history] FTS search="${opts.search}" → ${sessions.length} results`);
      } else {
        const repo = new ReviewSessionRepo(db);
        sessions = repo.list(parseInt(opts.limit, 10));
        logger.debug(`[history] listing ${sessions.length} sessions`);
      }

      if (opts.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }

      if (sessions.length === 0) {
        console.log("No review history found.");
        return;
      }

      console.log(`\nReview History (${sessions.length} results)\n`);
      for (const s of sessions) {
        const date = new Date(s.createdAt).toLocaleString();
        const status = s.status === "complete" ? "✔" : s.status === "failed" ? "✗" : "…";
        const findings = s.findings.length;
        console.log(`  ${status} [${date}] ${s.id.slice(0, 8)} · ${s.request.level} · ${findings} findings`);
        if (s.summary) console.log(`      ${s.summary.slice(0, 80)}`);
      }
      console.log("");
    });
}
