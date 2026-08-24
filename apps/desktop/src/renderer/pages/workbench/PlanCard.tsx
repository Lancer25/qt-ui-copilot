import type { WorkflowUiState } from '../../lib/api';
export function PlanCard({ task }: { task?: WorkflowUiState }) { if (!task?.plan) return null; return <section aria-label="结构化修改计划" className="plan"><h2>结构化修改计划</h2><p>{task.plan.summary}（{task.plan.operations.length} 项受控修改）</p><ul>{task.plan.operations.map((operation, index) => <li key={index}>{operation.op}</li>)}</ul></section>; }
