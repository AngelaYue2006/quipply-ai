import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

loadDotenv({ quiet: true });

/** Settings the owner can change on the Settings screen. Saved in <DATA_DIR>/settings.json, overriding .env. */
export const EditableSettings = z.object({
  matchModel: z.string().min(1),
  importModel: z.string().min(1),
  listingsUrl: z.url(),
  /** 0 means "all". */
  pullWindowDays: z.number().int().min(0).max(3650),
});
export type EditableSettings = z.infer<typeof EditableSettings>;

/** USD per million tokens. Verified against the Anthropic model table on 2026-11-01. */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-fable-5-1': { input: 10, output: 50 },
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
};

function envDefaults(): EditableSettings {
  return {
    matchModel: process.env.MATCH_MODEL || 'claude-haiku-5-5',
    importModel: process.env.IMPORT_MODEL || 'claude-opus-5-5',
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
  return {
    ...envDefaults(),
    ...saved,
    port: Number(process.env.PORT ?? 4317),
    devWebPort: Number(process.env.DEV_WEB_PORT ?? 5173),
    dataDir,
    dbPath: path.join(dataDir, 'quipply.db'),
    resumesDir: path.join(dataDir, 'resumes'),
    token: process.env.QUIPPLY_TOKEN ?? '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    ...overrides,
  };
}

export function saveSettings(cfg: AppConfig, next: EditableSettings): AppConfig {
  mkdirSync(cfg.dataDir, { recursive: true });
  writeFileSync(settingsPath(cfg.dataDir), JSON.stringify(next, null, 2));
  Object.assign(cfg, next);
  return cfg;
}
