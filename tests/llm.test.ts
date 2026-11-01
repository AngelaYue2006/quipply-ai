import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { llmCalls } from '../src/db/schema';
import { FakeLlmClient, LlmError } from '../src/llm/client';
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

describe('prompts', () => {
  it('match-fit@1 is the spec prompt', () => {
    const p = loadPrompt('match-fit@1');
    expect(p.startsWith('You compare one job posting with one candidate profile')).toBe(true);
    expect(p).toContain('You do not score or rank; code does that.');
  });
});
