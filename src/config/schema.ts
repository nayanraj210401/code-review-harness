import { z } from "zod";

const ProviderConfigSchema = z.object({
  id: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string(),
  rateLimit: z
    .object({
      requestsPerMinute: z.number().positive(),
      tokensPerMinute: z.number().positive(),
    })
    .optional(),
});

const AgentPresetSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const SkillPresetSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
});

export const CRHConfigSchema = z.object({
  version: z.number(),
  defaultProvider: z.string(),
  defaultLevel: z.enum(["quick", "standard", "deep"]),
  defaultFormat: z.enum(["json", "markdown", "pretty", "sarif"]),
  router: z.object({
    model: z.string(),
    enabled: z.boolean(),
  }),
  providers: z.record(z.string(), ProviderConfigSchema),
  agents: z.record(z.string(), AgentPresetSchema),
  skills: z.record(z.string(), SkillPresetSchema),
  councilMode: z.object({
    enabled: z.boolean(),
    defaultAgent: z.string(),
    defaultModels: z.array(z.string()).min(2),
    chairModel: z.string(),
    rounds: z.number().int().min(1).max(3),
  }),
  dbPath: z.string(),
  skillsDir: z.string(),
  agentsDir: z.string(),
  logLevel: z.enum(["debug", "info", "warn", "error"]),
  telemetry: z.boolean(),
});
