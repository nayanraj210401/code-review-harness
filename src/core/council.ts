import type { AgentResult, AgentConfig, AgentInput } from "../types/agent";
import type { CouncilResult, CouncilStage, ConsensusItem } from "../types/council";
import type { IProvider } from "../types/provider";
import { generateId } from "../utils/id";
import { logger } from "../utils/logger";
import { createAgent } from "../agents/registry";

export interface CouncilRunConfig {
  memberConfigs: AgentConfig[];
  chairModel: string;
  provider: IProvider;
  agentInput: AgentInput;
  rounds?: number;
}

export async function runCouncil(opts: CouncilRunConfig): Promise<CouncilResult> {
  const start = Date.now();
  const stages: CouncilStage[] = [];

  // Stage 1: Individual reviews (parallel)
  const s1Start = Date.now();
  const individualResults = await Promise.allSettled(
    opts.memberConfigs.map(async (config) => {
      const agent = createAgent(config, opts.provider);
      return agent.run(opts.agentInput);
    }),
  );

  const stage1Results = individualResults
    .filter((r): r is PromiseFulfilledResult<AgentResult> => r.status === "fulfilled")
    .map((r) => r.value);

  stages.push({
    stage: 1,
    name: "individual_review",
    outputs: stage1Results,
    tokensUsed: stage1Results.reduce((s, r) => s + r.tokensUsed, 0),
    durationMs: Date.now() - s1Start,
  });

  // Stage 2: Peer critique (parallel) — agents rank each other's anonymized findings
  const s2Start = Date.now();
  const peerCritiques = await runPeerCritique(
    stage1Results,
    opts.memberConfigs,
    opts.provider,
    opts.agentInput,
  );

  stages.push({
    stage: 2,
    name: "peer_ranking",
    outputs: peerCritiques,
    tokensUsed: peerCritiques.reduce((s, r) => s + r.tokensUsed, 0),
    durationMs: Date.now() - s2Start,
  });

  // Stage 3: Chair synthesis
  const s3Start = Date.now();
  const { consensus, finalSynthesis, aggregateRankings, tokensUsed } =
    await synthesize(stage1Results, peerCritiques, opts.chairModel, opts.provider, opts.agentInput);

  stages.push({
    stage: 3,
    name: "synthesis",
    outputs: [],
    tokensUsed,
    durationMs: Date.now() - s3Start,
  });

  const totalTokens = stages.reduce((s, st) => s + st.tokensUsed, 0);

  return {
    id: generateId(),
    stages,
    consensus,
    finalSynthesis,
    aggregateRankings,
    totalTokensUsed: totalTokens,
    durationMs: Date.now() - start,
  };
}

async function runPeerCritique(
  results: AgentResult[],
  _configs: AgentConfig[],
  provider: IProvider,
  input: AgentInput,
): Promise<AgentResult[]> {
  // Build anonymized findings list for peer review
  const anonymized = results.map((r, i) => ({
    label: `Agent ${String.fromCharCode(65 + i)}`,
    findings: r.findings.map((f) => ({ ...f, agentId: "anonymous" })),
    summary: r.summary,
  }));

  return Promise.all(
    results.map(async (result, i) => {
      const othersText = anonymized
        .filter((_, j) => j !== i)
        .map(
          (a) =>
            `${a.label}:\n${a.findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.description.slice(0, 100)}`).join("\n")}`,
        )
        .join("\n\n");

      const prompt = `You previously reviewed some code and found these issues:\n${result.findings.map((f) => `- ${f.title}`).join("\n")}\n\nNow review the findings from other agents:\n\n${othersText}\n\nProvide:\n1. Which findings from others are valid and important?\n2. What did they miss that you found?\n3. PEER_CRITIQUE_RANKING: rank the agent lists from most to least thorough (e.g. "B > A > C")\n\nReturn JSON: {"findings": [], "summary": "critique summary", "ranking": "B > A"}`;

      try {
        const response = await provider.complete({
          model: result.model,
          messages: [
            {
              role: "system",
              content: "You are a code review quality evaluator. Assess peer reviews critically and fairly.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          maxTokens: 2048,
        });

        return {
          ...result,
          agentId: `${result.agentId}:critique`,
          summary: response.content.slice(0, 200),
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
  provider: IProvider,
  _input: AgentInput,
): Promise<{
  consensus: ConsensusItem[];
  finalSynthesis: string;
  aggregateRankings: Array<{ agentId: string; averageRank: number }>;
  tokensUsed: number;
}> {
  const allFindings = stage1.flatMap((r) =>
    r.findings.map((f) => ({ ...f, sourceAgent: r.agentName })),
  );

  const findingsText = allFindings
    .map(
      (f) =>
        `[${f.severity.toUpperCase()}] ${f.title} (${f.sourceAgent}): ${f.description.slice(0, 150)}`,
    )
    .join("\n");

  const critiqueText = stage2
    .map((r) => `${r.agentName}: ${r.summary.slice(0, 200)}`)
    .join("\n");

  const prompt = `You are the chair of a code review council. Synthesize the following findings from multiple expert agents into a final consensus report.

All findings:
${findingsText}

Peer critiques:
${critiqueText}

Produce a JSON response:
{
  "consensus": [
    {
      "findingIds": ["..."],
      "agreementScore": 0.9,
      "averageSeverity": "high",
      "title": "...",
      "description": "synthesized description"
    }
  ],
  "finalSynthesis": "Overall prose summary of the review...",
  "aggregateRankings": [{"agentId": "security", "averageRank": 1}]
}`;

  try {
    const response = await provider.complete({
      model: chairModel,
      messages: [
        {
          role: "system",
          content: "You are an expert code review chair who synthesizes multiple expert opinions into a clear, actionable consensus.",
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

  // Fallback: deduplicate by title similarity
  const consensus: ConsensusItem[] = [];
  const seen = new Set<string>();
  for (const f of allFindings) {
    const key = f.title.slice(0, 30).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      consensus.push({
        findingIds: [f.id],
        agreementScore: 1.0,
        averageSeverity: f.severity,
        title: f.title,
        description: f.description,
      });
    }
  }

  return {
    consensus,
    finalSynthesis: `Council reviewed ${stage1.length} agents' findings.`,
    aggregateRankings: stage1.map((r, i) => ({ agentId: r.agentId, averageRank: i + 1 })),
    tokensUsed: 0,
  };
}
