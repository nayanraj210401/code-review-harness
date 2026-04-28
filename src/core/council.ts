import type { AgentResult, AgentConfig, AgentInput } from "../types/agent";
import type { CouncilResult, CouncilStage, ConsensusItem } from "../types/council";
import { generateId } from "../utils/id";
import { logger } from "../utils/logger";
import { createAgent } from "../agents/registry";
import { getProviderForModel } from "../providers/registry";

export interface CouncilRunConfig {
  /** Single agent role — all council members share this system prompt and expertise */
  baseConfig: AgentConfig;
  /** One model per council member — diversity comes from model families, not roles */
  models: string[];
  chairModel: string;
  agentInput: AgentInput;
}

export async function runCouncil(opts: CouncilRunConfig): Promise<CouncilResult> {
  const start = Date.now();
  const stages: CouncilStage[] = [];

  if (opts.models.length < 2) {
    throw new Error("Council mode requires at least 2 models to deliberate");
  }

  // Build one agent config per model — same role, different model
  const memberConfigs = opts.models.map((model) => ({
    ...opts.baseConfig,
    model,
    // Disambiguate in results — strip provider prefix for readability
    name: `${opts.baseConfig.name} (${shortModelName(model)})`,
    id: `${opts.baseConfig.id}:${sanitize(model)}`,
  }));

  // Stage 1: Independent reviews in parallel
  const s1Start = Date.now();
  const settled = await Promise.allSettled(
    memberConfigs.map(async (config) => {
      const agent = createAgent(config);
      return agent.run(opts.agentInput);
    }),
  );

  const stage1Results = settled
    .filter((r): r is PromiseFulfilledResult<AgentResult> => r.status === "fulfilled")
    .map((r) => r.value);

  if (stage1Results.length === 0) {
    throw new Error("All council members failed in stage 1");
  }

  stages.push({
    stage: 1,
    name: "individual_review",
    outputs: stage1Results,
    tokensUsed: stage1Results.reduce((s, r) => s + r.tokensUsed, 0),
    durationMs: Date.now() - s1Start,
  });

  logger.debug(`Council stage 1: ${stage1Results.length} models completed`);

  // Stage 2: Peer critique — each model critiques the others
  // Because all members share the same expertise, disagreement is meaningful signal
  const s2Start = Date.now();
  const peerCritiques = await runPeerCritique(stage1Results);

  stages.push({
    stage: 2,
    name: "peer_ranking",
    outputs: peerCritiques,
    tokensUsed: peerCritiques.reduce((s, r) => s + r.tokensUsed, 0),
    durationMs: Date.now() - s2Start,
  });

  // Stage 3: Chair synthesis — surfaces findings with cross-model agreement
  const s3Start = Date.now();
  const { consensus, finalSynthesis, aggregateRankings, tokensUsed } =
    await synthesize(stage1Results, peerCritiques, opts.chairModel);

  stages.push({
    stage: 3,
    name: "synthesis",
    outputs: [],
    tokensUsed,
    durationMs: Date.now() - s3Start,
  });

  return {
    id: generateId(),
    stages,
    consensus,
    finalSynthesis,
    aggregateRankings,
    totalTokensUsed: stages.reduce((s, st) => s + st.tokensUsed, 0),
    durationMs: Date.now() - start,
  };
}

