export { buildResearchRecommendations, compareResearchRecommendationKinds } from "./buildResearchRecommendations";
export { buildResearchRecommendationEngineReport } from "./buildResearchRecommendationEngineReport";
export { loadResearchRecommendationInputs } from "./loadResearchRecommendationInputs";
export { parseResearchRecommendationEnginePathsFromArgv } from "./parseResearchRecommendationEngineArgv";
export { serializeResearchRecommendationEngineHtml } from "./serializeResearchRecommendationEngineHtml";
export { serializeResearchRecommendationEngineReport } from "./serializeResearchRecommendationEngineReport";
export {
  DEFAULT_RESEARCH_INTERACTION_ANALYSIS_OUTPUT_PATH,
  DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_OUTPUT_PATH,
  DEFAULT_RESEARCH_RECOMMENDATIONS_HTML_PATH,
  DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
  DEFAULT_RESEARCH_RECOMMENDATIONS_OUTPUT_PATH,
  DEFAULT_RESEARCH_ROI_ANALYSIS_OUTPUT_PATH,
  RESEARCH_RECOMMENDATION_KIND_PRIORITY,
  RESEARCH_RECOMMENDATION_KINDS,
  ResearchRecommendationEngineError,
} from "./researchRecommendationEngineTypes";
export type {
  ResearchRecommendationEngineInputPaths,
  ResearchRecommendationEngineReport,
  ResearchRecommendationEntry,
  ResearchRecommendationKind,
} from "./researchRecommendationEngineTypes";
