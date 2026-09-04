import type { UiCreationCandidate } from '@qt-ui-copilot/contracts';

export interface TaskArtifactCardProps {
  candidate: UiCreationCandidate;
  onOpenPreview?: (candidate: UiCreationCandidate) => void;
  onOpenDiff?: (candidate: UiCreationCandidate) => void;
  onCommit?: (candidateId: string) => Promise<void> | void;
  onReject?: (candidateId: string) => Promise<void> | void;
}

export function TaskArtifactCard({ candidate, onOpenPreview, onOpenDiff, onCommit, onReject }: TaskArtifactCardProps) {
  const fileName = candidate.blueprint.fileName;
  const previewLabel = candidate.validation.preview ? '预览已生成' : candidate.validation.uic ? '预览待生成' : 'uic 校验失败';
  const isProject = Boolean(candidate.files?.length);
  return <article className="v3-task-artifact" aria-label={`${isProject ? '应用草稿' : '界面草稿'} ${fileName}`}>
    <div className="v3-task-artifact__header"><div><span className="v3-task-artifact__eyebrow">{isProject ? 'Qt 应用草稿' : '界面草稿'}</span><b>{fileName}</b></div><span className="v3-task-artifact__pending">待审批</span></div>
    {isProject ? <div className="v3-task-artifact__files" aria-label="应用文件清单">{candidate.files?.map((file) => <span key={file.relativePath} className={file.conflict ? 'is-conflict' : ''}>{file.conflict ? '⚠ ' : '✓ '}{file.relativePath}</span>)}</div> : null}
    <p>{candidate.blueprint.rootType} · {candidate.blueprint.expectedResults.length} 项预期结果</p>
    <div className="v3-task-artifact__checks"><span className={candidate.validation.uic ? 'is-ok' : 'is-error'}>{candidate.validation.uic ? '✓ uic 校验通过' : '× uic 校验失败'}</span><span className={candidate.validation.preview ? 'is-ok' : 'is-pending'}>{candidate.validation.preview ? '✓ 预览已就绪' : `○ ${previewLabel}`}</span></div>
    <div className="v3-task-artifact__actions"><button type="button" onClick={() => onOpenPreview?.(candidate)}>打开预览</button><button type="button" onClick={() => onOpenDiff?.(candidate)}>查看 Diff</button><span /><button type="button" onClick={() => void onReject?.(candidate.id)}>放弃</button><button type="button" className="v3-task-artifact__approve" disabled={!candidate.validation.uic} onClick={() => void onCommit?.(candidate.id)}>审批并保存</button></div>
  </article>;
}
