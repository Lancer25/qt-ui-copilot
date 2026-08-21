import process from 'node:process';

const mode = process.env.PREVIEW_FAKE_MODE;
if (mode === 'crash') process.exit(9);
if (mode === 'timeout') setTimeout(() => process.exit(0), 1_000);
if (mode === 'malformed') process.stdout.write('not-json\n');
else if (mode === 'degraded') process.stdout.write(JSON.stringify({ success: true, imagePath: 'preview.png', loadedResources: ['common.qrc'], degradedWidgets: [{ className: 'Chart', fallbackClass: 'QWidget', objectName: 'chart' }] }) + '\n');
else process.stdout.write(JSON.stringify({ success: true, imagePath: 'preview.png', findings: [], degradedFeatures: [] }) + '\n');
