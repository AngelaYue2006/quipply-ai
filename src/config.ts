import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

loadDotenv({ quiet: true });

export type LlmProvider = 'anthropic' | 'gemini';

/** The provider is chosen from the model ID: claude-* goes to Anthropic, gemini-* to Google. */
export function providerFor(model: string): LlmProvider | null {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'gemini';
  return null;
}

const ModelId = z
  .string()
  .min(1)
  .refine((m) => providerFor(m) !== null, 'Use a model ID that starts with "claude-" or "gemini-".');

/** Settings the owner can change on the Settings screen. Saved in <DATA_DIR>/settings.json, overriding .env. */
export const EditableSettings = z.object({
  matchModel: ModelId,
  importModel: ModelId,
  listingsUrl: z.url(),
  /** 0 means "all". */
  pullWindowDays: z.number().int().min(0).max(3650),
});
export type EditableSettings = z.infer<typeof EditableSettings>;

/** Used when .env and settings.json don't name a model. Gemini wins when GEMINI_API_KEY is set. */
export const DEFAULT_MODELS: Record<LlmProvider, { match: string; import: string }> = {
  gemini: { match: 'gemini-3.5-flash-lite', import: 'gemini-3.8-flash' },
  anthropic: { match: 'claude-haiku-5-5', import: 'claude-opus-5-5' },
};

/**
 * USD per million tokens (standard paid tier, prompts up to 200k tokens).
 * Claude: Anthropic model table, verified 2026-11-01.
 * Gemini: ai.google.dev/gemini-api/docs/pricing, verified 2026-11-01. Output includes thinking tokens.
 * gemini-3.8-flash and gemini-3.6-flash are introductory prices through 2026-12-31 ($1.50 / $7.50 from 2027-01-01);
 * gemini-4-argon is $4 / $20 from 2026-12-01. The free tier costs nothing, so the logged cost is an upper bound there.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-fable-5-1': { input: 10, output: 50 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-4-argon': { input: 2, output: 10 },
};

/** Weights and thresholds for turning a fit checklist into a score (SPEC: Matching, step 3). */
export const SCORE_CONFIG = {
  weights: { required: 3, preferred: 1 },
  values: { yes: 1, partial: 0.5, no: 0 },
  requiredNoCapCount: 2,
  requiredNoCap: 59,
  lowConfidenceBelow: 3,
  verdicts: { strong: 80, good: 65, stretch: 50 },
  descriptionCharLimit: 15_000,
} as const;

export type AppConfig = EditableSettings & {
  port: number;
  devWebPort: number;
  dataDir: string;
  dbPath: string;
  resumesDir: string;
  token: string;
  anthropicApiKey: string;
  geminiApiKey: string;
};

function envDefaults(geminiApiKey: string): EditableSettings {
  const models = DEFAULT_MODELS[geminiApiKey ? 'gemini' : 'anthropic'];
  return {
    matchModel: process.env.MATCH_MODEL || models.match,
    importModel: process.env.IMPORT_MODEL || models.import,
    listingsUrl:
      process.env.LISTINGS_URL ||
      'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
    pullWindowDays: Number(process.env.PULL_WINDOW_DAYS ?? 7),
  };
}

function settingsPath(dataDir: string) {
  return path.join(dataDir, 'settings.json');
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = path.resolve(overrides.dataDir ?? process.env.DATA_DIR ?? './data');
  let saved: Partial<EditableSettings> = {};
  const file = settingsPath(dataDir);
  if (existsSync(file)) {
    const parsed = EditableSettings.partial().safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (parsed.success) saved = parsed.data;
  }
  const geminiApiKey = overrides.geminiApiKey ?? (process.env.GEMINI_API_KEY ?? '').trim();
  return {
    ...envDefaults(geminiApiKey),
    ...saved,
    port: Number(process.env.PORT ?? 4317),
    devWebPort: Number(process.env.DEV_WEB_PORT ?? 5173),
    dataDir,
    dbPath: path.join(dataDir, 'quipply.db'),
    resumesDir: path.join(dataDir, 'resumes'),
    token: process.env.QUIPPLY_TOKEN ?? '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    geminiApiKey,
    ...overrides,
  };
}

const KEY_NAME: Record<LlmProvider, 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY'> = { anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };

/** One message per configured model whose provider has no API key in .env. */
export function missingKeys(cfg: AppConfig): string[] {
  const out: string[] = [];
  for (const [label, model] of [['Score match', cfg.matchModel], ['Resume import', cfg.importModel]] as const) {
    const provider = providerFor(model);
    if (!provider) continue;
    const key = provider === 'gemini' ? cfg.geminiApiKey : cfg.anthropicApiKey;
    if (!key) out.push(`${label} uses ${model}, but ${KEY_NAME[provider]} is empty in .env.`);
  }
  return out;
}

export function saveSettings(cfg: AppConfig, next: EditableSettings): AppConfig {
  mkdirSync(cfg.dataDir, { recursive: true });
  writeFileSync(settingsPath(cfg.dataDir), JSON.stringify(next, null, 2));
  Object.assign(cfg, next);
  return cfg;
}
