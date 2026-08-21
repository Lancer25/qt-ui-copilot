import { UiOperationSchema, type UiOperation, type UiValue } from '@qt-ui-copilot/contracts';
import { applyTextPatches, type TextPatch } from './text-patch.js';
import { parseUi, type ParsedUiDocument, type SourceRange, type XmlElement } from './parse-ui.js';

export interface UiPatchResult {
  source: string;
  /** Ranges in the original document affected by the final candidate. */
  changedRanges: SourceRange[];
  appliedOperations: UiOperation[];
}

export interface ComponentSource {
  /** A complete <item> fragment suitable for the requested layout. */
  itemXml: string;
  objectNames: readonly string[];
}

export interface ApplyOperationsOptions {
  resolveComponent?: (componentId: string, objectPrefix: string) => ComponentSource | undefined;
}

function rangeAt(source: string, offset: number): SourceRange {
  const before = source.slice(0, offset);
  const lastNewline = before.lastIndexOf('\n');
  const line = (before.match(/\n/g)?.length ?? 0) + 1;
  const column = offset - lastNewline;
  return { start: offset, end: offset, startLine: line, startColumn: column, endLine: line, endColumn: column };
}

function closingTagStart(element: XmlElement): number {
  const closing = `</${element.name}>`;
  const offset = element.source.lastIndexOf(closing);
  if (offset < 0) throw new Error(`Cannot patch self-closing <${element.name}> element`);
  return element.range.start + offset;
}

