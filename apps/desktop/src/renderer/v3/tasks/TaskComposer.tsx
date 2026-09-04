import { useState } from 'react';
import type { AiAttachment } from '../assistant/attachment-reader';
import { AttachmentDropZone } from '../assistant/AttachmentDropZone';
import { AttachmentList } from '../assistant/AttachmentList';

export type TaskComposerInput = {
  text: string;
  attachments: AiAttachment[];
  contextMode: 'focused_ui' | 'whole_project';
  applyMode: 'approval' | 'automatic';
  createProject: boolean;
  buildBackend: 'qmake' | 'msbuild' | 'auto';
};

export function TaskComposer({ running, queued, creationMode, onSubmit, onStop }: { running?: boolean; queued?: number; creationMode?: boolean; onSubmit: (input: TaskComposerInput) => Promise<void> | void; onStop?: () => Promise<void> | void }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [contextMode, setContextMode] = useState<'focused_ui' | 'whole_project'>('focused_ui');
  const [applyMode, setApplyMode] = useState<'approval' | 'automatic'>('approval');
  const [createProject, setCreateProject] = useState(true);
  const [buildBackend, setBuildBackend] = useState<'qmake' | 'msbuild' | 'auto'>('auto');
  const [attachmentError, setAttachmentError] = useState<string>();
  const submit = async () => {
    if (!text.trim() && !attachments.length) return;
    await onSubmit({ text: text.trim(), attachments, contextMode, applyMode, createProject: creationMode === false ? false : createProject, buildBackend });
    setText(''); setAttachments([]); setAttachmentError(undefined);
  };
  return <form className="v3-task-composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <AttachmentList attachments={attachments} onRemove={(id) => setAttachments((all) => all.filter((item) => item.id !== id))} />
    <AttachmentDropZone attachments={attachments} onAdd={(items) => setAttachments((all) => [...all, ...items])} onError={setAttachmentError}>
      <div className="v3-task-composer__drop-copy"><span>拖入图片或 Qt 文件作为上下文</span><small>支持 PNG、JPG、WebP、UI、QSS、QRC 和源码</small></div>
    </AttachmentDropZone>
    {attachmentError ? <p className="v3-task-composer__error" role="alert">{attachmentError}</p> : null}
    <textarea aria-label="发送给 AI" value={text} onChange={(event) => setText(event.target.value)} placeholder={running ? '当前任务执行中；新消息将加入队列…' : '描述你想创建或修改的界面…'} rows={3} />
    <footer><div className="v3-task-composer__switches"><div aria-label="AI 上下文"><button type="button" className={contextMode === 'focused_ui' ? 'is-active' : ''} onClick={() => setContextMode('focused_ui')}>专注界面</button><button type="button" className={contextMode === 'whole_project' ? 'is-active' : ''} onClick={() => setContextMode('whole_project')}>整体模式</button></div><div aria-label="应用方式"><button type="button" className={applyMode === 'approval' ? 'is-active' : ''} onClick={() => setApplyMode('approval')}>审批</button><button type="button" className={applyMode === 'automatic' ? 'is-active' : ''} onClick={() => setApplyMode('automatic')}>自动应用</button></div>{creationMode !== false ? <div aria-label="创建类型"><button type="button" className={createProject ? 'is-active' : ''} onClick={() => setCreateProject(true)}>完整应用</button><button type="button" className={!createProject ? 'is-active' : ''} onClick={() => setCreateProject(false)}>仅界面</button><label className="v3-task-composer__backend">构建<select aria-label="构建后端" value={buildBackend} onChange={(event) => setBuildBackend(event.target.value as typeof buildBackend)} disabled={!createProject}><option value="auto">自动</option><option value="qmake">QMake</option><option value="msbuild">MSBuild</option></select></label></div> : null}</div><div className="v3-task-composer__actions">{queued ? <span role="status">已加入队列{queued > 1 ? ` · ${queued}` : ''}</span> : null}{running && onStop ? <button type="button" className="v3-task-composer__stop" aria-label="停止当前任务" onClick={() => void onStop()}>停止</button> : null}<button type="submit" className="v3-task-composer__send" disabled={!text.trim() && !attachments.length}>发送</button></div></footer>
  </form>;
}
