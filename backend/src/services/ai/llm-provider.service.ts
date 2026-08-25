import { createContextLogger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';

const log = createContextLogger('llm-provider');

/**
 * Multi-Provider LLM Service
 * Supports OpenAI, Anthropic, Google Gemini, Mistral, Groq, Ollama, and any OpenAI-compatible API
 * Each provider is configured independently with its own API key, model, and parameters
 */

// ============================================================
// TYPES
// ============================================================

export type LLMProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'groq'
  | 'ollama'
  | 'openrouter'
  | 'together'
  | 'deepseek'
  | 'cohere'
  | 'huggingface'
  | 'azure_openai'
  | 'aws_bedrock'
  | 'custom_openai_compatible';

export interface LLMProviderConfig {
  id: string;
  name: string;
  provider: LLMProviderType;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
  timeout?: number;
  // Azure-specific
  azureEndpoint?: string;
  azureApiVersion?: string;
  // AWS-specific
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  // Rate limiting
  requestsPerMinute?: number;
  tokensPerMinute?: number;
}

export interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  jsonMode?: boolean;
}

export interface GenerateResult {
  content: string;
  tokensUsed: { input: number; output: number; total: number };
  model: string;
  provider: LLMProviderType;
  latencyMs: number;
  finishReason: string;
}

// ============================================================
// PROVIDER DEFINITIONS
// ============================================================

