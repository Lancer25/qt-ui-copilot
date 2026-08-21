import type { ParsedUiDocument } from './parse-ui.js';

export interface UiFingerprint {
  filePath: string;
  formClass: string;
  rootObjectName: string;
  widgetNames: string[];
  widgetClasses: string[];
  layoutNames: string[];
  layoutClasses: string[];
  resourceLocations: string[];
  customWidgetClasses: string[];
}

/** A stable, serialisable summary used for runtime matching and component search. */
export function buildUiFingerprint(document: ParsedUiDocument): UiFingerprint {
  return {
    filePath: document.filePath,
    formClass: document.formClass,
    rootObjectName: document.rootWidget.objectName,
    widgetNames: [...document.index.widgetsByName.keys()].sort(),
    widgetClasses: [...new Set([...document.index.widgetsByName.values()].map((widget) => widget.className))].sort(),
    layoutNames: [...document.index.layoutsByName.keys()].sort(),
    layoutClasses: [...new Set([...document.index.layoutsByName.values()].map((layout) => layout.className))].sort(),
    resourceLocations: document.index.resources.map((resource) => resource.location).sort(),
    customWidgetClasses: document.index.customWidgets.map((customWidget) => customWidget.className).sort(),
  };
}
