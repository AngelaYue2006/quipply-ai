import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './client';

/** JSON Schema for Gemini's structured output. Gemini supports a subset; our schemas only use the basics. */
export function geminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * The request body for interactions.create(). Kept separate so tests can check it without a network call.
 * Uses the Interactions API as documented on ai.google.dev (checked 2026-11-01).
 */
export function buildGeminiParams(req: LlmRequest) {
  const firstTurn = [
    ...(req.documents ?? []).map((d) => ({ type: 'document' as const, data: d.base64, mime_type: 'application/pdf' })),
    { type: 'text' as const, text: req.userText },
  ];
  const steps = [
    { type: 'user_input' as const, content: firstTurn },
    ...(req.history ?? []).map((h) => ({
      type: h.role === 'user' ? ('user_input' as const) : ('model_output' as const),
      content: [{ type: 'text' as const, text: h.text }],
    })),
  ];
  return {
    model: req.model,
    system_instruction: req.system,
    input: steps,
    response_format: { type: 'text' as const, mime_type: 'application/json', schema: geminiJsonSchema(req.schema) },
    generation_config: { max_output_tokens: req.maxTokens },
    // Don't keep the profile, resume or job text on Google's servers after the call.
    store: false,
  };
}

/** Real Gemini client. Thinking tokens are billed as output, so they're counted as output here. */
export class GeminiLlmClient implements LlmClient {
  private client: GoogleGenAI;
  constructor(apiKey: string) {
    if (!apiKey) throw new LlmError('GEMINI_API_KEY is not set. Add it to .env and restart.', 'no_api_key');
    this.client = new GoogleGenAI({ apiKey });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    let interaction;
    try {
      interaction = await this.client.interactions.create(buildGeminiParams(req));
    } catch (err) {
      throw toLlmError(err);
    }
    if (interaction.status === 'incomplete') throw new LlmError('The response hit the output token limit.', 'max_tokens');
    if (interaction.status !== 'completed') throw new LlmError(`Gemini returned status "${interaction.status}".`, 'api_error');
    const usage = interaction.usage ?? {};
    return {
      text: interaction.output_text ?? '',
      model: typeof interaction.model === 'string' ? interaction.model : req.model,
      inputTokens: usage.total_input_tokens ?? 0,
      outputTokens: (usage.total_output_tokens ?? 0) + (usage.total_thought_tokens ?? 0),
      stopReason: interaction.status,
    };
  }
}

function toLlmError(err: unknown): Error {
  if (err instanceof LlmError) return err;
  const status = (err as { status?: number }).status;
  const message = err instanceof Error ? err.message : String(err);
  // A bad key comes back as 400 "API key not valid" as well as 401/403.
  if (status === 401 || status === 403 || /api key/i.test(message)) return new LlmError('The Gemini API key was rejected.', 'api_error');
  if (status === 429) return new LlmError('Rate limited by the Gemini API (free-tier limits are low). Try again shortly.', 'api_error');
  if (typeof status === 'number') return new LlmError(`Gemini API error ${status}: ${message}`, 'api_error');
  return err instanceof Error ? err : new Error(message);
}
