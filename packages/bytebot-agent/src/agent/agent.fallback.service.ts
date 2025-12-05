import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Message } from '@prisma/client';
import {
  BytebotAgentService,
  BytebotAgentResponse,
  BytebotAgentInterrupt,
} from './agent.types';

/**
 * Fallback service that tries multiple providers in sequence
 * Primary: Ollama (via proxy)
 * Secondary: Google/Gemini
 * Tertiary: Other configured providers
 */
@Injectable()
export class AgentFallbackService implements BytebotAgentService {
  private readonly logger = new Logger(AgentFallbackService.name);
  private readonly fallbackChain: Array<{
    provider: string;
    service: BytebotAgentService;
    model: string;
  }> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly services: Record<string, BytebotAgentService>,
  ) {
    this.initializeFallbackChain();
  }

  /**
   * Initialize the fallback chain based on configuration
   * Priority: Ollama (proxy) -> Google -> Others
   * Default: Always try Ollama first, fallback to Gemini if Ollama fails
   */
  private initializeFallbackChain() {
    const proxyUrl =
      this.configService.get<string>('BYTEBOT_LLM_PROXY_URL') ||
      'http://localhost:4000'; // Default to local LiteLLM proxy
    const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');
    const anthropicApiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');

    // Primary: Ollama via proxy (default, always try first)
    // Try to use Ollama even if proxy URL is not explicitly set (defaults to localhost:4000)
    if (this.services['proxy']) {
      const ollamaModel = this.configService.get<string>(
        'OLLAMA_MODEL',
        'ollama/llama3.1',
      );
      this.fallbackChain.push({
        provider: 'proxy',
        service: this.services['proxy'],
        model: ollamaModel,
      });
      this.logger.log(
        `Configured Ollama as primary provider: ${ollamaModel} (proxy: ${proxyUrl})`,
      );
    } else {
      this.logger.warn(
        'Proxy service not available. Ollama will not be used as primary provider.',
      );
    }

    // Secondary: Google/Gemini (always include as fallback if configured)
    if (geminiApiKey && this.services['google']) {
      const geminiModel = this.configService.get<string>(
        'GEMINI_MODEL',
        'gemini-2.0-flash-exp',
      );
      this.fallbackChain.push({
        provider: 'google',
        service: this.services['google'],
        model: geminiModel,
      });
      this.logger.log(
        `Configured Google Gemini as secondary provider (fallback): ${geminiModel}`,
      );
    } else {
      this.logger.warn(
        'Google Gemini API key not configured. Will not be available as fallback.',
      );
    }

    // Tertiary: Other providers (if configured)
    if (anthropicApiKey && this.services['anthropic']) {
      const anthropicModel = this.configService.get<string>(
        'ANTHROPIC_MODEL',
        'claude-3-5-sonnet-20241022',
      );
      this.fallbackChain.push({
        provider: 'anthropic',
        service: this.services['anthropic'],
        model: anthropicModel,
      });
      this.logger.log(
        `Configured Anthropic as tertiary provider: ${anthropicModel}`,
      );
    }

    if (openaiApiKey && this.services['openai']) {
      const openaiModel = this.configService.get<string>(
        'OPENAI_MODEL',
        'gpt-4o',
      );
      this.fallbackChain.push({
        provider: 'openai',
        service: this.services['openai'],
        model: openaiModel,
      });
      this.logger.log(`Configured OpenAI as tertiary provider: ${openaiModel}`);
    }

    if (this.fallbackChain.length === 0) {
      this.logger.warn(
        'No fallback providers configured. Please set at least one provider.',
      );
    } else {
      this.logger.log(
        `Initialized fallback chain with ${this.fallbackChain.length} provider(s)`,
      );
    }
  }

  /**
   * Generate message with fallback support
   * Tries each provider in the chain until one succeeds
   */
  async generateMessage(
    systemPrompt: string,
    messages: Message[],
    model?: string,
    useTools: boolean = true,
    signal?: AbortSignal,
  ): Promise<BytebotAgentResponse> {
    // If a specific model is requested, try to use it first
    if (model) {
      const requestedProvider = this.findProviderForModel(model);
      if (requestedProvider) {
        try {
          this.logger.debug(
            `Attempting to use requested model: ${model} via ${requestedProvider.provider}`,
          );
          return await requestedProvider.service.generateMessage(
            systemPrompt,
            messages,
            model,
            useTools,
            signal,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to use requested model ${model}: ${error.message}. Falling back to chain.`,
          );
          // Fall through to fallback chain
        }
      }
    }

    // Try each provider in the fallback chain
    const errors: Array<{ provider: string; error: string }> = [];

    for (const fallback of this.fallbackChain) {
      try {
        this.logger.debug(
          `Attempting to generate message with ${fallback.provider} using model ${fallback.model}`,
        );

        const response = await fallback.service.generateMessage(
          systemPrompt,
          messages,
          fallback.model,
          useTools,
          signal,
        );

        this.logger.log(
          `Successfully generated message using ${fallback.provider} with model ${fallback.model}`,
        );
        return response;
      } catch (error: any) {
        // Check if it's an abort signal - don't retry
        if (error instanceof BytebotAgentInterrupt) {
          throw error;
        }

        const errorMessage = error?.message || 'Unknown error';
        errors.push({ provider: fallback.provider, error: errorMessage });

        this.logger.warn(
          `Provider ${fallback.provider} failed: ${errorMessage}. Trying next provider...`,
        );

        // Continue to next provider
        continue;
      }
    }

    // All providers failed
    const errorMessages = errors
      .map((e) => `${e.provider}: ${e.error}`)
      .join('; ');
    const finalError = new Error(
      `All fallback providers failed. Errors: ${errorMessages}`,
    );
    this.logger.error(finalError.message);
    throw finalError;
  }

  /**
   * Find the provider service for a given model name
   */
  private findProviderForModel(model: string): {
    provider: string;
    service: BytebotAgentService;
    model: string;
  } | null {
    // Check if model matches any in the fallback chain
    for (const fallback of this.fallbackChain) {
      if (model === fallback.model || model.includes(fallback.provider)) {
        return fallback;
      }
    }

    // Try to infer provider from model name
    if (model.startsWith('ollama/') || model.includes('ollama')) {
      return this.fallbackChain.find((f) => f.provider === 'proxy') || null;
    }
    if (model.includes('gemini') || model.includes('google')) {
      return this.fallbackChain.find((f) => f.provider === 'google') || null;
    }
    if (model.includes('claude') || model.includes('anthropic')) {
      return this.fallbackChain.find((f) => f.provider === 'anthropic') || null;
    }
    if (model.includes('gpt') || model.includes('openai')) {
      return this.fallbackChain.find((f) => f.provider === 'openai') || null;
    }

    return null;
  }

  /**
   * Get the default model (first in fallback chain)
   */
  getDefaultModel(): { provider: string; model: string } | null {
    if (this.fallbackChain.length === 0) {
      return null;
    }
    const primary = this.fallbackChain[0];
    return {
      provider: primary.provider,
      model: primary.model,
    };
  }

  /**
   * Get all available providers in the fallback chain
   */
  getAvailableProviders(): Array<{ provider: string; model: string }> {
    return this.fallbackChain.map((f) => ({
      provider: f.provider,
      model: f.model,
    }));
  }
}

