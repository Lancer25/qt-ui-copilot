export interface ComponentPreviewSurfaceProps {
  title: string;
  canPreview: boolean;
  rendering: boolean;
  imageDataUrl?: string;
  error?: string;
  errorTitle?: string;
  errorActionLabel?: string;
  onErrorAction?: () => void;
  onGenerate(): void;
  onOpen(): void;
}

function PreviewGlyph({ name }: { name: 'preview' | 'refresh' | 'open' | 'warning' }) {
  if (name === 'refresh') return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M13 4.8V1.9l-1.4 1.4A5.6 5.6 0 1 0 13.4 9h-1.7A4 4 0 1 1 10.4 4.5L8.7 6.2H13V4.8Z" /></svg>;
  if (name === 'open') return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M9.5 2H14v4.5h-1.5v-2L7.7 9.3 6.7 8.2l4.8-4.7h-2V2ZM3.5 3.5h4V5H5v6h6V8.5h1.5v4H3.5v-9Z" /></svg>;
  if (name === 'warning') return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 1.7 15 14H1L8 1.7Zm0 3.2-.8 5.3h1.6L8 4.9Zm0 7a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M1 3h14v10H1V3Zm1.5 1.5v7h11v-7h-11Zm2 5.7 2.1-2.4 1.6 1.7 1.5-1.4 2 2.1H4.5ZM10.7 6a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" /></svg>;
}

export function ComponentPreviewSurface({ title, canPreview, rendering, imageDataUrl, error, errorTitle, errorActionLabel, onErrorAction, onGenerate, onOpen }: ComponentPreviewSurfaceProps) {
  if (!canPreview) return <div className="v3-component-preview is-unavailable"><PreviewGlyph name="preview" /><span><b>暂无预览</b><small>该组件未提供可预览内容</small></span></div>;
  if (rendering) return <div className="v3-component-preview is-loading" role="status"><span className="v3-component-preview__spinner" aria-hidden="true" /><span><b>正在生成预览</b><small>正在使用当前 Qt Kit 渲染组件…</small></span></div>;
  if (error) return <div className="v3-component-preview is-error" role="alert"><PreviewGlyph name="warning" /><span><b>{errorTitle ?? '预览失败'}</b><small>{error}</small></span><button type="button" onClick={onErrorAction ?? onGenerate}>{errorActionLabel ?? '重试预览'}</button></div>;
  if (imageDataUrl) return <div className="v3-component-preview is-ready">
    <button type="button" className="v3-component-preview__image" aria-label={`打开${title}预览大图`} onClick={onOpen}><img src={imageDataUrl} alt={`${title} 预览`} /><span><PreviewGlyph name="open" />点击打开大图</span></button>
    <button type="button" className="v3-component-preview__refresh" aria-label="重新生成预览" title="重新生成预览" onClick={onGenerate}><PreviewGlyph name="refresh" /></button>
  </div>;
  return <button type="button" className="v3-component-preview is-empty" aria-label="生成组件预览" onClick={onGenerate}><PreviewGlyph name="preview" /><span><b>生成组件预览</b><small>使用当前 Qt Kit 查看真实效果</small></span></button>;
}
