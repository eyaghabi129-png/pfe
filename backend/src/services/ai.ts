import { z } from 'zod';

const baseUrl = process.env.AI_SERVICE_URL;
if (!baseUrl) throw new Error('AI_SERVICE_URL is required');

export const AiAnalyzeResponseSchema = z.object({
  ocr_text: z.string().optional(),
  summary: z.string().optional(),
  label: z.string().optional(),
  confidence: z.number().optional(),
  similar: z.array(z.object({
    doc_id: z.string().optional(),
    score: z.number(),
    title: z.string().optional(),
  })).optional(),
});

export type AiAnalyzeResponse = z.infer<typeof AiAnalyzeResponseSchema>;

export async function analyzeDocument(params: { filename: string; contentType: string; bytesBase64: string }) {
  const r = await fetch(`${baseUrl}/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`AI analyze failed: ${r.status} ${txt}`);
  }
  const json = await r.json();
  return AiAnalyzeResponseSchema.parse(json);
}
