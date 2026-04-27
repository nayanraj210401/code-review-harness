import { getSkill } from "./registry";
import { logger } from "../utils/logger";

const _contentCache = new Map<string, string>();

export async function loadSkillContent(skillId: string): Promise<string | null> {
  if (_contentCache.has(skillId)) {
    return _contentCache.get(skillId)!;
  }

  const skill = getSkill(skillId);
  if (!skill) {
    logger.warn(`Skill "${skillId}" not found`);
    return null;
  }

  const content = await skill.loadContent();
  _contentCache.set(skillId, content);
  return content;
}

export async function loadSkillContents(
  skillIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(
    skillIds.map(async (id) => {
      const content = await loadSkillContent(id);
      if (content) result.set(id, content);
    }),
  );
  return result;
}
