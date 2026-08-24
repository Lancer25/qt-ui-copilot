export interface StatusBarProps { projectName?: string; modelName?: string; taskStatus?: string; message?: string; }
export function StatusBar({ projectName = '未选择项目', modelName = '未配置模型', taskStatus = '空闲', message }: StatusBarProps) {
  return <footer className="status-bar" aria-label="应用状态"><span>项目：{projectName}</span><span>模型：{modelName}</span><span>任务：{taskStatus}</span>{message && <span className="status-bar__message">{message}</span>}</footer>;
}
