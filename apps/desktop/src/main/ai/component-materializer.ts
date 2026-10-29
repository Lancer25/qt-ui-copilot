import type { BinaryComponentBuildMetadata, CanonicalUiIntent, ComponentRecord, UiCapabilityCandidate } from '@qt-ui-copilot/contracts';
import { buildInsertComponentOperation, type ComponentCatalog } from '@qt-ui-copilot/component-library';
import { applyOperations, ensurePromotedWidget, parseUi } from '@qt-ui-copilot/ui-document';

export interface ComponentMaterializationResult {
  source: string;
  componentIds: string[];
  stylesheets: string[];
  binaryComponents: BinaryComponentBuildMetadata[];
  warnings: Array<{ code: string; message: string }>;
}

interface Placement { capabilityId: string; objectName: string; parentLayout?: string }
const PREFIX = 'local.ui_fragment.';

function placements(intent: CanonicalUiIntent): Placement[] {
  const result: Placement[] = [];
  const visit = (node: CanonicalUiIntent['tree'], parentLayout?: string): void => {
    if (node.capabilityId && node.objectName) result.push({ capabilityId: node.capabilityId, objectName: node.objectName, ...(parentLayout ? { parentLayout } : {}) });
    const nextLayout = node.kind === 'layout' && node.objectName ? node.objectName : parentLayout;
    node.children.forEach((child) => visit(child, nextLayout));
  };
  visit(intent.tree);
  return result;
}

/** Applies only records previously indexed by the application-owned catalogue. */
export function materializeComponents(input: { source: string; intent: CanonicalUiIntent; candidates: UiCapabilityCandidate[]; catalog: Pick<ComponentCatalog, 'get'> & { getByCapabilityId?(capabilityId: string): ComponentRecord | undefined; getStylesheetsByCapabilityId?(capabilityId: string): string[] } }): ComponentMaterializationResult {
  let source = input.source;
  const warnings: ComponentMaterializationResult['warnings'] = [];
  const applied = new Set<string>();
  const stylesheets = new Set<string>();
  const binaryComponents = new Map<string, BinaryComponentBuildMetadata>();
  // Blocked candidates can appear in model output, but never change a UI or
  // a build. A binary candidate reaches ready only after mapping approval and
  // Kit ABI validation in ComponentSourceService.
  const allowed = new Map(input.candidates
    .filter((candidate) => candidate.dependencyStatus === 'ready' && (candidate.kind === 'ui_fragment' || candidate.kind === 'promoted_widget'))
    .map((candidate) => [candidate.capabilityId, candidate]));
  const requested = placements(input.intent).filter((placement) => allowed.has(placement.capabilityId));
  const rootLayout = input.intent.tree.kind === 'layout' ? input.intent.tree.objectName : undefined;
  const queue: Placement[] = [...requested];
  for (const capabilityId of allowed.keys()) if (!requested.some((placement) => placement.capabilityId === capabilityId)) {
    queue.push({ capabilityId, objectName: `componentSlot${queue.length + 1}`, ...(rootLayout ? { parentLayout: rootLayout } : {}) });
  }

  for (const placement of queue) {
    const componentId = placement.capabilityId.startsWith(PREFIX) ? placement.capabilityId.slice(PREFIX.length) : placement.capabilityId;
    const component = input.catalog.getByCapabilityId?.(placement.capabilityId) ?? (placement.capabilityId.startsWith(PREFIX) ? input.catalog.get(componentId) : undefined);
    if (!component) { warnings.push({ code: 'component_unavailable', message: `组件“${componentId}”未安装，已跳过。` }); continue; }
    if (!placement.parentLayout) { warnings.push({ code: 'component_parent_missing', message: `组件“${component.name}”没有可用的父布局，已跳过。` }); continue; }
    try {
      if (component.binaryBuild) {
        source = materializeBinaryWidget(source, input.intent.fileName, component, placement);
        applied.add(componentId);
        binaryComponents.set(component.binaryBuild.className, component.binaryBuild);
        continue;
      }
      const document = parseUi(source, input.intent.fileName);
      const prepared = buildInsertComponentOperation(component, document, {
        parentLayout: placement.parentLayout,
        objectPrefix: placement.objectName,
        ...(document.index.widgetsByName.has(placement.objectName) ? { before: placement.objectName } : {}),
        availableQssDependencies: component.qssDependencies,
        availableQrcDependencies: component.qrcDependencies,
        availableCustomWidgets: component.customWidgets.map((widget) => widget.className),
      });
      prepared.assertReady();
      const operations = [...prepared.operations, ...(document.index.widgetsByName.has(placement.objectName) ? [{ op: 'removeWidget' as const, target: placement.objectName }] : [])];
      source = applyOperations(document, operations, { resolveComponent: prepared.resolveComponent }).source;
      applied.add(componentId);
      for (const stylesheet of input.catalog.getStylesheetsByCapabilityId?.(placement.capabilityId) ?? []) stylesheets.add(stylesheet);
    } catch (error) {
      warnings.push({ code: 'component_materialization_failed', message: `组件“${component.name}”复用失败：${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return { source, componentIds: [...applied], stylesheets: [...stylesheets], binaryComponents: [...binaryComponents.values()], warnings };
}

function materializeBinaryWidget(source: string, fileName: string, component: ComponentRecord, placement: Placement): string {
  const build = component.binaryBuild;
  if (!build) throw new Error('binary component build metadata is missing');
  const promoted = ensurePromotedWidget(source, {
    id: `binary.${component.id}`,
    kind: 'promoted_widget',
    displayName: component.name,
    description: component.description,
    tags: component.tags,
    qt: { minVersion: '4.0', modules: build.qtModules.length ? build.qtModules : ['Widgets'], verifiedKitIds: [] },
    designer: { className: build.className, baseClass: build.baseClass, header: build.headerPath, container: false },
    dependencies: { qss: [], qrc: [], fonts: [], promotedWidgets: [] },
    source: { type: 'local_library' },
  });
  const document = parseUi(promoted.source, fileName);
  if (document.index.widgetsByName.has(placement.objectName)) throw new Error(`动态组件对象名“${placement.objectName}”已存在`);
  return applyOperations(document, [{ op: 'addWidget', parentLayout: placement.parentLayout!, widgetClass: build.className, objectName: placement.objectName }]).source;
}
