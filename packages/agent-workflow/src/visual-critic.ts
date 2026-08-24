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

/**
 * Returns a bounded category for provider failures that make visual review
 * unavailable. Schema/format errors intentionally return undefined: those
 * indicate a broken model response and must still fail the workflow rather
 * than silently degrading the review.
 */
export function classifyVisualReviewUnavailable(error: unknown): 'timeout' | 'network_error' | 'model_unavailable' | 'provider_unavailable' | undefined {
  if (error instanceof ModelOutputInvalidError) return undefined;
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/aborterror|timed?\s*out|timeout/i.test(message)) return 'timeout';
  if (/\bHTTP\s+(404)\b|model\s+(?:not\s+found|unavailable)|endpoint\s+(?:not\s+found|unavailable)/i.test(message)) return 'model_unavailable';
  if (/\bHTTP\s+(?:408|429|5\d\d)\b|service\s+unavailable|provider\s+unavailable/i.test(message)) return 'provider_unavailable';
  if (/fetch\s+failed|network|econn(?:refused|reset)|enotfound|socket|connect(?:ion)?\s+(?:refused|reset|timed?\s*out)/i.test(message)) return 'network_error';
  return undefined;
}

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
