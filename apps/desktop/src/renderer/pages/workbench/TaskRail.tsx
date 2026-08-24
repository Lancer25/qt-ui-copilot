import type { WorkflowUiState } from '../../lib/api';
import { WorkflowTimeline } from '../../features/workflow/WorkflowTimeline';
export function TaskRail({ task, onTakeOver, onCancel, onAccept, onRollback }: { task?: WorkflowUiState; onTakeOver: () => void; onCancel: () => void; onAccept: () => void; onRollback: () => void }) { return <WorkflowTimeline task={task} onTakeOver={onTakeOver} onCancel={onCancel} onAccept={onAccept} onRollback={onRollback} />; }
