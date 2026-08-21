import { VisualReviewSchema, type VisualReview } from '@qt-ui-copilot/contracts';
import { ZodError } from 'zod';
import { asJsonValue, type ModelProvider, type ModelRequest } from './model-provider.js';
import { ModelOutputInvalidError } from './planner.js';

export interface DeterministicFinding {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  target?: string;
}

export interface VisualReviewContext {
  beforeImage: string;
  afterImage: string;
  expectedResults: readonly string[];
  deterministicFindings: readonly DeterministicFinding[];
  referenceImage?: string;
}

const schema = JSON.stringify({ requirementSatisfied: 'boolean', score: '0..100', blockingIssues: 'VisualFinding[]', suggestions: 'VisualFinding[]' });

function errorText(error: unknown): string {
  if (error instanceof ZodError) return error.issues.map((issue) => issue.message).join('; ');
  return error instanceof Error ? error.message : String(error);
}

/** Independent visual judgement. Planner rationale is intentionally absent. */
export class VisualCritic {
  constructor(private readonly model: ModelProvider) {}

  async review(context: VisualReviewContext): Promise<VisualReview> {
    const input: Record<string, unknown> = {
      beforeImage: context.beforeImage, afterImage: context.afterImage, referenceImage: context.referenceImage,
      expectedResults: context.expectedResults, deterministicFindings: context.deterministicFindings,
    };
    const raw = await this.model.generate({
      kind: 'visual_review',
      systemPrompt: 'Independently review the before/after UI images against expected results. Return JSON only. Do not infer planner intent beyond the supplied expected results.',
      input,
      responseSchema: schema,
    });
    let review: VisualReview;
    try { review = VisualReviewSchema.parse(asJsonValue(raw)); }
    catch (error) { throw new ModelOutputInvalidError('VisualReview', errorText(error)); }

    const deterministicFailures = context.deterministicFindings.filter((finding) => finding.severity === 'error');
    if (deterministicFailures.length === 0) return review;
    return {
      ...review,
      requirementSatisfied: false,
      score: Math.min(review.score, 49),
      blockingIssues: [
        ...deterministicFailures.map((finding) => ({ type: 'deterministic_failure', target: finding.target, description: `${finding.code}: ${finding.message}`, confidence: 1 })),
        ...review.blockingIssues,
      ],
    };
  }
}
