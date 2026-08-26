import type { UiCapability } from '@qt-ui-copilot/contracts';
import { UiCapabilityRegistry, compareQtVersions, type CapabilityKit } from './capability-registry.js';

export interface CapabilityProjectContext extends CapabilityKit {
  files: readonly string[];
  qss: readonly string[];
  qrc: readonly string[];
  fonts: readonly string[];
}

export interface CapabilityFinding {
  code: 'qt_version_incompatible' | 'qt_module_missing' | 'promoted_header_missing' | 'qss_missing' | 'qrc_missing' | 'font_missing' | 'fallback_missing' | 'fallback_cycle';
  message: string;
  capabilityId: string;
}

export interface CapabilityResolution {
  status: 'ready' | 'degraded' | 'blocked';
  requestedCapabilityId: string;
  selectedCapabilityId?: string;
  selectedCapability?: UiCapability;
  findings: CapabilityFinding[];
}

const normalized = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//, '');
const has = (values: readonly string[], value: string) => values.some((item) => normalized(item) === normalized(value) || normalized(item).endsWith(`/${normalized(value)}`));

export class UiCapabilityResolver {
  public constructor(private readonly registry: UiCapabilityRegistry) {}

  public resolve(capability: UiCapability, project: CapabilityProjectContext): CapabilityResolution {
    const findings: CapabilityFinding[] = [];
    const visited = new Set<string>();
    let current: UiCapability | undefined = capability;
    let depth = 0;
    while (current && depth++ < 8) {
      if (visited.has(current.id)) {
        findings.push({ code: 'fallback_cycle', message: `Fallback cycle detected at ${current.id}`, capabilityId: current.id });
        return { status: 'blocked', requestedCapabilityId: capability.id, findings };
      }
      visited.add(current.id);
      const local = this.findings(current, project);
      if (local.length === 0) return { status: findings.length ? 'degraded' : 'ready', requestedCapabilityId: capability.id, selectedCapabilityId: current.id, selectedCapability: current, findings };
      findings.push(...local);
      if (!current.fallback) return { status: 'blocked', requestedCapabilityId: capability.id, selectedCapabilityId: current.id, selectedCapability: current, findings };
      const fallback = this.registry.get(current.fallback.capabilityId);
      if (!fallback) {
        findings.push({ code: 'fallback_missing', message: `Fallback capability ${current.fallback.capabilityId} is not registered`, capabilityId: current.id });
        return { status: 'blocked', requestedCapabilityId: capability.id, findings };
      }
      current = fallback;
    }
    findings.push({ code: 'fallback_cycle', message: 'Fallback depth exceeded 8', capabilityId: capability.id });
    return { status: 'blocked', requestedCapabilityId: capability.id, findings };
  }

  private findings(capability: UiCapability, project: CapabilityProjectContext): CapabilityFinding[] {
    const findings: CapabilityFinding[] = [];
    if (compareQtVersions(project.version, capability.qt.minVersion) < 0 || (capability.qt.maxVersion && compareQtVersions(project.version, capability.qt.maxVersion) > 0)) {
      findings.push({ code: 'qt_version_incompatible', message: `Qt ${project.version} is incompatible with ${capability.qt.minVersion}${capability.qt.maxVersion ? `-${capability.qt.maxVersion}` : '+'}`, capabilityId: capability.id });
    }
    for (const module of capability.qt.modules) if (!project.modules.includes(module)) findings.push({ code: 'qt_module_missing', message: `Missing Qt module ${module}`, capabilityId: capability.id });
    if (capability.kind === 'promoted_widget' && capability.designer.header && !has(project.files, capability.designer.header)) findings.push({ code: 'promoted_header_missing', message: `Missing promoted widget header ${capability.designer.header}`, capabilityId: capability.id });
    for (const value of capability.dependencies.qss) if (!has(project.qss, value)) findings.push({ code: 'qss_missing', message: `Missing QSS dependency ${value}`, capabilityId: capability.id });
    for (const value of capability.dependencies.qrc) if (!has(project.qrc, value)) findings.push({ code: 'qrc_missing', message: `Missing QRC dependency ${value}`, capabilityId: capability.id });
    for (const value of capability.dependencies.fonts) if (!has(project.fonts, value)) findings.push({ code: 'font_missing', message: `Missing font dependency ${value}`, capabilityId: capability.id });
    return findings;
  }
}

