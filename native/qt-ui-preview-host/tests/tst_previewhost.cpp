#include "FormLoader.h"
#include "ResourceLoader.h"

#include <QDir>
#include <QFileInfo>
#include <QImage>
#include <QtTest>

class PreviewHostTest : public QObject {
    Q_OBJECT
private slots:
    void loadsResourceAndStyleSheet();
    void isolatesResourceCacheAcrossQtMajors();
};

void PreviewHostTest::loadsResourceAndStyleSheet()
{
    PreviewRequest request;
    request.uiFile = QFINDTESTDATA("fixtures/resource-form.ui");
    request.rccExecutable = QString::fromLocal8Bit(PREVIEW_TEST_RCC_PATH);
    request.qrcFiles << QFINDTESTDATA("fixtures/common.qrc");
    request.qssFiles << QFINDTESTDATA("fixtures/preview.qss");
    request.outputImage = QDir(QDir::tempPath()).filePath("preview-host-test.png");
    PreviewResult result = renderPreview(request);
    QVERIFY2(result.success, qPrintable(result.error));
    QVERIFY(result.loadedResources.contains("common.qrc"));
    const PreviewWidget *save = result.widget("saveButton");
    QVERIFY(save != 0);
    QVERIFY(save->styleSheetMatched);
    QVERIFY(QFileInfo(result.imagePath).size() > 1000);
    const QImage image(result.imagePath);
    QCOMPARE(image.size(), QSize(900, 640));
}

void PreviewHostTest::isolatesResourceCacheAcrossQtMajors()
{
    const QString qrc = QFINDTESTDATA("fixtures/common.qrc");
    const QString rcc = QString::fromLocal8Bit(PREVIEW_TEST_RCC_PATH);
    const QString qt5Key = ResourceLoader::resourceCacheKeyForTesting(qrc, rcc, 5);
    const QString qt6Key = ResourceLoader::resourceCacheKeyForTesting(qrc, rcc, 6);
    QVERIFY(!qt5Key.isEmpty());
    QVERIFY(!qt6Key.isEmpty());
    QVERIFY2(qt5Key != qt6Key, "Qt 5 and Qt 6 must never share a binary resource cache entry");
}

QTEST_MAIN(PreviewHostTest)
#include "tst_previewhost.moc"
