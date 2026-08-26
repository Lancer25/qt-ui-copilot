import { UiCapabilitySchema, type UiCapability } from '@qt-ui-copilot/contracts';
import { parseUi } from './parse-ui.js';

export interface PromotedWidgetInsertion {
  source: string;
  inserted: boolean;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function customWidgetXml(capability: UiCapability, newline: string): string {
  const designer = capability.designer;
  const lines = [
    ' <customwidget>',
    `  <class>${escapeXml(designer.className)}</class>`,
    `  <extends>${escapeXml(designer.baseClass ?? 'QWidget')}</extends>`,
    ...(designer.header ? [`  <header>${escapeXml(designer.header)}</header>`] : []),
    ...(designer.container ? ['  <container>1</container>'] : []),
    ' </customwidget>',
  ];
  return lines.join(newline);
}

function hasClass(source: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<customwidget\\b[\\s\\S]*?<class>\\s*${escaped}\\s*</class>[\\s\\S]*?</customwidget>`, 'i').test(source);
}

/** Add one deterministic customwidget declaration, preserving existing declarations. */
export function ensurePromotedWidget(source: string, capabilityInput: UiCapability): PromotedWidgetInsertion {
  const capability = UiCapabilitySchema.parse(capabilityInput);
  if (capability.kind !== 'promoted_widget') throw new Error(`Capability ${capability.id} is not a promoted widget`);
  if (hasClass(source, capability.designer.className)) {
    parseUi(source, 'promoted-widget.ui');
    return { source, inserted: false };
  }

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const declaration = customWidgetXml(capability, newline);
  const customwidgetsStart = source.search(/<customwidgets\b[^>]*>/i);
  if (customwidgetsStart >= 0) {
    const openingEnd = source.indexOf('>', customwidgetsStart) + 1;
    const closingStart = source.search(/<\/customwidgets\s*>/i);
    if (closingStart < openingEnd) throw new Error('Malformed <customwidgets> block');
    const before = source.slice(0, closingStart);
    const after = source.slice(closingStart);
    const separator = before.endsWith(newline) ? '' : newline;
    const updated = `${before}${separator}${declaration}${newline}${after}`;
    parseUi(updated, 'promoted-widget.ui');
    return { source: updated, inserted: true };
  }

  // Qt Designer accepts customwidgets before resources/connections. Keeping
  // this order makes generated files deterministic and easy to diff.
  const insertionPoints = [
    source.search(/<resources\b[^>]*>/i),
    source.search(/<connections\b[^>]*>/i),
    source.search(/<\/ui\s*>/i),
  ].filter((value) => value >= 0);
  const uiEnd = insertionPoints.length ? Math.min(...insertionPoints) : -1;
  if (uiEnd < 0) throw new Error('Qt UI document is missing </ui>');
  const prefix = source.slice(0, uiEnd);
  const suffix = source.slice(uiEnd);
  const separator = prefix.endsWith(newline) ? '' : newline;
  const updated = `${prefix}${separator}<customwidgets>${newline}${declaration}${newline}</customwidgets>${newline}${suffix}`;
  parseUi(updated, 'promoted-widget.ui');
  return { source: updated, inserted: true };
}
