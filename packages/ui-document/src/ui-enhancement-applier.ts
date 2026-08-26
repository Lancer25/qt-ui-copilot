import { VisualEnhancementOperationSchema, type EnhancementWarning, type VisualEnhancementOperation } from '@qt-ui-copilot/contracts';
import { applyOperations } from './apply-operations.js';
import { parseUi } from './parse-ui.js';

export interface EnhancementApplyResult { source: string; applied: boolean; warning?: EnhancementWarning; }

const styleTokens: Record<string, string> = {
  primary: 'QPushButton { font-weight: 600; }', secondary: 'QPushButton { opacity: 0.85; }', danger: 'QPushButton { color: #d9534f; }',
  title: 'font-weight: 700;', muted: 'color: #7d8794;', panel: 'background: palette(alternate-base);',
};

export function applyEnhancement(source: string, operation: VisualEnhancementOperation, filePath = 'candidate.ui'): EnhancementApplyResult {
  const parsed = parseUi(source, filePath);
  const targetExists = parsed.index.widgetsByName.has(operation.target) || parsed.index.layoutsByName.has(operation.target);
  if (!targetExists) return { source, applied: false, warning: { code: 'unknown_target', target: operation.target, operation: operation.op, message: `目标对象不存在：${operation.target}` } };
  try {
    const ops = toUiOperations(operation);
    if (!ops.length) return { source, applied: false, warning: { code: 'unsupported_value', target: operation.target, operation: operation.op, message: `增强操作未产生可应用属性：${operation.op}` } };
    const result = applyOperations(parsed, ops);
    return { source: result.source, applied: true };
  } catch (error) {
    return { source, applied: false, warning: { code: 'apply_failed', target: operation.target, operation: operation.op, message: error instanceof Error ? error.message : String(error) } };
  }
}

function toUiOperations(operation: VisualEnhancementOperation) {
  const value = VisualEnhancementOperationSchema.parse(operation);
  switch (value.op) {
    case 'setFont': return [{ op: 'setProperty' as const, target: value.target, name: 'font', value: { kind: 'font' as const, ...value.value } }];
    case 'setSizeBounds': return [
      ...(value.minimum ? [{ op: 'setProperty' as const, target: value.target, name: 'minimumSize', value: { kind: 'size' as const, ...value.minimum } }] : []),
      ...(value.maximum ? [{ op: 'setProperty' as const, target: value.target, name: 'maximumSize', value: { kind: 'size' as const, ...value.maximum } }] : []),
    ];
    case 'setLayoutMetrics': return [
      ...(value.spacing === undefined ? [] : [{ op: 'setLayoutProperty' as const, target: value.target, name: 'spacing' as const, value: value.spacing }]),
      ...(value.stretch === undefined ? [] : [{ op: 'setLayoutProperty' as const, target: value.target, name: 'stretch' as const, value: value.stretch }]),
    ];
    case 'setAlignment': return [{ op: 'setProperty' as const, target: value.target, name: 'alignment', value: { kind: 'enum' as const, value: value.value } }];
    case 'setStyleToken': return [{ op: 'setProperty' as const, target: value.target, name: 'styleSheet', value: styleTokens[value.token] }];
    case 'setResource': return [{ op: 'setProperty' as const, target: value.target, name: 'icon', value: { kind: 'icon' as const, resourcePath: value.resourcePath } }];
  }
}