function indentation(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  return source.slice(lineStart, offset).match(/^[ \t]*/)?.[0] ?? '';
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function serializeValue(value: UiValue): string {
  if (typeof value === 'string') return `<string>${escapeXml(value)}</string>`;
  if (typeof value === 'number') return `<number>${value}</number>`;
  if (typeof value === 'boolean') return `<bool>${value ? 'true' : 'false'}</bool>`;
  switch (value.kind) {
    case 'enum': return `<enum>${escapeXml(value.value)}</enum>`;
    case 'size': return `<size><width>${value.width}</width><height>${value.height}</height></size>`;
    case 'rect': return `<rect><x>${value.x}</x><y>${value.y}</y><width>${value.width}</width><height>${value.height}</height></rect>`;
    case 'stringList': return `<stringlist>${value.values.map((item) => `<string>${escapeXml(item)}</string>`).join('')}</stringlist>`;
    case 'icon': return `<iconset resource="${escapeXml(value.resourcePath)}"/>`;
  }
}

function propertyXml(name: string, value: UiValue): string {
  return `<property name="${escapeXml(name)}">${serializeValue(value)}</property>`;
}

function widgetXml(widgetClass: string, objectName: string, properties: Record<string, UiValue> | undefined, indent: string): string {
  const entries = Object.entries(properties ?? {});
  if (entries.length === 0) return `<widget class="${escapeXml(widgetClass)}" name="${escapeXml(objectName)}"/>`;
  const propertyIndent = `${indent}  `;
  return [`<widget class="${escapeXml(widgetClass)}" name="${escapeXml(objectName)}">`,
    ...entries.map(([name, value]) => `${propertyIndent}${propertyXml(name, value)}`),
    `${indent}</widget>`].join('\n');
}

function containsObject(element: XmlElement, objectName: string): boolean {
  const name = element.attributes.find((attribute) => attribute.name === 'name')?.value;
  return name === objectName || element.children.some((child) => containsObject(child, objectName));
}

function objectExists(document: ParsedUiDocument, objectName: string): boolean {
  return document.index.widgetsByName.has(objectName) || document.index.layoutsByName.has(objectName);
}

function requireObject(document: ParsedUiDocument, objectName: string): void {
  if (!objectExists(document, objectName)) throw new Error(`Unknown target "${objectName}"`);
}

function requireWidget(document: ParsedUiDocument, objectName: string): void {
  if (!document.index.widgetsByName.has(objectName)) throw new Error(`Unknown target "${objectName}" (expected widget)`);
}

function requireLayout(document: ParsedUiDocument, objectName: string): void {
  if (!document.index.layoutsByName.has(objectName)) throw new Error(`Unknown layout "${objectName}"`);
}

function requireNewName(document: ParsedUiDocument, objectName: string): void {
  if (objectExists(document, objectName)) throw new Error(`Duplicate object name "${objectName}"`);
}

function appendToElement(source: string, element: XmlElement, fragment: string): TextPatch {
  const at = closingTagStart(element);
  const baseIndent = indentation(source, at);
  return { range: rangeAt(source, at), replacement: `\n${baseIndent} ${fragment}\n${baseIndent}` };
}

function replaceProperty(source: string, document: ParsedUiDocument, target: string, name: string, value: UiValue): TextPatch {
  const existing = document.index.propertiesByObject.get(target)?.get(name);
  if (!existing) {
    const element = document.index.widgetsByName.get(target)?.element ?? document.index.layoutsByName.get(target)?.element;
    if (!element) throw new Error(`Unknown target "${target}"`);
    return appendToElement(source, element, propertyXml(name, value));
  }
  const valueElement = existing.element.children[0];
  if (!valueElement) return { range: existing.element.range, replacement: propertyXml(name, value) };
  return { range: valueElement.range, replacement: serializeValue(value) };
}

function itemForObject(document: ParsedUiDocument, objectName: string): XmlElement | undefined {
  return document.index.items.find((item) => containsObject(item.element, objectName))?.element;
}

function addItemPatch(source: string, document: ParsedUiDocument, layoutName: string, content: string, before?: string): TextPatch {
  requireLayout(document, layoutName);
  const layout = document.index.layoutsByName.get(layoutName)!;
  const layoutIndent = indentation(source, layout.element.range.start);
  const itemIndent = `${layoutIndent} `;
  const contentIndent = `${itemIndent} `;
  const fragment = `<item>\n${contentIndent}${content.replace(/\n/g, `\n${contentIndent}`)}\n${itemIndent}</item>`;
  if (before) {
    requireObject(document, before);
    const beforeItem = document.index.items.find((item) => item.parentLayoutName === layoutName && containsObject(item.element, before));
    if (!beforeItem) throw new Error(`Target "${before}" is not an item of layout "${layoutName}"`);
    const at = beforeItem.element.range.start;
    return { range: rangeAt(source, at), replacement: `${fragment}\n${itemIndent}` };
  }
  return { range: rangeAt(source, closingTagStart(layout.element)), replacement: `\n${itemIndent}${fragment}\n${layoutIndent}` };
}

function addRawItemPatch(source: string, document: ParsedUiDocument, layoutName: string, itemXml: string, before?: string): TextPatch {
  requireLayout(document, layoutName);
  const layout = document.index.layoutsByName.get(layoutName)!;
  const layoutIndent = indentation(source, layout.element.range.start);
  const itemIndent = `${layoutIndent} `;
  if (before) {
    requireObject(document, before);
    const beforeItem = document.index.items.find((item) => item.parentLayoutName === layoutName && containsObject(item.element, before));
    if (!beforeItem) throw new Error(`Target "${before}" is not an item of layout "${layoutName}"`);
    return { range: rangeAt(source, beforeItem.element.range.start), replacement: `${itemXml}\n${itemIndent}` };
  }
  return { range: rangeAt(source, closingTagStart(layout.element)), replacement: `\n${itemIndent}${itemXml}\n${layoutIndent}` };
}

function tabStopsPatch(source: string, document: ParsedUiDocument, order: readonly string[]): TextPatch {
  for (const name of order) requireWidget(document, name);
  const tabStops = document.root.children.find((child) => child.name === 'tabstops');
  const contents = order.map((name) => `<tabstop>${escapeXml(name)}</tabstop>`).join('');
  if (tabStops) return { range: tabStops.range, replacement: `<tabstops>${contents}</tabstops>` };
  const at = closingTagStart(document.root);
  const rootIndent = indentation(source, at);
  return { range: rangeAt(source, at), replacement: `\n${rootIndent} <tabstops>${contents}</tabstops>\n${rootIndent}` };
}

function connectionsPatch(source: string, document: ParsedUiDocument, sender: string, signal: string, receiver: string, slot: string): TextPatch {
  requireObject(document, sender);
  requireObject(document, receiver);
  const connection = `<connection><sender>${escapeXml(sender)}</sender><signal>${escapeXml(signal)}</signal><receiver>${escapeXml(receiver)}</receiver><slot>${escapeXml(slot)}</slot></connection>`;
  const connections = document.root.children.find((child) => child.name === 'connections');
  if (connections) return appendToElement(source, connections, connection);
  const at = closingTagStart(document.root);
  const rootIndent = indentation(source, at);
  return { range: rangeAt(source, at), replacement: `\n${rootIndent} <connections>${connection}</connections>\n${rootIndent}` };
}

function applyOne(document: ParsedUiDocument, operation: UiOperation, options: ApplyOperationsOptions): TextPatch[] {
  const source = document.source;
  switch (operation.op) {
    case 'setProperty':
      requireObject(document, operation.target);
      return [replaceProperty(source, document, operation.target, operation.name, operation.value)];
    case 'addWidget':
      requireLayout(document, operation.parentLayout);
      requireNewName(document, operation.objectName);
      return [addItemPatch(source, document, operation.parentLayout,
        widgetXml(operation.widgetClass, operation.objectName, operation.properties, '  '), operation.before)];
    case 'removeWidget': {
      requireWidget(document, operation.target);
      if (document.rootWidget.objectName === operation.target) throw new Error('Cannot remove the root widget');
      if (document.index.tabStops.includes(operation.target)
        || document.index.connections.some((connection) => connection.sender === operation.target || connection.receiver === operation.target)) {
        throw new Error(`Cannot remove "${operation.target}" while it is referenced by tab order or connections`);
      }
      const item = itemForObject(document, operation.target);
      if (!item) throw new Error(`Widget "${operation.target}" is not owned by a layout item`);
      return [{ range: item.range, replacement: '' }];
    }
    case 'moveWidget': {
      requireWidget(document, operation.target);
      requireLayout(document, operation.parentLayout);
      const item = itemForObject(document, operation.target);
      if (!item) throw new Error(`Widget "${operation.target}" is not owned by a layout item`);
      const originalItem = source.slice(item.range.start, item.range.end);
      return [{ range: item.range, replacement: '' }, addRawItemPatch(source, document, operation.parentLayout, originalItem, operation.before)];
    }
    case 'createLayout': {
      requireWidget(document, operation.parentWidget);
      requireNewName(document, operation.objectName);
      const parent = document.index.widgetsByName.get(operation.parentWidget)!;
      if (parent.element.children.some((child) => child.name === 'layout')) {
        throw new Error(`Widget "${operation.parentWidget}" already owns a layout`);
      }
      const layout = `<layout class="${operation.layoutClass}" name="${escapeXml(operation.objectName)}"/>`;
      return [appendToElement(source, parent.element, layout)];
    }
    case 'wrapInLayout': {
      requireNewName(document, operation.objectName);
      const unique = new Set(operation.targets);
      if (unique.size !== operation.targets.length) throw new Error('wrapInLayout targets must be unique');
      operation.targets.forEach((target) => requireWidget(document, target));
      const items = operation.targets.map((target) => itemForObject(document, target));
      if (items.some((item) => !item)) throw new Error('wrapInLayout targets must be owned by layout items');
      const first = items[0]!;
      const parentLayout = document.index.items.find((item) => item.element === first)?.parentLayoutName;
      if (!parentLayout || !items.every((item) => document.index.items.find((entry) => entry.element === item)?.parentLayoutName === parentLayout)) {
        throw new Error('wrapInLayout targets must share one parent layout');
      }
      const firstIndex = document.index.items.findIndex((item) => item.element === first);
      const selected = new Set(items.filter(Boolean));
      const selectedItems = document.index.items.filter((item) => selected.has(item.element));
      const allParentItems = document.index.items.filter((item) => item.parentLayoutName === parentLayout);
      const selectedIndexes = selectedItems.map((item) => allParentItems.indexOf(item)).sort((left, right) => left - right);
      if (selectedIndexes.some((index, offset) => offset > 0 && index !== selectedIndexes[offset - 1] + 1)) {
        throw new Error('wrapInLayout targets must be contiguous layout items');
      }
      const start = Math.min(...selectedItems.map((item) => item.element.range.start));
      const end = Math.max(...selectedItems.map((item) => item.element.range.end));
      const layoutIndent = indentation(source, start);
      const nested = selectedItems.map((item) => source.slice(item.element.range.start, item.element.range.end).replace(/\n/g, `\n${layoutIndent}  `)).join(`\n${layoutIndent}  `);
      void firstIndex;
      return [{ range: { ...first.range, start, end }, replacement: `<item>\n${layoutIndent} <layout class="${operation.layoutClass}" name="${escapeXml(operation.objectName)}">\n${layoutIndent}  ${nested}\n${layoutIndent} </layout>\n${layoutIndent}</item>` }];
    }
    case 'setLayoutProperty':
      requireLayout(document, operation.target);
      return [replaceProperty(source, document, operation.target, operation.name, operation.value)];
    case 'addSpacer': {
      requireLayout(document, operation.parentLayout);
      requireNewName(document, operation.objectName);
      const spacer = `<spacer name="${escapeXml(operation.objectName)}"><property name="orientation"><enum>Qt::${operation.orientation}</enum></property><property name="sizeType"><enum>QSizePolicy::${operation.sizeType}</enum></property></spacer>`;
      return [addItemPatch(source, document, operation.parentLayout, spacer)];
    }
    case 'setSizePolicy': {
      requireWidget(document, operation.target);
      const stretches = `${operation.horizontalStretch ?? 0},${operation.verticalStretch ?? 0}`;
      const value = `<sizepolicy hsizetype="QSizePolicy::${operation.horizontal}" vsizetype="QSizePolicy::${operation.vertical}"><horstretch>${operation.horizontalStretch ?? 0}</horstretch><verstretch>${operation.verticalStretch ?? 0}</verstretch></sizepolicy>`;
      void stretches;
      const existing = document.index.propertiesByObject.get(operation.target)?.get('sizePolicy');
      if (existing) return [{ range: existing.element.range, replacement: `<property name="sizePolicy">${value}</property>` }];
      const widget = document.index.widgetsByName.get(operation.target)!;
      return [appendToElement(source, widget.element, `<property name="sizePolicy">${value}</property>`)];
    }
    case 'setTabOrder': return [tabStopsPatch(source, document, operation.order)];
    case 'setBuddy':
      requireWidget(document, operation.label);
      requireWidget(document, operation.buddy);
      {
        const existing = document.index.propertiesByObject.get(operation.label)?.get('buddy');
        const replacement = `<property name="buddy"><cstring>${escapeXml(operation.buddy)}</cstring></property>`;
        if (existing) return [{ range: existing.element.range, replacement }];
        return [appendToElement(source, document.index.widgetsByName.get(operation.label)!.element, replacement)];
      }
    case 'addExistingConnection': return [connectionsPatch(source, document, operation.sender, operation.signal, operation.receiver, operation.slot)];
    case 'insertComponent': {
      requireLayout(document, operation.parentLayout);
      const component = options.resolveComponent?.(operation.componentId, operation.objectPrefix);
      if (!component) throw new Error(`Component "${operation.componentId}" is unavailable`);
      for (const name of component.objectNames) requireNewName(document, name);
      if (!/^<item(?:\s|>)/.test(component.itemXml.trim())) throw new Error(`Component "${operation.componentId}" must provide an <item> fragment`);
      return [addRawItemPatch(source, document, operation.parentLayout, component.itemXml, operation.before)];
    }
  }
}

function changedRange(original: string, candidate: string): SourceRange[] {
  if (original === candidate) return [];
  let start = 0;
  const commonLimit = Math.min(original.length, candidate.length);
  while (start < commonLimit && original[start] === candidate[start]) start += 1;
  let originalEnd = original.length;
  let candidateEnd = candidate.length;
  while (originalEnd > start && candidateEnd > start && original[originalEnd - 1] === candidate[candidateEnd - 1]) {
    originalEnd -= 1;
    candidateEnd -= 1;
  }
  void candidateEnd;
  return [{ ...rangeAt(original, start), end: originalEnd }];
}

/**
 * Applies only schema-validated, Qt-aware operations. Filesystem writes are
 * deliberately left to CandidateFile so validation failures remain reversible.
 */
export function applyOperations(document: ParsedUiDocument, operations: readonly UiOperation[], options: ApplyOperationsOptions = {}): UiPatchResult {
  let source = document.source;
  for (const rawOperation of operations) {
    const operation = UiOperationSchema.parse(rawOperation);
    const current = parseUi(source, document.filePath);
    const patches = applyOne(current, operation, options);
    source = applyTextPatches(source, patches);
    // Validate the exact candidate after every operation. This catches malformed
    // component fragments before a later operation can obscure the source.
    parseUi(source, document.filePath);
  }
  return { source, changedRanges: changedRange(document.source, source), appliedOperations: [...operations] };
}