async function runPeerCritique(results: AgentResult[]): Promise<AgentResult[]> {
  // Anonymize by model label so each critic can't identify their own review by name
  const labeled = results.map((r, i) => ({
    label: `Model-${String.fromCharCode(65 + i)}`,
    model: r.model,
    findings: r.findings,
    summary: r.summary,
  }));

  return Promise.all(
    results.map(async (result, i) => {
      const myLabel = labeled[i].label;
      const peersText = labeled
        .filter((_, j) => j !== i)
        .map(
          (p) =>
            `${p.label}:\n` +
            p.findings
              .map((f) => `  [${f.severity.toUpperCase()}] ${f.title}: ${f.description.slice(0, 120)}`)
              .join("\n"),
        )
        .join("\n\n");

      const ownFindings = result.findings
        .map((f) => `  [${f.severity.toUpperCase()}] ${f.title}`)
        .join("\n");

      const prompt =
        `You are ${myLabel}. You reviewed the same code as the other models below. ` +
        `All reviewers share the same expertise — disagreements reflect genuine model differences.\n\n` +
        `Your findings:\n${ownFindings || "  (none)"}\n\n` +
        `Other models' findings:\n${peersText || "  (none)"}\n\n` +
        `Evaluate:\n` +
        `1. Which peer findings are valid and important (even if you missed them)?\n` +
        `2. Which peer findings do you disagree with and why?\n` +
        `3. PEER_CRITIQUE_RANKING: rank models from most to least thorough, e.g. "Model-B > Model-A > Model-C"\n\n` +
        `Return JSON: {"findings": [], "summary": "your critique", "ranking": "Model-B > Model-A"}`;

      try {
        const response = await getProviderForModel(result.model).complete({
          model: result.model,
          messages: [
            {
              role: "system",
              content:
                "You are evaluating peer code reviews from models with identical expertise. " +
                "Focus on whether findings are correct, not stylistic differences.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          maxTokens: 2048,
        });

        return {
          ...result,
          agentId: `${result.agentId}:critique`,
          summary: response.content.slice(0, 300),
          findings: [],
          tokensUsed: Math.ceil(response.content.length / 4),
        };
      } catch (err) {
        logger.warn(`Peer critique failed for ${result.agentId}: ${err}`);
        return { ...result, agentId: `${result.agentId}:critique`, findings: [] };
      }
    }),
  );
}

async function synthesize(
  stage1: AgentResult[],
  stage2: AgentResult[],
  chairModel: string,
): Promise<{
  consensus: ConsensusItem[];
  finalSynthesis: string;
  aggregateRankings: Array<{ agentId: string; averageRank: number }>;
  tokensUsed: number;
}> {
  const totalModels = stage1.length;

  // Group findings by title similarity to surface cross-model agreement
  const findingsText = stage1
    .map(
      (r) =>
        `${r.agentName}:\n` +
        r.findings
          .map((f) => `  [${f.severity.toUpperCase()}] ${f.title}: ${f.description.slice(0, 150)}`)
          .join("\n"),
    )
    .join("\n\n");

  const critiqueText = stage2
    .map((r) => `${r.agentName}: ${r.summary.slice(0, 200)}`)
    .join("\n");

  const prompt =
    `You are the chair of a code review council. ` +
    `${totalModels} instances of the same expert agent reviewed this code using different AI models. ` +
    `A finding seen by multiple models is high-confidence; a finding seen by only one model needs scrutiny.\n\n` +
    `Findings by model:\n${findingsText}\n\n` +
    `Peer critiques:\n${critiqueText}\n\n` +
    `Synthesize into a consensus report. For each consensus item, set agreementScore based on how many ` +
    `of the ${totalModels} models raised the same issue (1/${totalModels} = ${(1 / totalModels).toFixed(2)}, ` +
    `${totalModels}/${totalModels} = 1.0).\n\n` +
    `Return JSON:\n` +
    `{\n` +
    `  "consensus": [{\n` +
    `    "findingIds": ["..."],\n` +
    `    "agreementScore": 0.67,\n` +
    `    "averageSeverity": "high",\n` +
    `    "title": "...",\n` +
    `    "description": "synthesized description noting which models agreed/disagreed"\n` +
    `  }],\n` +
    `  "finalSynthesis": "Overall prose summary...",\n` +
    `  "aggregateRankings": [{"agentId": "security:claude-opus-4-5", "averageRank": 1}]\n` +
    `}`;

  try {
    const response = await getProviderForModel(chairModel).complete({
      model: chairModel,
      messages: [
        {
          role: "system",
          content:
            "You are an expert code review chair. Produce a consensus that highlights issues all models agree on " +
            "and flags outliers for human judgement.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 4096,
    });

    const jsonMatch =
      response.content.match(/```(?:json)?\s*([\s\S]*?)```/) ??
      response.content.match(/(\{[\s\S]*\})/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        consensus: parsed.consensus ?? [],
        finalSynthesis: parsed.finalSynthesis ?? response.content.slice(0, 500),
        aggregateRankings: parsed.aggregateRankings ?? [],
        tokensUsed: Math.ceil(response.content.length / 4),
      };
    }
  } catch (err) {
    logger.warn(`Council synthesis failed: ${err}`);
  }

  // Fallback: deduplicate and score by how many models raised the same title
  const titleCount = new Map<string, { items: typeof stage1[0]["findings"]; models: Set<string> }>();
  for (const result of stage1) {
    for (const f of result.findings) {
      const key = f.title.slice(0, 40).toLowerCase();
      if (!titleCount.has(key)) titleCount.set(key, { items: [], models: new Set() });
      titleCount.get(key)!.items.push(f);
      titleCount.get(key)!.models.add(result.agentId);
    }
  }

  const consensus: ConsensusItem[] = Array.from(titleCount.values()).map(({ items, models }) => ({
    findingIds: items.map((f) => f.id),
    agreementScore: models.size / totalModels,
    averageSeverity: items[0].severity,
    title: items[0].title,
    description: `${models.size}/${totalModels} models flagged this. ${items[0].description}`,
  }));

  consensus.sort((a, b) => b.agreementScore - a.agreementScore);

  return {
    consensus,
    finalSynthesis: `Council of ${totalModels} models reviewed the code. ${consensus.length} findings produced.`,
    aggregateRankings: stage1.map((r, i) => ({ agentId: r.agentId, averageRank: i + 1 })),
    tokensUsed: 0,
  };
}

function shortModelName(model: string): string {
  // "anthropic/claude-opus-4-5" → "claude-opus-4-5"
  return model.includes("/") ? model.split("/").pop()! : model;
}

function sanitize(model: string): string {
  return model.replace(/[^a-zA-Z0-9-]/g, "-");
}
