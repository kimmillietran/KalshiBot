import type { HypothesisCandidate, HypothesisCandidatesReport } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { LeadLagAnalysis } from "@/lib/data/research/leadLag/leadLagTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { StatisticalSignificanceReport } from "@/lib/data/research/statisticalSignificance/statisticalSignificanceTypes";

export const DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH =
  "data/reports/research-hypotheses.html";

export type HypothesisExampleMarket = {
  ticker: string;
  closeTime: string | null;
  settlement: "yes" | "no" | null;
  impliedProbability: number;
  realizedOutcome: 0 | 1;
};

export type HypothesisEvidenceCard = {
  candidateId: string;
  title: string;
  strategyFamily: string;
  rationale: string;
  calibrationError: number | null;
  impliedProbability: number | null;
  realizedProbability: number | null;
  sampleSize: number;
  confidenceLevel: HypothesisCandidate["confidence"];
  associatedRegime: string | null;
  associatedProbabilityBucket: string | null;
  associatedTimeBucket: string | null;
  warnings: readonly string[];
  sourceArtifact: string;
  confidenceSummary: string;
  exampleMarkets: readonly HypothesisExampleMarket[];
};

export type HypothesisEvidenceReport = {
  generatedAt: string;
  htmlOutputPath: string;
  candidatesReportPath: string;
  candidateCount: number;
  noCandidateReasons: readonly string[];
  cards: readonly HypothesisEvidenceCard[];
};

export type BuildHypothesisEvidenceReportInput = {
  generatedAt: string;
  htmlOutputPath: string;
  candidatesReport: HypothesisCandidatesReport;
  mispricingAtlas: MispricingAtlas | null;
  leadLagAnalysis: LeadLagAnalysis | null;
  statisticalSignificance: StatisticalSignificanceReport | null;
  researchInputRoot: string;
  readFile: (path: string) => string;
  listResearchOutputPaths: (root: string) => readonly string[];
};
