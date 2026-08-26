import { UiBlueprintNodeSchema, UiCreationBlueprintSchema, type UiBlueprintNode, type UiCreationBlueprint, type UiValue } from '@qt-ui-copilot/contracts';
import { parseUi } from './parse-ui.js';

export interface GeneratedUi {
  source: string;
  objectNames: string[];
}

const WIDGET_CLASSES = new Set([
  'QWidget', 'QDialog', 'QMainWindow', 'QFrame', 'QLabel', 'QPushButton', 'QToolButton', 'QLineEdit',
  'QTextEdit', 'QPlainTextEdit', 'QCheckBox', 'QRadioButton', 'QComboBox', 'QSpinBox', 'QDoubleSpinBox',
  'QSlider', 'QProgressBar', 'QGroupBox', 'QTabWidget', 'QStackedWidget', 'QScrollArea', 'QTableWidget',
  'QTreeWidget', 'QListWidget', 'QDateEdit', 'QTimeEdit', 'QDateTimeEdit', 'QLCDNumber', 'QCalendarWidget', 'QStatusBar', 'QMenuBar', 'QToolBar', 'QDockWidget',
]);
const LAYOUT_CLASSES = new Set(['QHBoxLayout', 'QVBoxLayout', 'QGridLayout', 'QFormLayout']);
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function propertyValue(value: UiValue, resourceRefs: readonly string[]): string {
  if (typeof value === 'string') return `<string>${escapeXml(value)}</string>`;
  if (typeof value === 'number') return `<number>${value}</number>`;
  if (typeof value === 'boolean') return `<bool>${value ? 'true' : 'false'}</bool>`;
  if (value.kind === 'font') {
    const font = value;
    return `<font>${font.family !== undefined ? `<family>${escapeXml(font.family)}</family>` : ''}${font.pointSize !== undefined ? `<pointsize>${font.pointSize}</pointsize>` : ''}${font.weight !== undefined ? `<weight>${font.weight}</weight>` : ''}${font.bold !== undefined ? `<bold>${font.bold ? 'true' : 'false'}</bold>` : ''}${font.italic !== undefined ? `<italic>${font.italic ? 'true' : 'false'}</italic>` : ''}${font.underline !== undefined ? `<underline>${font.underline ? 'true' : 'false'}</underline>` : ''}</font>`;
  }
  if (value.kind === 'enum') return `<enum>${escapeXml(value.value)}</enum>`;
  if (value.kind === 'set') return `<set>${escapeXml(value.value)}</set>`;
  if (value.kind === 'size') return `<size><width>${value.width}</width><height>${value.height}</height></size>`;
  if (value.kind === 'rect') return `<rect><x>${value.x}</x><y>${value.y}</y><width>${value.width}</width><height>${value.height}</height></rect>`;
  if (value.kind === 'stringList') return `<stringlist>${value.values.map((item) => `<string>${escapeXml(item)}</string>`).join('')}</stringlist>`;
  const resourcePath = value.resourcePath;
  const resource = resourceRefs.includes(resourcePath) ? ` resource="${escapeXml(resourcePath)}"` : '';
  return `<iconset${resource}>${escapeXml(resourcePath)}</iconset>`;
}

function emitProperties(properties: Record<string, UiValue>, resourceRefs: readonly string[], indent: string): string[] {
  return Object.keys(properties).sort().map((name) => {
    if (!XML_NAME.test(name)) throw new Error(`invalid property name "${name}"`);
    return `${indent}<property name="${escapeXml(name)}">${propertyValue(properties[name], resourceRefs)}</property>`;
  });
}

function assertAcyclic(value: unknown, ancestors = new Set<object>(), seen = new Set<object>()): void {
  if (!value || typeof value !== 'object') return;
  const object = value as object;
  if (ancestors.has(object)) throw new Error('layout tree contains a cycle');
  if (seen.has(object)) return;
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(object);
  seen.add(object);
  if (Array.isArray(value)) {
    for (const child of value) assertAcyclic(child, nextAncestors, seen);
  } else {
    for (const child of Object.values(value)) assertAcyclic(child, nextAncestors, seen);
  }
}