const PROVIDER_DEFAULTS: Record<LLMProviderType, { baseUrl: string; defaultModel: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514' },
  google: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.0-flash' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile' },
  ollama: { baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.1' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'meta-llama/llama-3.1-70b-instruct' },
  together: { baseUrl: 'https://api.together.xyz/v1', defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  cohere: { baseUrl: 'https://api.cohere.ai/v2', defaultModel: 'command-r-plus' },
  huggingface: { baseUrl: 'https://api-inference.huggingface.co/models', defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct' },
  azure_openai: { baseUrl: '', defaultModel: 'gpt-4o' },
  aws_bedrock: { baseUrl: '', defaultModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0' },
  custom_openai_compatible: { baseUrl: '', defaultModel: '' },
};

export const AVAILABLE_MODELS: Record<LLMProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  google: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
  mistral: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest', 'open-mistral-nemo'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  ollama: ['llama3.1', 'llama3.1:70b', 'mistral', 'codellama', 'phi3', 'gemma2'],
  openrouter: ['meta-llama/llama-3.1-70b-instruct', 'anthropic/claude-3.5-sonnet', 'google/gemini-pro-1.5', 'mistralai/mixtral-8x22b-instruct'],
  together: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'mistralai/Mixtral-8x22B-Instruct-v0.1'],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  cohere: ['command-r-plus', 'command-r', 'command'],
  huggingface: ['meta-llama/Meta-Llama-3.1-70B-Instruct', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
  azure_openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-35-turbo'],
  aws_bedrock: ['anthropic.claude-3-5-sonnet-20241022-v2:0', 'anthropic.claude-3-haiku-20240307-v1:0', 'amazon.titan-text-premier-v1:0'],
  custom_openai_compatible: [],
};

// ============================================================
// LLM PROVIDER SERVICE
// ============================================================

export class LLMProviderService {
  /**
   * Get available provider types with their defaults
   */
  getProviderTypes(): Array<{ type: LLMProviderType; name: string; baseUrl: string; defaultModel: string; models: string[] }> {
    return Object.entries(PROVIDER_DEFAULTS).map(([type, defaults]) => ({
      type: type as LLMProviderType,
      name: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      baseUrl: defaults.baseUrl,
      defaultModel: defaults.defaultModel,
      models: AVAILABLE_MODELS[type as LLMProviderType] || [],
    }));
  }

  /**
   * Generate content using a configured LLM provider
   */
  async generate(config: LLMProviderConfig, options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();

    log.info('Generating content', {
      provider: config.provider,
      model: config.model,
      promptLength: options.prompt.length,
    });

    try {
      let result: GenerateResult;

      switch (config.provider) {
        case 'openai':
        case 'groq':
        case 'ollama':
        case 'openrouter':
        case 'together':
        case 'deepseek':
        case 'custom_openai_compatible':
          result = await this.generateOpenAICompatible(config, options);
          break;
        case 'anthropic':
          result = await this.generateAnthropic(config, options);
          break;
        case 'google':
          result = await this.generateGoogle(config, options);
          break;
        case 'mistral':
          result = await this.generateMistral(config, options);
          break;
        case 'cohere':
          result = await this.generateCohere(config, options);
          break;
        case 'azure_openai':
          result = await this.generateAzureOpenAI(config, options);
          break;
        case 'aws_bedrock':
          result = await this.generateAWSBedrock(config, options);
          break;
        case 'huggingface':
          result = await this.generateHuggingFace(config, options);
          break;
        default:
          throw new AppError(400, `Unsupported provider: ${config.provider}`, 'UNSUPPORTED_PROVIDER');
      }

      result.latencyMs = Date.now() - startTime;

      log.info('Content generated', {
        provider: config.provider,
        model: config.model,
        tokensUsed: result.tokensUsed.total,
        latencyMs: result.latencyMs,
      });

      return result;
    } catch (error: any) {
      log.error('Content generation failed', {
        provider: config.provider,
        model: config.model,
        error: error.message,
      });
      throw error;
    }
  }

  // ============================================================
  // OPENAI-COMPATIBLE (works for OpenAI, Groq, Ollama, OpenRouter, Together, DeepSeek)
  // ============================================================

  private async generateOpenAICompatible(
    config: LLMProviderConfig,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    const baseUrl = config.baseUrl || PROVIDER_DEFAULTS[config.provider].baseUrl;
    const url = `${baseUrl}/chat/completions`;

    const body: any = {
      model: config.model,
      messages: [
        ...(options.systemPrompt || config.systemPrompt
          ? [{ role: 'system', content: options.systemPrompt || config.systemPrompt }]
          : []),
        { role: 'user', content: options.prompt },
      ],
      max_tokens: options.maxTokens || config.maxTokens,
      temperature: options.temperature ?? config.temperature,
      top_p: config.topP,
      frequency_penalty: config.frequencyPenalty,
      presence_penalty: config.presencePenalty,
      stop: options.stopSequences,
    };

    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AppError(response.status, `LLM API error: ${error}`, 'LLM_API_ERROR');
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      tokensUsed: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0,
      },
      model: data.model || config.model,
      provider: config.provider,
      latencyMs: 0,
      finishReason: choice?.finish_reason || 'stop',
    };
  }

  // ============================================================
  // ANTHROPIC
  // ============================================================

  private async generateAnthropic(
    config: LLMProviderConfig,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    const baseUrl = config.baseUrl || PROVIDER_DEFAULTS.anthropic.baseUrl;
    const url = `${baseUrl}/v1/messages`;

    const body: any = {
      model: config.model,
      max_tokens: options.maxTokens || config.maxTokens,
      messages: [{ role: 'user', content: options.prompt }],
    };

    const systemPrompt = options.systemPrompt || config.systemPrompt;
    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (options.stopSequences) {
      body.stop_sequences = options.stopSequences;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AppError(response.status, `Anthropic API error: ${error}`, 'LLM_API_ERROR');
    }

    const data = await response.json() as any;

    return {
      content: data.content?.[0]?.text || '',
      tokensUsed: {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0,
        total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      model: data.model || config.model,
      provider: 'anthropic',
      latencyMs: 0,
      finishReason: data.stop_reason || 'end_turn',
    };
  }

  // ============================================================
  // GOOGLE GEMINI
  // ============================================================

  private async generateGoogle(
    config: LLMProviderConfig,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    const baseUrl = config.baseUrl || PROVIDER_DEFAULTS.google.baseUrl;
    const url = `${baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

    const body: any = {
      contents: [{ parts: [{ text: options.prompt }] }],
      generationConfig: {
        maxOutputTokens: options.maxTokens || config.maxTokens,
        temperature: options.temperature ?? config.temperature,
        topP: config.topP,
      },
    };

    const systemPrompt = options.systemPrompt || config.systemPrompt;
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    if (options.jsonMode) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AppError(response.status, `Google API error: ${error}`, 'LLM_API_ERROR');
    }

    const data = await response.json() as any;
    const candidate = data.candidates?.[0];

    return {
      content: candidate?.content?.parts?.[0]?.text || '',
      tokensUsed: {
        input: data.usageMetadata?.promptTokenCount || 0,
        output: data.usageMetadata?.candidatesTokenCount || 0,
        total: data.usageMetadata?.totalTokenCount || 0,
      },
      model: config.model,
      provider: 'google',
      latencyMs: 0,
      finishReason: candidate?.finishReason || 'STOP',
    };
  }

  // ============================================================
  // MISTRAL
  // ============================================================

  private async generateMistral(
    config: LLMProviderConfig,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    const baseUrl = config.baseUrl || PROVIDER_DEFAULTS.mistral.baseUrl;
    const url = `${baseUrl}/chat/completions`;

    const body: any = {
      model: config.model,
      messages: [
        ...(options.systemPrompt || config.systemPrompt
          ? [{ role: 'system', content: options.systemPrompt || config.systemPrompt }]
          : []),
        { role: 'user', content: options.prompt },
      ],
      max_tokens: options.maxTokens || config.maxTokens,
      temperature: options.temperature ?? config.temperature,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AppError(response.status, `Mistral API error: ${error}`, 'LLM_API_ERROR');
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      tokensUsed: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0,
      },
      model: data.model || config.model,
      provider: 'mistral',
      latencyMs: 0,
      finishReason: choice?.finish_reason || 'stop',
    };
  }

  // ============================================================
  // COHERE
  // ============================================================

  private async generateCohere(
    config: LLMProviderConfig,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    const baseUrl = config.baseUrl || PROVIDER_DEFAULTS.cohere.baseUrl;
    const url = `${baseUrl}/chat`;

    const body: any = {
      model: config.model,
      message: options.prompt,
      max_tokens: options.maxTokens || config.maxTokens,
      temperature: options.temperature ?? config.temperature,
      p: config.topP,
    };

    const systemPrompt = options.systemPrompt || config.systemPrompt;
    if (systemPrompt) {
      body.preamble = systemPrompt;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AppError(response.status, `Cohere API error: ${error}`, 'LLM_API_ERROR');
    }

    const data = await response.json() as any;

    return {
      content: data.text || '',
      tokensUsed: {
        input: data.meta?.tokens?.input_tokens || 0,
        output: data.meta?.tokens?.output_tokens || 0,
        total: (data.meta?.tokens?.input_tokens || 0) + (data.meta?.tokens?.output_tokens || 0),
      },
      model: config.model,
      provider: 'cohere',
      latencyMs: 0,
      finishReason: data.finish_reason || 'COMPLETE',
    };
  }

  // ============================================================
  // AZURE OPENAI
  // ============================================================

  private async generateAzureOpenAI(
    config: LLMProviderConfig,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    const endpoint = config.azureEndpoint || config.baseUrl;
    const apiVersion = config.azureApiVersion || '2024-02-01';
    const url = `${endpoint}/openai/deployments/${config.model}/chat/completions?api-version=${apiVersion}`;

    const body: any = {
      messages: [
        ...(options.systemPrompt || config.systemPrompt
          ? [{ role: 'system', content: options.systemPrompt || config.systemPrompt }]
          : []),
        { role: 'user', content: options.prompt },
      ],
      max_tokens: options.maxTokens || config.maxTokens,
      temperature: options.temperature ?? config.temperature,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey || '',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AppError(response.status, `Azure OpenAI error: ${error}`, 'LLM_API_ERROR');
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      tokensUsed: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0,
      },
      model: data.model || config.model,
      provider: 'azure_openai',
      latencyMs: 0,
      finishReason: choice?.finish_reason || 'stop',
    };
  }

  // ============================================================
  // AWS BEDROCK
  // ============================================================

  private async generateAWSBedrock(
    config: LLMProviderConfig,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    // AWS Bedrock uses SigV4 signing — simplified via fetch with credentials
    const region = config.awsRegion || 'us-east-1';
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${config.model}/invoke`;

    // Build body based on model family
    let body: any;
    if (config.model.includes('anthropic') || config.model.includes('claude')) {
      body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: options.maxTokens || config.maxTokens,
        messages: [{ role: 'user', content: options.prompt }],
        ...(options.systemPrompt || config.systemPrompt
          ? { system: options.systemPrompt || config.systemPrompt }
          : {}),
      };
    } else if (config.model.includes('titan')) {
      body = {
        inputText: options.prompt,
        textGenerationConfig: {
          maxTokenCount: options.maxTokens || config.maxTokens,
          temperature: options.temperature ?? config.temperature,
        },
      };
    } else {
      body = { prompt: options.prompt, max_tokens: options.maxTokens || config.maxTokens };
    }

    // Note: In production, use AWS SDK with SigV4 signing
    // This is a simplified version — actual implementation needs @aws-sdk/client-bedrock-runtime
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Target': 'AmazonBedrockRuntimeModel.InvokeModel',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout || 60000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AppError(response.status, `AWS Bedrock error: ${error}`, 'LLM_API_ERROR');
    }

    const data = await response.json() as any;

    let content = '';
    if (data.content?.[0]?.text) content = data.content[0].text;
    else if (data.results?.[0]?.outputText) content = data.results[0].outputText;
    else if (data.generation) content = data.generation;

    return {
      content,
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: config.model,
      provider: 'aws_bedrock',
      latencyMs: 0,
      finishReason: 'stop',
    };
  }

  // ============================================================
  // HUGGING FACE INFERENCE
  // ============================================================

  private async generateHuggingFace(
    config: LLMProviderConfig,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    const baseUrl = config.baseUrl || PROVIDER_DEFAULTS.huggingface.baseUrl;
    const url = `${baseUrl}/${config.model}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        inputs: options.prompt,
        parameters: {
          max_new_tokens: options.maxTokens || config.maxTokens,
          temperature: options.temperature ?? config.temperature,
          top_p: config.topP,
          return_full_text: false,
        },
      }),
      signal: AbortSignal.timeout(config.timeout || 120000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AppError(response.status, `HuggingFace error: ${error}`, 'LLM_API_ERROR');
    }

    const data = await response.json() as any;
    const content = Array.isArray(data) ? data[0]?.generated_text || '' : data.generated_text || '';

    return {
      content,
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: config.model,
      provider: 'huggingface',
      latencyMs: 0,
      finishReason: 'stop',
    };
  }

  /**
   * Test a provider configuration
   */
  async testConnection(config: LLMProviderConfig): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.generate(config, {
        prompt: 'Say "OK" and nothing else.',
        maxTokens: 10,
        temperature: 0,
      });
      return { success: true, latencyMs: Date.now() - start };
    } catch (error: any) {
      return { success: false, latencyMs: Date.now() - start, error: error.message };
    }
  }
}

export const llmProviderService = new LLMProviderService();
