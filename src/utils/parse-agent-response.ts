import { z } from "zod";
import { extractJsonFromContent } from "./json-extractor";

const FindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  suggestion: z.string(),
  filePath: z.string().optional(),
  lineStart: z.number().int().optional(),
  lineEnd: z.number().int().optional(),
  confidence: z.number().min(0).max(1).optional(),
  skillId: z.string().optional(),
});

const ResponseSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string(),
});

export type RawFinding = z.infer<typeof FindingSchema>;

export interface ParseResult {
  findings: RawFinding[];
  summary: string;
  error?: string;
}

export function parseAgentResponse(content: string): ParseResult {
  const jsonStr = extractJsonFromContent(content);

  if (!jsonStr) {
    return { findings: [], summary: content.slice(0, 200), error: "no JSON found in response" };
  }

  try {
    const parsed = ResponseSchema.parse(JSON.parse(jsonStr));
    return { findings: parsed.findings, summary: parsed.summary };
  } catch (err) {
    return { findings: [], summary: "", error: `failed to parse JSON response: ${err}` };
  }
}
