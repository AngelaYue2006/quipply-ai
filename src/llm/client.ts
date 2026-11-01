import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

/** A document attached to the user message (only PDFs in V1). */
export type LlmDocument = { kind: 'pdf'; base64: string };

export type LlmRequest = {
  model: string;
  system: string;
  userText: string;
  documents?: LlmDocument[];
  /** Earlier turns, used for the one repair retry. */
  history?: { role: 'user' | 'assistant'; text: string }[];
  schema: z.ZodType;
  maxTokens: number;
};

export type LlmResponse = {
  text: string;
  /** The model that actually answered (can differ from the requested one after a server-side fallback). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
};

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly code: 'no_api_key' | 'refusal' | 'max_tokens' | 'invalid_output' | 'api_error',
  ) {
    super(message);
  }
}

// Haiku has no server-side refusal fallback; the larger current models do.
function supportsServerFallback(model: string) {
  return /^claude-(opus|sonnet|fable)-/.test(model);
}

/** The real client. Uses structured outputs so the response is JSON matching the schema. */
export class AnthropicLlmClient implements LlmClient {
  private client: Anthropic;
  constructor(apiKey: string) {
    if (!apiKey) throw new LlmError('ANTHROPIC_API_KEY is not set. Add it to .env and restart.', 'no_api_key');
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const firstContent: Anthropic.Beta.BetaContentBlockParam[] = [
      ...(req.documents ?? []).map(
        (d): Anthropic.Beta.BetaContentBlockParam => ({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: d.base64 },
        }),
      ),
      { type: 'text', text: req.userText },
    ];
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: firstContent },
      ...(req.history ?? []).map((h): Anthropic.Beta.BetaMessageParam => ({ role: h.role, content: h.text })),
    ];
    const format = zodOutputFormat(req.schema) as unknown as Anthropic.Beta.BetaJSONOutputFormat;

    try {
      const response = supportsServerFallback(req.model)
        ? await this.client.beta.messages.create({
            model: req.model,
            max_tokens: req.maxTokens,
            system: req.system,
            messages,
            output_config: { format },
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          })
        : await this.client.beta.messages.create({
            model: req.model,
            max_tokens: req.maxTokens,
            system: req.system,
            messages,
            output_config: { format },
          });

      if (response.stop_reason === 'refusal') throw new LlmError('The model declined this request.', 'refusal');
      if (response.stop_reason === 'max_tokens') throw new LlmError('The response hit max_tokens.', 'max_tokens');
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return {
        text,
        model: response.model,
        inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason,
      };
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw new LlmError('The Anthropic API key was rejected.', 'api_error');
      if (err instanceof Anthropic.RateLimitError) throw new LlmError('Rate limited by the Anthropic API. Try again shortly.', 'api_error');
      if (err instanceof Anthropic.APIError) throw new LlmError(`Anthropic API error ${err.status}: ${err.message}`, 'api_error');
      throw err;
    }
  }
}

/** Test double: returns queued responses in order and records every request. */
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmRequest[] = [];
  constructor(private responses: (string | Error)[]) {}
  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(req);
    const next = this.responses.shift();
    if (next === undefined) throw new Error('FakeLlmClient: no more queued responses');
    if (next instanceof Error) throw next;
    return { text: next, model: req.model, inputTokens: 1000, outputTokens: 200, stopReason: 'end_turn' };
  }
}
