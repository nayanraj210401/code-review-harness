import type { Command } from "commander";
import { loadConfig } from "../../config/loader";
import { initAgents, listAgentConfigs } from "../../agents/registry";

export function registerAgentsCommand(program: Command): void {
  const agents = program.command("agents").description("Manage review agents");

  agents
    .command("list")
    .description("List all available agents")
    .action(() => {
      const config = loadConfig();
      initAgents(config.agentsDir, process.cwd() + "/.crh/agents");

      const all = listAgentConfigs();
      if (all.length === 0) {
        console.log("No agents found.");
        return;
      }

      console.log(`\nAvailable agents (${all.length}):\n`);
      for (const a of all) {
        const enabledStatus = config.agents[a.id]?.enabled !== false ? "enabled" : "disabled";
        console.log(
          `  ${a.id.padEnd(20)} ${a.name.padEnd(28)} [${enabledStatus}] · ${a.description.slice(0, 60)}`,
        );
      }
      console.log(
        `\nAdd custom agents: drop a .md file in ${config.agentsDir}\n`,
      );
    });

  agents
    .command("show <id>")
    .description("Show full agent config and system prompt")
    .action((id: string) => {
      const config = loadConfig();
      initAgents(config.agentsDir);
      const all = listAgentConfigs();
      const agent = all.find((a) => a.id === id);
      if (!agent) {
        console.error(`Agent "${id}" not found.`);
        process.exit(1);
      }
      console.log(JSON.stringify(
        {
          ...agent,
          systemPrompt: agent.systemPrompt.slice(0, 300) + "...",
        },
        null,
        2,
      ));
    });
}
