import type { AgentResult } from "./agent";
import type { ModelId } from "./provider";

export interface CouncilConfig {
  members: Array<{ agentId: string; model: ModelId }>;
  chairModel: ModelId;
  rounds: number;
  anonymizeInRound2: boolean;
}

export interface CouncilStage {
  stage: 1 | 2 | 3;
  name: "individual_review" | "peer_ranking" | "synthesis";
  outputs: AgentResult[];
  tokensUsed: number;
  durationMs: number;
}

export interface ConsensusItem {
  findingIds: string[];
  agreementScore: number;
  averageSeverity: string;
  title: string;
  description: string;
}

export interface CouncilResult {
  id: string;
  stages: CouncilStage[];
  consensus: ConsensusItem[];
  finalSynthesis: string;
  aggregateRankings: Array<{ agentId: string; averageRank: number }>;
  totalTokensUsed: number;
  durationMs: number;
}
