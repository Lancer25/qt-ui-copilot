import { buildAst } from '@xml-tools/ast';
import { parse } from '@xml-tools/parser';

export interface SourceRange {
  /** Zero-based, inclusive character offset. */
  start: number;
  /** Zero-based, exclusive character offset. */
  end: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface XmlAttribute {
  name: string;
  value: string;
  range: SourceRange;
}

/**
 * A loss-minimising element view over xml-tools' CST/AST. Every element keeps
 * its original byte slice, so later patching can replace only a known range.
 */
export interface XmlElement {
  type: 'element';
  name: string;
  attributes: readonly XmlAttribute[];
  children: readonly XmlElement[];
  range: SourceRange;
  source: string;
}

export interface WidgetNode {
  objectName: string;
  className: string;
  element: XmlElement;
  parentObjectName?: string;
}

export interface LayoutNode {
  objectName: string;
  className: string;
  element: XmlElement;
  parentObjectName?: string;
}

export interface PropertyNode {
  name: string;
  valueText: string;
  element: XmlElement;
}

export interface ItemNode {
  element: XmlElement;
  parentLayoutName?: string;
}

export interface ConnectionNode {
  sender: string;
  signal: string;
  receiver: string;
  slot: string;
}

export interface ResourceRef {
  location: string;
}

export interface CustomWidgetNode {
  className: string;
  extends?: string;
  header?: string;
}

export interface UiIndex {
  widgetsByName: Map<string, WidgetNode>;
  layoutsByName: Map<string, LayoutNode>;
  propertiesByObject: Map<string, Map<string, PropertyNode>>;
  items: ItemNode[];
  connections: ConnectionNode[];
  tabStops: string[];
  resources: ResourceRef[];
  customWidgets: CustomWidgetNode[];
}

export interface ParsedUiDocument {
  source: string;
  filePath: string;
  root: XmlElement;
  formClass: string;
  rootWidget: WidgetNode;
  index: UiIndex;
}

type XmlToolsElement = {
  type: 'XMLElement';
  name: string | null;
  attributes: readonly XmlToolsAttribute[];
  subElements: readonly XmlToolsElement[];
  position: XmlToolsPosition;
};

type XmlToolsAttribute = {
  key: string | null;
  value: string | null;
  position: XmlToolsPosition;
};

type XmlToolsPosition = {
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
};

function lineColumnAt(source: string, offset: number): Pick<SourceRange, 'startLine' | 'startColumn'> {
  const before = source.slice(0, Math.max(0, offset));
  const lastNewline = before.lastIndexOf('\n');
  return {
    startLine: (before.match(/\n/g)?.length ?? 0) + 1,
    startColumn: offset - lastNewline,
  };
}

function diagnostic(filePath: string, source: string, error: unknown): Error {
  const candidate = error as { message?: string; token?: { startOffset?: number; startLine?: number; startColumn?: number } };
  const offset = Number.isFinite(candidate.token?.startOffset) ? candidate.token?.startOffset as number : source.length;
  const location = !Number.isFinite(candidate.token?.startLine)
    ? lineColumnAt(source, offset)
    : {
        startLine: candidate.token?.startLine as number,
        startColumn: Number.isFinite(candidate.token?.startColumn) ? candidate.token?.startColumn as number : 1,
      };
  return new Error(`${filePath}:${location.startLine}:${location.startColumn}: ${candidate.message ?? 'Malformed XML'}`);
}

function toRange(position: XmlToolsPosition): SourceRange {
  // xml-tools positions use an inclusive end offset. Normalise to half-open
  // ranges once here so all later patch calculations use the same convention.
  return {
    start: position.startOffset,
    end: position.endOffset + 1,
    startLine: position.startLine,
    startColumn: position.startColumn,
    endLine: position.endLine,
    endColumn: position.endColumn,
  };
}

function toElement(node: XmlToolsElement, source: string): XmlElement {
  if (!node.name) throw new Error('Malformed XML element without a name');
  const range = toRange(node.position);
  return {
    type: 'element',
    name: node.name,
    attributes: node.attributes.map((attribute) => ({
      name: attribute.key ?? '',
      value: attribute.value ?? '',
      range: toRange(attribute.position),
    })),
    children: node.subElements.map((child) => toElement(child, source)),
    range,
    source: source.slice(range.start, range.end),
  };
}

function attribute(element: XmlElement, name: string): string | undefined {
  return element.attributes.find((item) => item.name === name)?.value;
}

function directChildren(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

function textContent(element: XmlElement): string {
  const openingEnd = element.source.indexOf('>');
  const closingStart = element.source.lastIndexOf('</');
  if (openingEnd < 0 || closingStart < openingEnd) return '';
  return element.source.slice(openingEnd + 1, closingStart).replace(/<[^>]+>/g, '').trim();
}

function childText(element: XmlElement, name: string): string | undefined {
  const child = directChildren(element, name)[0];
  return child ? textContent(child) : undefined;
}

function visitElements(root: XmlElement, visitor: (element: XmlElement, parent?: XmlElement) => void, parent?: XmlElement): void {
  visitor(root, parent);
  for (const child of root.children) visitElements(child, visitor, root);
}

function nearestOwner(ancestors: readonly XmlElement[]): string | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const name = attribute(ancestors[index], 'name');
    if (name && (ancestors[index].name === 'widget' || ancestors[index].name === 'layout')) return name;
  }
  return undefined;
}

