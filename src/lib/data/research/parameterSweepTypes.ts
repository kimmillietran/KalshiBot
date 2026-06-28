export type SweepParameter = {
  name: string;
  values: readonly unknown[];
};

export type ParameterCombination = {
  values: Readonly<Record<string, unknown>>;
};

/** Sweep-layer experiment config produced by experimentFactory (distinct from 6.6A ResearchExperimentConfig). */
export type ParameterSweepExperimentConfig = {
  experimentId: string;
  sweepId: string;
  parameters: Readonly<Record<string, unknown>>;
};

/** Sweep-layer experiment result returned by the default stub or injected runner. */
export type ParameterSweepExperimentResult = {
  experimentId: string;
  sweepId: string;
  parameters: Readonly<Record<string, unknown>>;
  status: "completed";
};

export type ParameterSweepConfig = {
  sweepId: string;
  parameters: readonly SweepParameter[];
  experimentFactory: (
    parameters: Readonly<Record<string, unknown>>,
  ) => ParameterSweepExperimentConfig;
};

export type ParameterSweepResult = {
  sweepId: string;
  combinations: readonly ParameterCombination[];
  experiments: readonly ParameterSweepExperimentResult[];
  completedCount: number;
};

export type RunParameterSweepExperimentFn = (
  config: ParameterSweepExperimentConfig,
) => ParameterSweepExperimentResult;

export type RunParameterSweepOptions = {
  runExperiment?: RunParameterSweepExperimentFn;
};
