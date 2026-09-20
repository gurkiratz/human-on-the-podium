export interface ModelOption {
  id: string;
  label: string;
}

/** Models the agent may be pointed at. Kept small so a bad id can't reach the API. */
export const MODEL_OPTIONS: ModelOption[] = [
  { id: "gpt-5-mini", label: "GPT-5 mini" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
];

export const DEFAULT_MODEL = "gpt-5-mini";

export function isAllowedModel(model: unknown): model is string {
  return typeof model === "string" && MODEL_OPTIONS.some((option) => option.id === model);
}
