import process from 'node:process';
import path from 'node:path';

const mode = process.env.PREVIEW_FAKE_MODE;
if (mode === 'crash') process.exit(9);
if (mode === 'timeout') setTimeout(() => process.exit(0), 1_000);
if (mode === 'malformed') process.stdout.write('not-json\n');
else if (mode === 'degraded') process.stdout.write(JSON.stringify({ success: true, imagePath: 'preview.png', width: 420, height: 220, loadedResources: ['common.qrc'], degradedWidgets: [{ className: 'Chart', fallbackClass: 'QWidget', objectName: 'chart' }] }) + '\n');
else if (mode === 'environment') {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const firstPathEntry = (process.env[pathKey] || '').split(path.delimiter)[0];
  const success = firstPathEntry === process.env.PREVIEW_TEST_QT_BIN
    && process.env.PREVIEW_TEST_MARKER === 'configured';
  process.stdout.write(JSON.stringify(success
    ? { success: true, imagePath: 'preview.png', findings: [], degradedFeatures: [] }
    : { success: false, error: `Unexpected PreviewHost environment: ${firstPathEntry}` }) + '\n');
}
else process.stdout.write(JSON.stringify({ success: true, imagePath: 'preview.png', findings: [], degradedFeatures: [] }) + '\n');
