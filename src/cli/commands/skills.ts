import { copyFileSync, existsSync, mkdirSync } from "fs";
import { basename, join } from "path";
import type { Command } from "commander";
import { loadConfig } from "../../config/loader";
import { initSkills, listSkills } from "../../skills/registry";

export function registerSkillsCommand(program: Command): void {
  const skills = program.command("skills").description("Manage review skills");

  skills
    .command("list")
    .description("List all available skills")
    .action(() => {
      const config = loadConfig();
      initSkills(config.skillsDir);

      const all = listSkills();
      if (all.length === 0) {
        console.log("No skills found.");
        return;
      }

      console.log(`\nAvailable skills (${all.length}):\n`);
      for (const s of all) {
        const enabledStatus = config.skills[s.manifest.id]?.enabled !== false ? "enabled" : "disabled";
        console.log(
          `  ${s.manifest.id.padEnd(22)} ${s.manifest.name.padEnd(30)} [${s.manifest.mode}/${enabledStatus}]`,
        );
        console.log(`    ${s.manifest.description.slice(0, 80)}`);
      }
      console.log(`\nAdd custom skills: drop a .md file in ${config.skillsDir}\n`);
    });

  skills
    .command("install <path>")
    .description("Install a skill from a local .md file")
    .action((skillPath: string) => {
      const config = loadConfig();
      if (!existsSync(skillPath)) {
        console.error(`File not found: ${skillPath}`);
        process.exit(1);
      }
      if (!existsSync(config.skillsDir)) {
        mkdirSync(config.skillsDir, { recursive: true });
      }
      const dest = join(config.skillsDir, basename(skillPath));
      copyFileSync(skillPath, dest);
      console.log(`✔ Installed skill to ${dest}`);
    });

  skills
    .command("show <id>")
    .description("Show the full content of a skill")
    .action(async (id: string) => {
      const config = loadConfig();
      initSkills(config.skillsDir);
      const all = listSkills();
      const skill = all.find((s) => s.manifest.id === id);
      if (!skill) {
        console.error(`Skill "${id}" not found.`);
        process.exit(1);
      }
      const content = await skill.loadContent();
      console.log(content);
    });
}