function createIndex(root: XmlElement): { index: UiIndex; rootWidget?: WidgetNode } {
  const index: UiIndex = {
    widgetsByName: new Map(),
    layoutsByName: new Map(),
    propertiesByObject: new Map(),
    items: [],
    connections: [],
    tabStops: [],
    resources: [],
    customWidgets: [],
  };
  let rootWidget: WidgetNode | undefined;

  const walk = (element: XmlElement, ancestors: XmlElement[]): void => {
    const objectName = attribute(element, 'name');
    if (element.name === 'widget' && objectName) {
      if (index.widgetsByName.has(objectName) || index.layoutsByName.has(objectName)) {
        throw new Error(`Duplicate object name "${objectName}"`);
      }
      const node: WidgetNode = {
        objectName,
        className: attribute(element, 'class') ?? '',
        element,
        parentObjectName: nearestOwner(ancestors),
      };
      index.widgetsByName.set(objectName, node);
      rootWidget ??= node;
    }
    if (element.name === 'layout' && objectName) {
      if (index.widgetsByName.has(objectName) || index.layoutsByName.has(objectName)) {
        throw new Error(`Duplicate object name "${objectName}"`);
      }
      index.layoutsByName.set(objectName, {
        objectName,
        className: attribute(element, 'class') ?? '',
        element,
        parentObjectName: nearestOwner(ancestors),
      });
    }
    if (element.name === 'item') {
      index.items.push({ element, parentLayoutName: nearestOwner(ancestors) });
    }
    if (element.name === 'property') {
      const owner = nearestOwner(ancestors);
      const name = attribute(element, 'name');
      if (owner && name) {
        const valueElement = element.children[0];
        const properties = index.propertiesByObject.get(owner) ?? new Map<string, PropertyNode>();
        properties.set(name, { name, valueText: valueElement ? textContent(valueElement) : '', element });
        index.propertiesByObject.set(owner, properties);
      }
    }
    if (element.name === 'connection') {
      const sender = childText(element, 'sender');
      const signal = childText(element, 'signal');
      const receiver = childText(element, 'receiver');
      const slot = childText(element, 'slot');
      if (sender && signal && receiver && slot) index.connections.push({ sender, signal, receiver, slot });
    }
    if (element.name === 'tabstop') index.tabStops.push(textContent(element));
    if (element.name === 'include' && ancestors.at(-1)?.name === 'resources') {
      const location = attribute(element, 'location');
      if (location) index.resources.push({ location });
    }
    if (element.name === 'customwidget') {
      const className = childText(element, 'class');
      if (className) index.customWidgets.push({ className, extends: childText(element, 'extends'), header: childText(element, 'header') });
    }
    for (const child of element.children) walk(child, [...ancestors, element]);
  };

  walk(root, []);
  return { index, rootWidget };
}

export function parseUi(source: string, filePath: string): ParsedUiDocument {
  const parsed = parse(source);
  const parserError = parsed.lexErrors[0] ?? parsed.parseErrors[0];
  if (parserError) throw diagnostic(filePath, source, parserError);

  let ast: { rootElement: XmlToolsElement | null };
  try {
    ast = buildAst(parsed.cst as never, parsed.tokenVector) as unknown as { rootElement: XmlToolsElement | null };
  } catch (error) {
    throw diagnostic(filePath, source, error);
  }
  if (!ast.rootElement) throw new Error(`${filePath}:1:1: XML document has no root element`);
  const root = toElement(ast.rootElement, source);
  if (root.name !== 'ui') throw new Error(`${filePath}:${root.range.startLine}:${root.range.startColumn}: Qt UI root element must be <ui>`);
  const { index, rootWidget } = createIndex(root);
  if (!rootWidget) throw new Error(`${filePath}:${root.range.startLine}:${root.range.startColumn}: Qt UI document has no root widget`);
  return {
    source,
    filePath,
    root,
    formClass: childText(root, 'class') ?? '',
    rootWidget,
    index,
  };
}
