export function PreviewComparison({ beforeImage, afterImage, quickImage }: { beforeImage?: string; afterImage?: string; quickImage?: string }) {
  const image = (source: string | undefined, label: string) => source
    ? <img src={source} alt={label} /> : <div className="image-placeholder" aria-label={label}>尚无截图</div>;
  return <section aria-label="运行效果对比" className="preview"><h2>运行效果对比</h2><div className="preview-grid">
    <figure>{image(beforeImage, '修改前真实截图')}<figcaption>修改前真实运行</figcaption></figure>
    <figure>{image(afterImage ?? quickImage, afterImage ? '修改后真实截图' : '修改后快速预览')}<figcaption>{afterImage ? '修改后真实运行' : '修改后快速预览'}</figcaption></figure>
  </div></section>;
}
