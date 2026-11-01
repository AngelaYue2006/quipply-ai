import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import type { AppContext } from '../app';
import { EditableSettings, saveSettings } from '../../config';
import { llmCalls } from '../../db/schema';

export const settingsRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (app) => {
    const { db, cfg } = ctx;

    const view = () => {
      const costs = db
        .select({
          action: llmCalls.action,
          calls: sql<number>`count(*)`,
          costUsd: sql<number>`coalesce(sum(${llmCalls.costUsd}), 0)`,
          inputTokens: sql<number>`coalesce(sum(${llmCalls.inputTokens}), 0)`,
          outputTokens: sql<number>`coalesce(sum(${llmCalls.outputTokens}), 0)`,
        })
        .from(llmCalls)
        .groupBy(llmCalls.action)
        .all();
      return {
        settings: {
          matchModel: cfg.matchModel,
          importModel: cfg.importModel,
          listingsUrl: cfg.listingsUrl,
          pullWindowDays: cfg.pullWindowDays,
        },
        dataDir: cfg.dataDir,
        apiKeySet: Boolean(cfg.anthropicApiKey),
        costs,
        totalCostUsd: costs.reduce((sum, c) => sum + c.costUsd, 0),
      };
    };

    app.get('/settings', async () => view());

    app.put('/settings', async (req) => {
      saveSettings(cfg, EditableSettings.parse(req.body));
      return view();
    });
  };
