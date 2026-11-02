import type { AppConfig } from '../config';
import { AnthropicLlmClient, RoutingLlmClient, type LlmClient } from './client';
import { GeminiLlmClient } from './gemini';

/** The app's model client: picks Anthropic or Gemini from each request's model ID. */
export function createLlmClient(cfg: Pick<AppConfig, 'anthropicApiKey' | 'geminiApiKey'>): LlmClient {
  return new RoutingLlmClient({
    anthropic: () => new AnthropicLlmClient(cfg.anthropicApiKey),
    gemini: () => new GeminiLlmClient(cfg.geminiApiKey),
  });
}
