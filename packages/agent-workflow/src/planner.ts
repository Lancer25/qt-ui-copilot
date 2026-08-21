import { UiPlanSchema, type UiPlan } from '@qt-ui-copilot/contracts';
import { ZodError } from 'zod';
import { asJsonValue, type ModelProvider, type ModelRequest } from './model-provider.js';

export interface UiPlannerContext {
  requirement: string;
  targetSemanticTree: unknown;
  runtimeFacts: unknown;
  componentCandidates?: readonly unknown[];
  previousFindings?: readonly unknown[];
}

export class ModelOutputInvalidError extends Error {
  readonly code = 'model_output_invalid';
  constructor(readonly subject: 'UiPlan' | 'VisualReview', readonly details: string) {
    super(`${subject} schema validation failed: ${details}`);
  }
}

function schemaError(error: unknown): string {
  if (error instanceof ZodError) return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
  return error instanceof Error ? error.message : String(error);
}

const uiPlanSchemaDescription = JSON.stringify({
  summary: 'string', riskLevel: 'low | medium | high',
  operations: {
    oneOf: ['addWidget', 'removeWidget', 'moveWidget', 'setProperty', 'createLayout', 'wrapInLayout', 'setLayoutProperty', 'addSpacer', 'setSizePolicy', 'setTabOrder', 'setBuddy', 'addExistingConnection', 'insertComponent'],
    note: 'Each object must conform exactly to the shared UiOperation schema supplied by the host.',
  },
  expectedResults: ['string'], componentIds: ['string'],
});

/** Produces only constrained UiOperation plans; it never accepts raw XML. */
export class UiPlanner {
  constructor(private readonly model: ModelProvider) {}

  async plan(context: UiPlannerContext): Promise<UiPlan> {
    const input: Record<string, unknown> = {
      requirement: context.requirement,
      targetSemanticTree: context.targetSemanticTree,
      runtimeFacts: context.runtimeFacts,
      componentCandidates: [...(context.componentCandidates ?? [])].slice(0, 3),
      allowedOperationSchema: uiPlanSchemaDescription,
      previousFindings: context.previousFindings ?? [],
    };
    const initial = await this.model.generate(this.request('ui_plan', input));
    try { return UiPlanSchema.parse(asJsonValue(initial)); }
    catch (firstError) {
      const repaired = await this.model.generate(this.request('format_repair', {
        invalidResponse: asJsonValue(initial), validationError: schemaError(firstError), originalInput: input,
      }));
      try { return UiPlanSchema.parse(asJsonValue(repaired)); }
      catch (secondError) { throw new ModelOutputInvalidError('UiPlan', schemaError(secondError)); }
    }
  }

  private request(kind: ModelRequest['kind'], input: Record<string, unknown>): ModelRequest {
    return {
      kind,
      systemPrompt: 'Return JSON only. Plan Qt Designer UI changes only as allowed UiOperation values. Never emit XML, source code, shell commands, or an operation outside the schema.',
      input,
      responseSchema: uiPlanSchemaDescription,
    };
  }
}
