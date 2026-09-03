#include "FormLoader.h"
#include "ResourceLoader.h"

#include <QApplication>
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QImage>
#include <QPainter>
#include <QLocale>
#include <QTextStream>
#include <QWidget>
#include <QXmlStreamReader>

FormLoader::FormLoader(QObject *parent) : QUiLoader(parent), result_(0) {}

void FormLoader::readPromotedWidgets(const QString &uiFile)
{
    QFile file(uiFile); if (!file.open(QIODevice::ReadOnly)) return;
    QXmlStreamReader xml(&file); QString currentClass;
    while (!xml.atEnd()) {
        xml.readNext();
        if (xml.isStartElement() && xml.name() == "customwidget") currentClass.clear();
        else if (xml.isStartElement() && xml.name() == "class") currentClass = xml.readElementText();
        else if (xml.isStartElement() && xml.name() == "extends" && !currentClass.isEmpty()) promotedBases_.insert(currentClass, xml.readElementText());
    }
}

QWidget *FormLoader::createWidget(const QString &className, QWidget *parent, const QString &name)
{
    QWidget *widget = QUiLoader::createWidget(className, parent, name);
    if (widget || !promotedBases_.contains(className)) return widget;
    const QString base = promotedBases_.value(className);
    widget = QUiLoader::createWidget(base, parent, name);
    if (widget && result_) {
        DegradedWidget degraded; degraded.className = className; degraded.fallbackClass = base; degraded.objectName = name;
        result_->degradedWidgets.append(degraded);
    }
    return widget;
}

QWidget *FormLoader::loadForm(const PreviewRequest &request, PreviewResult *result, QString *error)
{
    result_ = result; readPromotedWidgets(request.uiFile);
    setWorkingDirectory(QFileInfo(request.uiFile).absoluteDir());
    foreach (const QString &path, request.pluginPaths) addPluginPath(path);
    QFile source(request.uiFile);
    if (!source.open(QIODevice::ReadOnly)) { *error = QString("Unable to read UI: %1").arg(request.uiFile); return 0; }
    QWidget *widget = load(&source, 0);
    if (!widget) { *error = errorString(); return 0; }
    return widget;
}

PreviewResult renderPreview(const PreviewRequest &request)
{
    PreviewResult result; QString error;
    if (!request.locale.isEmpty()) QLocale::setDefault(QLocale(request.locale));
    ResourceLoader resources;
    if (!resources.load(request, &result, &error)) { result.error = error; return result; }
    FormLoader loader;
    QWidget *root = loader.loadForm(request, &result, &error);
    if (!root) { result.error = error; return result; }
    root->resize(request.width, request.height); root->show();
    QApplication::processEvents(); QApplication::processEvents();
    const QPixmap image = root->grab();
    if (image.isNull()) { result.error = QString("Unable to capture preview image"); delete root; return result; }
    QImage canvas(request.width, request.height, QImage::Format_ARGB32_Premultiplied); canvas.fill(Qt::transparent);
    const QImage fitted = image.toImage().scaled(request.width, request.height, Qt::KeepAspectRatio, Qt::SmoothTransformation);
    QPainter painter(&canvas); painter.drawImage((request.width - fitted.width()) / 2, (request.height - fitted.height()) / 2, fitted); painter.end();
    if (!canvas.save(request.outputImage)) { result.error = QString("Unable to save screenshot: %1").arg(request.outputImage); delete root; return result; }
    const QList<QWidget *> children = root->findChildren<QWidget *>();
    QList<QWidget *> all; all.append(root); all.append(children);
    foreach (QWidget *widget, all) {
        if (widget->objectName().isEmpty()) continue;
        PreviewWidget entry; entry.objectName = widget->objectName(); entry.className = QString::fromLatin1(widget->metaObject()->className());
        QApplication *application = qobject_cast<QApplication *>(QCoreApplication::instance());
        entry.styleSheetMatched = (application && !application->styleSheet().isEmpty()) || !widget->styleSheet().isEmpty(); result.widgets.append(entry);
    }
    result.success = true; result.imagePath = request.outputImage; delete root; return result;
}
