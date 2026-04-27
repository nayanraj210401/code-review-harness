import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { ISkill, SkillManifest } from "../types/skill";
import { FileSkill } from "./base";
import { logger } from "../utils/logger";

const _skills = new Map<string, ISkill>();

const BUILTINS_DIR = join(__dirname, "builtins");

export function initSkills(userSkillsDir?: string): void {
  _skills.clear();

  // Load built-ins
  loadFromDir(BUILTINS_DIR);

  // Load user skills (override built-ins if same id)
  if (userSkillsDir && existsSync(userSkillsDir)) {
    loadFromDir(userSkillsDir);
  }

  logger.debug(`Skills registry: ${_skills.size} skills loaded`);
}

function loadFromDir(dir: string): void {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    try {
      const skill = new FileSkill(join(dir, file));
      _skills.set(skill.manifest.id, skill);
    } catch (err) {
      logger.warn(`Failed to load skill ${file}: ${err}`);
    }
  }
}

export function getSkill(id: string): ISkill | undefined {
  return _skills.get(id);
}

export function listSkills(): ISkill[] {
  return [..._skills.values()];
}

export function getSkillManifests(): SkillManifest[] {
  return listSkills().map((s) => s.manifest);
}

export function registerSkill(skill: ISkill): void {
  _skills.set(skill.manifest.id, skill);
}
