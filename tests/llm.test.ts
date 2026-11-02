import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { llmCalls } from '../src/db/schema';
import { FakeLlmClient, LlmError, RoutingLlmClient } from '../src/llm/client';
import { createLlmClient } from '../src/llm/create';
import { buildGeminiParams } from '../src/llm/gemini';
import { costUsd, loadPrompt, structured } from '../src/llm/structured';
import { testDb } from './helpers';

const Schema = z.object({ answer: z.string() });
const base = { action: 'test', model: 'claude-haiku-5-5', promptVersion: 'test@1', system: 'sys', userText: 'hi', schema: Schema };

describe('structured()', () => {
  it('returns validated data and logs one call with cost', async () => {
    const db = testDb();
    const res = await structured({ db, client: new FakeLlmClient(['{"answer":"yes"}']), ...base });
    expect(res.data).toEqual({ answer: 'yes' });
    const rows = db.select().from(llmCalls).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'test', model: 'claude-haiku-5-5', promptVersion: 'test@1', inputTokens: 1000, outputTokens: 200, ok: true });
    expect(rows[0]!.costUsd).toBeCloseTo(costUsd('claude-haiku-5-5', 1000, 200));
  });

  it('makes one repair attempt on invalid output and logs both attempts', async () => {
    const db = testDb();
    const client = new FakeLlmClient(['{"answer": 42}', '{"answer":"fixed"}']);
    const res = await structured({ db, client, ...base });
    expect(res.data.answer).toBe('fixed');
    expect(client.requests[1]!.history?.at(-1)?.text).toMatch(/did not match/);
    const rows = db.select().from(llmCalls).all();
    expect(rows.map((r) => r.ok)).toEqual([false, true]);
  });

  it('gives up after the repair attempt fails', async () => {
    const db = testDb();
    const client = new FakeLlmClient(['not json', '{"wrong":true}']);
    await expect(structured({ db, client, ...base })).rejects.toBeInstanceOf(LlmError);
    expect(db.select().from(llmCalls).all()).toHaveLength(2);
  });

  it('logs failed calls too', async () => {
    const db = testDb();
    const client = new FakeLlmClient([new LlmError('declined', 'refusal')]);
    await expect(structured({ db, client, ...base })).rejects.toThrow('declined');
    expect(db.select().from(llmCalls).get()).toMatchObject({ ok: false, error: 'declined' });
  });
});

describe('provider routing', () => {
  it('sends gemini-* and claude-* models to their own clients', async () => {
    const gemini = new FakeLlmClient(['{"answer":"g"}']);
    const anthropic = new FakeLlmClient(['{"answer":"a"}']);
    const router = new RoutingLlmClient({ gemini: () => gemini, anthropic: () => anthropic });
    const req = { system: 's', userText: 'u', schema: Schema, maxTokens: 100 };
    expect((await router.complete({ ...req, model: 'gemini-3.5-flash-lite' })).text).toContain('"g"');
    expect((await router.complete({ ...req, model: 'claude-haiku-5-5' })).text).toContain('"a"');
    await expect(router.complete({ ...req, model: 'gpt-5' })).rejects.toThrow(/Unknown model/);
  });

  it('only fails the provider whose key is missing', async () => {
    const router = createLlmClient({ anthropicApiKey: '', geminiApiKey: '' });
    const req = { system: 's', userText: 'u', schema: Schema, maxTokens: 100 };
    await expect(router.complete({ ...req, model: 'gemini-3.8-flash' })).rejects.toThrow('GEMINI_API_KEY is not set');
    await expect(router.complete({ ...req, model: 'claude-opus-5-5' })).rejects.toThrow('ANTHROPIC_API_KEY is not set');
  });

  it('builds a Gemini request with the schema, the PDF and the repair turns, and does not store it', () => {
    const params = buildGeminiParams({
      model: 'gemini-3.8-flash',
      system: 'sys',
      userText: 'read this',
      documents: [{ kind: 'pdf', base64: 'JVBERi0=' }],
      history: [
        { role: 'assistant', text: '{"answer":1}' },
        { role: 'user', text: 'fix it' },
      ],
      schema: Schema,
      maxTokens: 4000,
    });
    expect(params).toMatchObject({
      model: 'gemini-3.8-flash',
      system_instruction: 'sys',
      store: false,
      generation_config: { max_output_tokens: 4000 },
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] },
      },
    });
    expect(params.response_format.schema).not.toHaveProperty('$schema');
    expect(params.input).toEqual([
      {
        type: 'user_input',
        content: [
          { type: 'document', data: 'JVBERi0=', mime_type: 'application/pdf' },
          { type: 'text', text: 'read this' },
        ],
      },
      { type: 'model_output', content: [{ type: 'text', text: '{"answer":1}' }] },
      { type: 'user_input', content: [{ type: 'text', text: 'fix it' }] },
    ]);
  });

  it('prices Gemini output including thinking tokens', () => {
    expect(costUsd('gemini-3.5-flash-lite', 1_000_000, 1_000_000)).toBeCloseTo(2.8);
  });
});

describe('prompts', () => {
  it('match-fit@1 is the spec prompt', () => {
    const p = loadPrompt('match-fit@1');
    expect(p.startsWith('You compare one job posting with one candidate profile')).toBe(true);
    expect(p).toContain('You do not score or rank; code does that.');
  });
});
