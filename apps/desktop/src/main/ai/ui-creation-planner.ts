import { UiCreationBlueprintSchema, type AiAttachment, type UiCreationBlueprint } from '@qt-ui-copilot/contracts';
import { asJsonValue, type ModelProvider, type ModelRequest } from '@qt-ui-copilot/agent-workflow';
import { ZodError } from 'zod';

export interface UiCreationPlannerInput {
  contextMode?: 'focused_ui' | 'whole_project';
  requirement: string;
  attachments: AiAttachment[];
  targetQtVersion: string;
  fileName?: string;
  rootType?: 'QWidget' | 'QDialog' | 'QMainWindow';
  useProjectResources?: boolean;
  useComponentLibrary?: boolean;
}

export class UiCreationOutputInvalidError extends Error {
  readonly code = 'ui_creation_output_invalid';
  constructor(readonly details: string) { super(`UiCreationBlueprint schema validation failed: ${details}`); }
}

const blueprintDescription = JSON.stringify({
  fileName: 'LoginDialog.ui', rootType: 'QDialog', rootObjectName: 'loginDialog', windowTitle: '登录',
  size: { width: 520, height: 360 },
  layoutTree: { kind: 'layout', className: 'QVBoxLayout', objectName: 'mainLayout', properties: {}, children: [] },
  tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['窗口可以被 Qt uic 编译并预览'],
});

const systemPrompt = [
  '你是 Qt Widgets 界面蓝图规划器。只返回一个 JSON 对象，不要 Markdown、XML、C++、脚本或坐标。',
  '输出必须严格匹配 UiCreationBlueprint。生成的是结构化布局树，不是原始 .ui XML。',
  '目标最低兼容 Qt 5.9.6，只使用 QWidget/QDialog/QMainWindow 和 Qt Designer 常用标准控件、布局及属性。',
  '所有 objectName 必须唯一且符合 C++ 标识符；布局节点的 children 是子控件，widget 节点的 children 只能为空。',
].join(' ');

function errorText(error: unknown): string {
  if (error instanceof ZodError) return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
  return error instanceof Error ? error.message : String(error);
}

function parseBlueprint(value: unknown): UiCreationBlueprint {
  const parsed = asJsonValue(value);
  const result = UiCreationBlueprintSchema.safeParse(parsed);
  if (!result.success) throw new UiCreationOutputInvalidError(errorText(result.error));
  return result.data;
}

/** Model-facing planner. It never accepts or emits raw XML. */
export class UiCreationPlanner {
  constructor(private readonly model: ModelProvider) {}

  async plan(input: UiCreationPlannerInput): Promise<UiCreationBlueprint> {
    const attachments = input.attachments.map(({ dataUrl: _dataUrl, text: _text, ...metadata }) => metadata);
    const visualAttachments = input.attachments
      .filter((attachment) => attachment.kind === 'image' && attachment.dataUrl)
      .map((attachment) => ({ name: attachment.name, mimeType: attachment.mimeType, dataUrl: attachment.dataUrl }));
    const requestInput: Record<string, unknown> = {
      requirement: input.requirement.trim(), contextMode: input.contextMode ?? 'focused_ui', targetQtVersion: input.targetQtVersion,
      fileName: input.fileName, rootType: input.rootType,
      useProjectResources: input.useProjectResources ?? true, useComponentLibrary: input.useComponentLibrary ?? true,
      attachments, visualAttachments, allowedBlueprintSchema: blueprintDescription,
    };
    try {
      return parseBlueprint(await this.model.generate(this.request(requestInput)));
    } catch (firstError) {
      const repaired = await this.model.generate(this.request({
        ...requestInput,
        visualAttachments: [],
        invalidResponse: asJsonValue(firstError instanceof UiCreationOutputInvalidError ? firstError.details : firstError),
        validationError: errorText(firstError),
        repair: true,
      }));
      return parseBlueprint(repaired);
    }
  }

  private request(input: Record<string, unknown>): ModelRequest {
    return { kind: 'ui_creation', systemPrompt, input, responseSchema: blueprintDescription };
  }
}
