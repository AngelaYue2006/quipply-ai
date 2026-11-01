import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import type { Db } from '../db/client';
import { llmCalls } from '../db/schema';
import { MODEL_PRICES } from '../config';
import { LlmError, type LlmClient, type LlmDocument } from './client';

const PROMPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'prompts');

/** Load a versioned prompt file, e.g. loadPrompt('match-fit@1'). */
export function loadPrompt(name: string): string {
  return readFileSync(path.join(PROMPTS_DIR, `${name}.md`), 'utf8').trim();
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES[model];
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export type StructuredArgs<S extends z.ZodType> = {
  db: Db;
  client: LlmClient;
  action: string;
  model: string;
  /** e.g. 'match-fit@1'; also the prompt file name. */
  promptVersion: string;
  system: string;
  userText: string;
  documents?: LlmDocument[];
  schema: S;
  maxTokens?: number;
};

export type StructuredResult<T> = { data: T; raw: string; callId: number; model: string; costUsd: number };

/**
 * The one way to call a model. Validates the JSON against the Zod schema, makes one repair
 * attempt on invalid output, and logs every attempt to llm_calls with tokens and cost.
 */
export async function structured<S extends z.ZodType>(args: StructuredArgs<S>): Promise<StructuredResult<z.infer<S>>> {
  const history: { role: 'user' | 'assistant'; text: string }[] = [];
  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      const res = await args.client.complete({
        model: args.model,
        system: args.system,
        userText: args.userText,
        documents: args.documents,
        history,
        schema: args.schema,
        maxTokens: args.maxTokens ?? 16_000,
      });
      const cost = costUsd(res.model, res.inputTokens, res.outputTokens);
      const parsed = parseJson(res.text, args.schema);
      const callId = logCall(args, {
        model: res.model,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        costUsd: cost,
        durationMs: Date.now() - started,
        ok: parsed.ok,
        error: parsed.ok ? null : `invalid output: ${parsed.error}`,
      });
      if (parsed.ok) return { data: parsed.data, raw: res.text, callId, model: res.model, costUsd: cost };

      lastError = parsed.error;
      history.push(
        { role: 'assistant', text: res.text },
        {
          role: 'user',
          text: `Your previous reply did not match the required JSON schema: ${parsed.error}\nReturn only the corrected JSON.`,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logCall(args, { model: args.model, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: Date.now() - started, ok: false, error: message });
      throw err;
    }
  }
  throw new LlmError(`The model returned invalid output twice: ${lastError}`, 'invalid_output');
}

function parseJson<S extends z.ZodType>(text: string, schema: S): { ok: true; data: z.infer<S> } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `not valid JSON (${(e as Error).message})` };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; '),
  };
}

function logCall(
  args: StructuredArgs<z.ZodType>,
  row: { model: string; inputTokens: number; outputTokens: number; costUsd: number; durationMs: number; ok: boolean; error: string | null },
): number {
  const inserted = args.db
    .insert(llmCalls)
    .values({ action: args.action, promptVersion: args.promptVersion, ...row })
    .returning({ id: llmCalls.id })
    .get();
  return inserted.id;
}
