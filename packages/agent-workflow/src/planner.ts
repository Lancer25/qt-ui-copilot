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

/**
 * This is deliberately more explicit than a JSON Schema summary.  Several
 * OpenAI-compatible models (notably Qwen variants) will otherwise invent
 * snake_case operation names or put operation fields under `target`.
 * Keeping the examples here also means a format-repair request has exactly
 * the same contract as the initial planning request.
 */
const uiPlanSchemaDescription = JSON.stringify({
  output: {
    summary: 'non-empty string',
    riskLevel: 'one of: low, medium, high',
    operations: 'non-empty array of UiOperation objects',
    expectedResults: 'array of non-empty strings (may be empty)',
    componentIds: 'array of non-empty strings (may be empty)',
  },
  rules: [
    'Return one JSON object only; do not use Markdown fences.',
    'Use the exact camelCase op values below. Never use add_widget, set_property, set_size_policy, or any other invented op.',
    'Every operation must contain exactly the fields shown for its op. Do not rename fields, omit required fields, or add unknown fields.',
    'Use objectName/target names from the supplied semantic tree. Do not emit XML, C++, shell commands, or UI coordinates.',
  ],
  allowedOperations: {
    addWidget: {
      required: ['op', 'parentLayout', 'widgetClass', 'objectName'],
      optional: ['before', 'properties'],
      example: { op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testConnectionButton', before: 'saveButton', properties: { text: '测试连接' } },
    },
    removeWidget: { required: ['op', 'target'], example: { op: 'removeWidget', target: 'obsoleteButton' } },
    moveWidget: { required: ['op', 'target', 'parentLayout'], optional: ['before'], example: { op: 'moveWidget', target: 'saveButton', parentLayout: 'buttonLayout', before: 'cancelButton' } },
    setProperty: { required: ['op', 'target', 'name', 'value'], example: { op: 'setProperty', target: 'saveButton', name: 'text', value: '保存' } },
    createLayout: { required: ['op', 'parentWidget', 'layoutClass', 'objectName'], example: { op: 'createLayout', parentWidget: 'settingsPage', layoutClass: 'QVBoxLayout', objectName: 'mainLayout' } },
    wrapInLayout: { required: ['op', 'targets', 'layoutClass', 'objectName'], example: { op: 'wrapInLayout', targets: ['serverLabel', 'serverLineEdit'], layoutClass: 'QHBoxLayout', objectName: 'serverRowLayout' } },
    setLayoutProperty: { required: ['op', 'target', 'name', 'value'], example: { op: 'setLayoutProperty', target: 'buttonLayout', name: 'spacing', value: 8 } },
    addSpacer: { required: ['op', 'parentLayout', 'objectName', 'orientation', 'sizeType'], example: { op: 'addSpacer', parentLayout: 'buttonLayout', objectName: 'buttonSpacer', orientation: 'Horizontal', sizeType: 'Expanding' } },
    setSizePolicy: { required: ['op', 'target', 'horizontal', 'vertical'], optional: ['horizontalStretch', 'verticalStretch'], example: { op: 'setSizePolicy', target: 'testConnectionButton', horizontal: 'Preferred', vertical: 'Fixed' } },
    setTabOrder: { required: ['op', 'order'], example: { op: 'setTabOrder', order: ['serverLineEdit', 'portSpinBox', 'saveButton'] } },
    setBuddy: { required: ['op', 'label', 'buddy'], example: { op: 'setBuddy', label: 'serverLabel', buddy: 'serverLineEdit' } },
    addExistingConnection: { required: ['op', 'sender', 'signal', 'receiver', 'slot'], example: { op: 'addExistingConnection', sender: 'testConnectionButton', signal: 'clicked()', receiver: 'NetworkSettings', slot: 'testConnection()' } },
    insertComponent: { required: ['op', 'componentId', 'parentLayout', 'objectPrefix'], optional: ['before'], example: { op: 'insertComponent', componentId: 'connection-panel', parentLayout: 'mainLayout', objectPrefix: 'connection' } },
  },
  valueRules: [
    'setProperty.value may be a string, number, boolean, or the documented enum/size/rect/stringList/icon object.',
    'layoutClass must be QHBoxLayout, QVBoxLayout, QGridLayout, or QFormLayout.',
    'setLayoutProperty.name must be spacing, leftMargin, topMargin, rightMargin, bottomMargin, or stretch.',
    'setSizePolicy values must be Fixed, Minimum, Maximum, Preferred, Expanding, MinimumExpanding, or Ignored.',
  ],
});

const plannerSystemPrompt = [
  'Return JSON only: one object matching the supplied UiPlan contract.',
  'Plan Qt Designer UI changes only. Never emit XML, source code, shell commands, coordinates, or an operation outside the contract.',
  'Use only the exact camelCase operation names and field names in allowedOperationSchema. In particular, addWidget uses parentLayout/widgetClass/objectName, setProperty uses target/name/value, and setSizePolicy uses target/horizontal/vertical.',
  'Do not translate operation names or fields to snake_case. Do not wrap JSON in Markdown fences. If a requested change cannot be represented safely, return the smallest valid plan and explain the limitation in summary.',
].join(' ');

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
        invalidResponse: asJsonValue(initial),
        validationError: schemaError(firstError),
        originalRequirement: context.requirement,
        originalContext: {
          targetSemanticTree: context.targetSemanticTree,
          runtimeFacts: context.runtimeFacts,
          componentCandidates: [...(context.componentCandidates ?? [])].slice(0, 3),
          previousFindings: context.previousFindings ?? [],
        },
        allowedOperationSchema: uiPlanSchemaDescription,
      }));
      try { return UiPlanSchema.parse(asJsonValue(repaired)); }
      catch (secondError) { throw new ModelOutputInvalidError('UiPlan', schemaError(secondError)); }
    }
  }

  private request(kind: ModelRequest['kind'], input: Record<string, unknown>): ModelRequest {
    return {
      kind,
      systemPrompt: plannerSystemPrompt,
      input,
      responseSchema: uiPlanSchemaDescription,
    };
  }
}
