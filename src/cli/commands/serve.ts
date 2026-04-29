import type { Command } from "commander";
import { loadConfig } from "../../config/loader";
import { Orchestrator } from "../../core/orchestrator";
import { initFormatters } from "../../formatters/registry";
import { initTools } from "../../tools/registry";
import { initAgents } from "../../agents/registry";
import { initSkills } from "../../skills/registry";
import { initProviders } from "../../providers/registry";
import { logger } from "../../utils/logger";
import type { ReviewRequest } from "../../types/review";

interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start as MCP (Model Context Protocol) server")
    .option("--mcp", "Use MCP JSON-RPC 2.0 protocol on stdio")
    .option("--port <port>", "HTTP port (future use)")
    .action(async (opts) => {
      if (!opts.mcp) {
        console.error("Only --mcp mode is supported. Use: crh serve --mcp");
        process.exit(1);
      }

      const config = loadConfig();
      logger.setLevel(config.logLevel);
      logger.debug(`[serve] starting MCP server — provider=${config.defaultProvider} logLevel=${config.logLevel}`);
      initFormatters();
      initProviders(config);
      initTools();
      initAgents(config.agentsDir);
      initSkills(config.skillsDir);

      const orch = new Orchestrator(config);

      process.stderr.write("[crh] MCP server ready on stdio\n");

      // Read newline-delimited JSON from stdin
      let buffer = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            handleRequest(trimmed, orch, config).catch((err) => {
              process.stderr.write(`[crh] Unhandled error: ${err}\n`);
            });
          }
        }
      });

      process.stdin.on("end", () => process.exit(0));
    });
}

async function handleRequest(
  raw: string,
  orch: Orchestrator,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  let req: MCPRequest;
  try {
    req = JSON.parse(raw) as MCPRequest;
  } catch {
    sendResponse({ jsonrpc: "2.0", id: 0, error: { code: -32700, message: "Parse error" } });
    return;
  }

  logger.debug(`[serve] MCP request id=${req.id} method=${req.method}`);
  try {
    switch (req.method) {
      case "initialize": {
        sendResponse({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "review-harness", version: "0.1.0" },
          },
        });
        break;
      }

      case "tools/list": {
        sendResponse({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            tools: [
              {
                name: "crh_review",
                description: "Run a multi-agent code review. Returns a ReviewSession with findings.",
                inputSchema: {
                  type: "object",
                  properties: {
                    diff: { type: "string", description: "Git diff string" },
                    diffArgs: { type: "array", items: { type: "string" }, description: "Git diff arguments" },
                    level: { type: "string", enum: ["quick", "standard", "deep"] },
                    agentIds: { type: "array", items: { type: "string" } },
                    skillIds: { type: "array", items: { type: "string" } },
                    format: { type: "string", enum: ["json", "markdown", "pretty", "sarif"] },
                  },
                },
              },
              {
                name: "crh_agents_list",
                description: "List all available review agents",
                inputSchema: { type: "object", properties: {} },
              },
              {
                name: "crh_skills_list",
                description: "List all available review skills",
                inputSchema: { type: "object", properties: {} },
              },
              {
                name: "crh_history",
                description: "Search past reviews",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string" },
                    limit: { type: "number" },
                  },
                },
              },
            ],
          },
        });
        break;
      }

      case "tools/call": {
        const toolName = (req.params?.name as string) ?? "";
        const toolArgs = (req.params?.arguments as Record<string, unknown>) ?? {};
        logger.debug(`[serve] tools/call tool=${toolName} args=${JSON.stringify(toolArgs).slice(0, 120)}`);

        let toolResult: unknown;

        switch (toolName) {
          case "crh_review": {
            const session = await orch.review({
              diff: toolArgs.diff as string | undefined,
              diffArgs: toolArgs.diffArgs as string[] | undefined,
              level: (toolArgs.level as ReviewRequest["level"]) ?? config.defaultLevel,
              format: (toolArgs.format as ReviewRequest["format"]) ?? "json",
              agentIds: toolArgs.agentIds as string[] | undefined,
              skillIds: toolArgs.skillIds as string[] | undefined,
            });
            toolResult = session;
            break;
          }

          case "crh_agents_list": {
            const { listAgentConfigs } = await import("../../agents/registry");
            toolResult = listAgentConfigs().map((a) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              triggers: a.triggers,
            }));
            break;
          }

          case "crh_skills_list": {
            const { listSkills } = await import("../../skills/registry");
            toolResult = listSkills().map((s) => s.manifest);
            break;
          }

          case "crh_history": {
            const { ReviewSearch } = await import("../../state/search");
            const { getDb } = await import("../../state/db");
            const db = getDb(config.dbPath);
            const searcher = new ReviewSearch(db);
            toolResult = toolArgs.query
              ? searcher.search(toolArgs.query as string, (toolArgs.limit as number) ?? 10)
              : [];
            break;
          }

          default:
            sendResponse({
              jsonrpc: "2.0",
              id: req.id,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            });
            return;
        }

        sendResponse({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }],
          },
        });
        break;
      }

      default:
        sendResponse({
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        });
    }
  } catch (err) {
    sendResponse({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32603, message: String(err) },
    });
  }
}

function sendResponse(res: MCPResponse): void {
  process.stdout.write(JSON.stringify(res) + "\n");
}
