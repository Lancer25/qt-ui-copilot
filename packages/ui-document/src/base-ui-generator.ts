import { CanonicalUiIntentSchema, type CanonicalUiIntent, type CanonicalUiNode } from '@qt-ui-copilot/contracts';
import { parseUi } from './parse-ui.js';

/** The result of the deterministic, first-stage UI generation. */
export interface BaseGeneratedUi {
  source: string;
  objectNames: string[];
}

const widgetMap = {
  container: 'QWidget',
  label: 'QLabel',
  button: 'QPushButton',
  lineEdit: 'QLineEdit',
  textEdit: 'QTextEdit',
  checkBox: 'QCheckBox',
  comboBox: 'QComboBox',
  list: 'QListWidget',
  table: 'QTableWidget',
} as const;

const layoutMap = {
  vertical: 'QVBoxLayout',
  horizontal: 'QHBoxLayout',
  grid: 'QGridLayout',
  form: 'QFormLayout',
} as const;

const objectNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function property(name: string, value: string): string {
  return ` <property name="${escapeXml(name)}"><string>${escapeXml(value)}</string></property>`;
}

function assertObjectName(value: string, path: string): void {
  if (!objectNamePattern.test(value)) throw new Error(`${path} has invalid objectName "${value}"`);
}

function widgetClass(node: CanonicalUiNode): string {
  if (!node.widget) throw new Error(`widget node "${node.objectName ?? node.role}" is missing widget kind`);
  return widgetMap[node.widget];
}

function layoutClass(node: CanonicalUiNode): string {
  if (!node.layout) throw new Error(`layout node "${node.objectName ?? node.role}" is missing layout kind`);
  return layoutMap[node.layout];
}

function nodeAttributes(node: CanonicalUiNode, index: number): string {
  if (node.layout === 'grid' || node.layout === 'form') {
    return ` row="${index}" column="0"`;
  }
  return node.stretch === undefined ? '' : ` stretch="${node.stretch}"`;
}

function emitWidget(node: CanonicalUiNode, depth: number): string[] {
  const indent = ' '.repeat(depth);
  const childIndent = ' '.repeat(depth + 1);
  const lines = [`${indent}<widget class="${widgetClass(node)}" name="${escapeXml(node.objectName!)}">`];
  if (node.text !== undefined) lines.push(`${childIndent}${property('text', node.text).trimStart()}`);
  if (node.placeholder !== undefined) lines.push(`${childIndent}${property('placeholderText', node.placeholder).trimStart()}`);
  for (const child of node.children) {
    lines.push(...emitNode(child, depth + 1));
  }
  lines.push(`${indent}</widget>`);
  return lines;
}

function emitSpacer(node: CanonicalUiNode, depth: number): string[] {
  const indent = ' '.repeat(depth);
  const childIndent = ' '.repeat(depth + 1);
  return [
    `${indent}<spacer name="${escapeXml(node.objectName!)}">`,
    `${childIndent}<property name="orientation"><enum>Qt::Vertical</enum></property>`,
    `${childIndent}<property name="sizeType"><enum>QSizePolicy::Expanding</enum></property>`,
    `${indent}</spacer>`,
  ];
}

function emitLayout(node: CanonicalUiNode, depth: number): string[] {
  const indent = ' '.repeat(depth);
  const childIndent = ' '.repeat(depth + 1);
  const lines = [`${indent}<layout class="${layoutClass(node)}" name="${escapeXml(node.objectName!)}">`];
  node.children.forEach((child, index) => {
    lines.push(`${childIndent}<item${nodeAttributes(node, index)}>`);
    lines.push(...emitNode(child, depth + 2));
    lines.push(`${childIndent}</item>`);
  });
  lines.push(`${indent}</layout>`);
  return lines;
}

function emitNode(node: CanonicalUiNode, depth: number): string[] {
  assertObjectName(node.objectName!, 'node');
  if (node.kind === 'layout') return emitLayout(node, depth);
  if (node.kind === 'spacer') return emitSpacer(node, depth);
  return emitWidget(node, depth);
}

function collectNames(node: CanonicalUiNode, names: string[]): void {
  assertObjectName(node.objectName!, 'node');
  names.push(node.objectName!);
  node.children.forEach((child) => collectNames(child, names));
}

function emitDocument(intent: CanonicalUiIntent): string {
  const size = intent.size ?? { width: 900, height: 640 };
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ui version="4.0">',
    ` <class>${escapeXml(intent.rootObjectName)}</class>`,
    ` <widget class="${escapeXml(intent.rootType)}" name="${escapeXml(intent.rootObjectName)}">`,
    `  <property name="geometry"><rect><x>0</x><y>0</y><width>${size.width}</width><height>${size.height}</height></rect></property>`,
    `  <property name="windowTitle"><string>${escapeXml(intent.windowTitle)}</string></property>`,
    ...emitNode(intent.tree, 2),
    ' </widget>',
    '</ui>',
    '',
  ];
  return lines.join('\n');
}

/**
 * Generate the restricted base document from a normalized semantic intent.
 * No model-provided XML or arbitrary Qt properties are accepted here.
 */
export function generateBaseUi(input: CanonicalUiIntent): BaseGeneratedUi {
  const intent = CanonicalUiIntentSchema.parse(input);
  if (intent.tree.objectName === intent.rootObjectName) {
    throw new Error(`duplicate objectName "${intent.rootObjectName}"`);
  }
  const objectNames = [intent.rootObjectName];
  collectNames(intent.tree, objectNames);
  if (new Set(objectNames).size !== objectNames.length) throw new Error('duplicate objectName in canonical UI intent');
  const source = emitDocument(intent);
  parseUi(source, intent.fileName);
  return { source, objectNames };
}

