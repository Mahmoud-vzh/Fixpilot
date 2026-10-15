export const LIVE_DISABLED_MESSAGE = "Live mode isn't enabled in this public demo. Try a guided demo.";

export type VisitorUsage = {
  used: number;
  limit: number;
  day: string;
  resetsAt: string;
};
export type PublicConfig = {
  liveAI: boolean;
  provider: 'gemini';
  model: string;
  usage: VisitorUsage | null;
};

export function currentUsage(config: PublicConfig | null, now = new Date()) {
  const usage = config?.liveAI ? config.usage : null;
  return usage?.day === now.toISOString().slice(0, 10) ? usage : null;
}

export function modeLabel(config: PublicConfig | null, now = new Date()) {
  if (!config?.liveAI) return 'Live: off';
  const usage = currentUsage(config, now);
  return `${config.model} · ${usage ? `${usage.used} of ${usage.limit} today` : 'usage unavailable'}`;
}
