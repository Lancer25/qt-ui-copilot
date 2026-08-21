import type { ComponentCandidate } from '@qt-ui-copilot/component-library';
import type { ReportRequest, WorkflowUiState } from '../../lib/api';

export const makeReportRequest = (task: WorkflowUiState, selectedComponent?: ComponentCandidate): ReportRequest => ({ task, selectedComponent });

export function EvidenceReport({ task, selectedComponent, onExport }: { task?: WorkflowUiState; selectedComponent?: ComponentCandidate; onExport: () => void }) {
  return <section aria-label="证据报告" className="report"><h2>证据报告</h2>
    <p>{task ? `Qt Kit：${task.qtKit ?? '未记录'}；最终状态：${task.status}` : '完成任务后可导出自包含 HTML 报告。'}</p>
    {selectedComponent && <p>已选择组件：{selectedComponent.component.name}</p>}
    <button onClick={onExport} disabled={!task}>导出证据报告</button>
  </section>;
}
