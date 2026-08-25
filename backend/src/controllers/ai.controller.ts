import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { encrypt, maskSensitive } from '../utils/encryption';
import { llmProviderService, AVAILABLE_MODELS } from '../services/ai/llm-provider.service';
import { contentGeneratorService } from '../services/ai/content-generator.service';
import { validate } from '../middleware/validation';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();
router.use(authenticate);

// ============================================================
// LLM PROVIDER TYPES & MODELS
// ============================================================

router.get('/providers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const providers = llmProviderService.getProviderTypes();
    res.json({ providers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/providers/:type/models', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const models = AVAILABLE_MODELS[req.params.type as keyof typeof AVAILABLE_MODELS] || [];
    res.json({ models });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// LLM CONFIGS (CRUD)
// ============================================================

const createLLMConfigSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().nullable(),
  maxTokens: z.number().min(1).max(32000).default(500),
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).optional().nullable(),
  frequencyPenalty: z.number().min(-2).max(2).optional().nullable(),
  presencePenalty: z.number().min(-2).max(2).optional().nullable(),
  systemPrompt: z.string().optional().nullable(),
  timeout: z.number().min(1000).max(300000).default(60000),
  azureEndpoint: z.string().url().optional().nullable(),
  azureApiVersion: z.string().optional().nullable(),
  requestsPerMinute: z.number().optional().nullable(),
  tokensPerMinute: z.number().optional().nullable(),
  allowedScopes: z.array(z.string()).default([]),
});

// List LLM configs
router.get('/configs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const configs = await prisma.lLMConfig.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    // Mask API keys
    const masked = configs.map((c) => ({
      ...c,
      apiKey: c.encryptedApiKey ? maskSensitive('***') : null,
      encryptedApiKey: undefined,
    }));

    res.json({ configs: masked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create LLM config
router.post('/configs', validate(createLLMConfigSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { apiKey, ...data } = req.body;

    const config = await prisma.lLMConfig.create({
      data: {
        ...data,
        organizationId: req.user!.organizationId,
        encryptedApiKey: apiKey ? encrypt(apiKey) : null,
      },
    });

    await auditLog(req.user!.organizationId, req.user!.id, {
      action: 'LLM_CONFIG_CREATED',
      resource: 'llm_config',
      resourceId: config.id,
      details: { name: config.name, provider: config.provider, model: config.model },
    });

    res.status(201).json({
      config: { ...config, apiKey: apiKey ? maskSensitive('***') : null, encryptedApiKey: undefined },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update LLM config
router.patch('/configs/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = await prisma.lLMConfig.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });

    if (!existing) {
      res.status(404).json({ error: 'LLM config not found' });
      return;
    }

    const { apiKey, ...data } = req.body;

    const config = await prisma.lLMConfig.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(apiKey !== undefined ? { encryptedApiKey: apiKey ? encrypt(apiKey) : null } : {}),
      },
    });

    res.json({
      config: { ...config, apiKey: config.encryptedApiKey ? maskSensitive('***') : null, encryptedApiKey: undefined },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete LLM config
router.delete('/configs/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.lLMConfig.deleteMany({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    res.json({ message: 'LLM config deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test LLM config connection
router.post('/configs/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await prisma.lLMConfig.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });

    if (!config) {
      res.status(404).json({ error: 'LLM config not found' });
      return;
    }

    const { decrypt: decryptFn } = await import('../utils/encryption');
    const apiKey = config.encryptedApiKey ? decryptFn(config.encryptedApiKey) : undefined;

    const result = await llmProviderService.testConnection({
      id: config.id,
      name: config.name,
      provider: config.provider as any,
      apiKey,
      baseUrl: config.baseUrl || undefined,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      timeout: config.timeout,
    });

    // Update test result
    await prisma.lLMConfig.update({
      where: { id: config.id },
      data: {
        lastTestedAt: new Date(),
        lastTestResult: result,
      },
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CONTENT TEMPLATES (CRUD)
// ============================================================

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  content: z.string().min(1),
  category: z.string().optional(),
  language: z.string().default('English'),
  variables: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    defaultValue: z.string().optional(),
    required: z.boolean().default(false),
  })).optional(),
  llmConfigId: z.string().uuid().optional().nullable(),
});

// List content templates
router.get('/templates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, search } = req.query;
    const where: any = { organizationId: req.user!.organizationId, isActive: true };
    if (category) where.category = category;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const templates = await prisma.contentTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ templates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create content template
router.post('/templates', validate(createTemplateSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await prisma.contentTemplate.create({
      data: {
        ...req.body,
        organizationId: req.user!.organizationId,
      },
    });

    res.status(201).json({ template });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update content template
router.patch('/templates/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await prisma.contentTemplate.updateMany({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      data: req.body,
    });

    if (template.count === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const updated = await prisma.contentTemplate.findUnique({ where: { id: req.params.id } });
    res.json({ template: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete content template
router.delete('/templates/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.contentTemplate.deleteMany({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    res.json({ message: 'Template deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CONTENT GENERATION
// ============================================================

const generateSchema = z.object({
  source: z.enum(['user_input', 'template', 'ai_generate', 'ai_from_template']),
  text: z.string().optional(),
  templateId: z.string().uuid().optional(),
  templateText: z.string().optional(),
  variables: z.record(z.string()).optional(),
  llmConfigId: z.string().uuid().optional(),
  aiPrompt: z.string().optional(),
  aiSystemPrompt: z.string().optional(),
  scope: z.string().optional(),
  tone: z.enum(['professional', 'casual', 'friendly', 'formal', 'humorous', 'technical', 'persuasive', 'neutral']).optional(),
  language: z.string().optional(),
  maxLength: z.number().optional(),
  minLength: z.number().optional(),
  context: z.object({
    platform: z.string().optional(),
    engagementType: z.string().optional(),
    targetUrl: z.string().optional(),
    targetContent: z.string().optional(),
    userProfile: z.string().optional(),
    brandVoice: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),
});

// Generate single content
router.post('/generate', validate(generateSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await contentGeneratorService.generate(req.body);

    // Track template usage
    if (req.body.templateId && result.source === 'template') {
      await prisma.contentTemplate.update({
        where: { id: req.body.templateId },
        data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
      }).catch(() => {});
    }

    res.json({ result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Generate multiple variations
router.post('/generate/variations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { count = 3, ...request } = req.body;
    const results = await contentGeneratorService.generateVariations(request, Math.min(count, 10));
    res.json({ results });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Get available scopes
router.get('/scopes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scopes = contentGeneratorService.getScopes();
    res.json({ scopes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