function collectAndValidate(blueprint: UiCreationBlueprint): string[] {
  const names = new Set<string>([blueprint.rootObjectName]);
  const visit = (node: UiBlueprintNode): void => {
    if (names.has(node.objectName)) throw new Error(`duplicate objectName "${node.objectName}"`);
    names.add(node.objectName);
    if (node.kind === 'layout' && !LAYOUT_CLASSES.has(node.className)) throw new Error(`unsupported Qt class "${node.className}"`);
    if (node.kind === 'widget' && !WIDGET_CLASSES.has(node.className)) throw new Error(`unsupported Qt class "${node.className}"`);
    if (node.kind === 'spacer' && node.className !== 'QSpacerItem') throw new Error(`unsupported Qt class "${node.className}"`);
    for (const child of node.children) visit(child);
  };
  if (blueprint.layoutTree.kind !== 'layout') throw new Error('layoutTree root must be a layout');
  visit(blueprint.layoutTree);
  const allNames = new Set(names);
  for (const name of blueprint.tabOrder) if (!allNames.has(name)) throw new Error(`unknown tab order object "${name}"`);
  for (const connection of blueprint.connections) {
    if (!allNames.has(connection.sender) || !allNames.has(connection.receiver)) throw new Error(`connection references unknown object`);
  }
  return [...names];
}

function emitNode(node: UiBlueprintNode, resourceRefs: readonly string[], depth: number): string[] {
  const indent = ' '.repeat(depth);
  const childIndent = ' '.repeat(depth + 1);
  const lines: string[] = [];
  if (node.kind === 'spacer') {
    lines.push(`${indent}<spacer name="${escapeXml(node.objectName)}">`);
    const properties = { orientation: { kind: 'enum' as const, value: 'Qt::Vertical' }, sizeType: { kind: 'enum' as const, value: 'QSizePolicy::Expanding' }, ...node.properties };
    lines.push(...emitProperties(properties, resourceRefs, childIndent));
    lines.push(`${indent}</spacer>`);
    return lines;
  }
  const tag = node.kind === 'widget' ? 'widget' : 'layout';
  lines.push(`${indent}<${tag} class="${escapeXml(node.className)}" name="${escapeXml(node.objectName)}">`);
  lines.push(...emitProperties(node.properties, resourceRefs, childIndent));
  if (node.kind === 'layout') {
    for (const child of node.children) {
      lines.push(`${childIndent}<item>`);
      lines.push(...emitNode(child, resourceRefs, depth + 2));
      lines.push(`${childIndent}</item>`);
    }
  } else {
    for (const child of node.children) lines.push(...emitNode(child, resourceRefs, depth + 1));
  }
  lines.push(`${indent}</${tag}>`);
  return lines;
}

function emitDesignerDocument(blueprint: UiCreationBlueprint): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<ui version="4.0">', ` <class>${escapeXml(blueprint.rootObjectName)}</class>`, ` <widget class="${escapeXml(blueprint.rootType)}" name="${escapeXml(blueprint.rootObjectName)}">`];
  lines.push('  <property name="geometry"><rect><x>0</x><y>0</y><width>' + blueprint.size.width + '</width><height>' + blueprint.size.height + '</height></rect></property>');
  lines.push(`  <property name="windowTitle"><string>${escapeXml(blueprint.windowTitle)}</string></property>`);
  lines.push(...emitNode(blueprint.layoutTree, blueprint.resourceRefs, 2));
  lines.push(' </widget>');
  if (blueprint.resourceRefs.length > 0) {
    lines.push(' <resources>');
    for (const resource of [...blueprint.resourceRefs].sort()) lines.push(`  <include location="${escapeXml(resource)}"/>`);
    lines.push(' </resources>');
  }
  if (blueprint.connections.length > 0) {
    lines.push(' <connections>');
    for (const connection of blueprint.connections) {
      lines.push('  <connection>');
      lines.push(`   <sender>${escapeXml(connection.sender)}</sender>`);
      lines.push(`   <signal>${escapeXml(connection.signal)}</signal>`);
      lines.push(`   <receiver>${escapeXml(connection.receiver)}</receiver>`);
      lines.push(`   <slot>${escapeXml(connection.slot)}</slot>`);
      lines.push('  </connection>');
    }
    lines.push(' </connections>');
  }
  if (blueprint.tabOrder.length > 0) {
    lines.push(' <tabstops>');
    for (const name of blueprint.tabOrder) lines.push(`  <tabstop>${escapeXml(name)}</tabstop>`);
    lines.push(' </tabstops>');
  }
  lines.push('</ui>', '');
  return lines.join('\n');
}

export function generateUiFromBlueprint(input: UiCreationBlueprint): GeneratedUi {
  assertAcyclic(input);
  const blueprint = UiCreationBlueprintSchema.parse(input);
  const objectNames = collectAndValidate(blueprint);
  const source = emitDesignerDocument(blueprint);
  parseUi(source, blueprint.fileName);
  return { source, objectNames };
}
