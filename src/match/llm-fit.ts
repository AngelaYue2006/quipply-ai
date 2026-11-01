import type { Db } from '../db/client';
import { SCORE_CONFIG } from '../config';
import type { LlmClient } from '../llm/client';
import { loadPrompt, structured } from '../llm/structured';
import { FitChecklist } from '../shared/match';
import { matchProfileSubset } from '../shared/profile';
import type { MatchInput } from './types';

export const MATCH_PROMPT_VERSION = 'match-fit@1';

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The exact system prompt and user message for one job. Only education, experience, projects and skills are sent. */
export function buildFitMessages(input: MatchInput) {
  const full = input.description ?? '';
  const truncated = full.length > SCORE_CONFIG.descriptionCharLimit;
  const description = truncated ? full.slice(0, SCORE_CONFIG.descriptionCharLimit) : full;
  const subset = matchProfileSubset(input.profile);
  const user =
    `<job title="${attr(input.job.title)}" company="${attr(input.job.company)}">${description}</job>\n` +
    `<profile>${JSON.stringify(subset, null, 2)}</profile>`;
  return { system: loadPrompt(MATCH_PROMPT_VERSION), user, truncated, description, subset };
}

export type FitCall = (input: MatchInput) => Promise<{ fit: FitChecklist; truncated: boolean; description: string; raw: string }>;

/** One model call that returns the requirements checklist. */
export function makeLlmFit(ctx: { db: Db; client: LlmClient; model: string }): FitCall {
  return async (input) => {
    const msg = buildFitMessages(input);
    const result = await structured({
      db: ctx.db,
      client: ctx.client,
      action: 'match_fit',
      model: ctx.model,
      promptVersion: MATCH_PROMPT_VERSION,
      system: msg.system,
      userText: msg.user,
      schema: FitChecklist,
      maxTokens: 8000,
    });
    // At most 15 requirements (structured outputs can't enforce array length).
    const fit = { ...result.data, requirements: result.data.requirements.slice(0, 15) };
    return { fit, truncated: msg.truncated, description: msg.description, raw: result.raw };
  };
}
