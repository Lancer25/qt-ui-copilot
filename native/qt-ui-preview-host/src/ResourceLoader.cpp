#include "ResourceLoader.h"

#include <QApplication>
#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QFontDatabase>
#include <QProcess>
#include <QResource>
#include <QStyleFactory>
#include <QXmlStreamReader>

namespace {
QByteArray qrcDigest(const QString &qrcFile)
{
    QFile qrc(qrcFile); if (!qrc.open(QIODevice::ReadOnly)) return QByteArray();
    const QByteArray qrcData = qrc.readAll();
    QCryptographicHash hash(QCryptographicHash::Sha256); hash.addData(qrcData);
    QXmlStreamReader xml(qrcData); const QDir base = QFileInfo(qrcFile).absoluteDir();
    while (!xml.atEnd()) {
        xml.readNext();
        if (!xml.isStartElement() || xml.name() != "file") continue;
        const QString resourceFile = base.filePath(xml.readElementText());
        QFile file(resourceFile); if (file.open(QIODevice::ReadOnly)) hash.addData(file.readAll());
    }
    return hash.result().toHex();
}

QStringList uiReferencedQrcFiles(const QString &uiFile)
{
    QStringList result;
    QFile ui(uiFile); if (!ui.open(QIODevice::ReadOnly)) return result;
    QXmlStreamReader xml(&ui); const QDir base = QFileInfo(uiFile).absoluteDir();
    while (!xml.atEnd()) {
        xml.readNext();
        if (xml.isStartElement() && xml.name() == "include" && xml.attributes().hasAttribute("location")) {
            const QString qrc = base.filePath(xml.attributes().value("location").toString());
            if (!result.contains(qrc)) result.append(qrc);
        }
    }
    return result;
}
}

ResourceLoader::ResourceLoader() {}
ResourceLoader::~ResourceLoader()
{
    foreach (const QString &path, registeredResources_) QResource::unregisterResource(path);
}

bool ResourceLoader::load(const PreviewRequest &request, PreviewResult *result, QString *error)
{
    if (!result || !error) return false;
    const QString cacheRoot = request.cacheDirectory.isEmpty()
        ? QDir(QFileInfo(request.outputImage).absolutePath()).filePath(".qt-ui-preview-cache")
        : request.cacheDirectory;
    if (!QDir().mkpath(cacheRoot)) { *error = "Unable to create preview resource cache"; return false; }
    QStringList qrcFiles = request.qrcFiles;
    foreach (const QString &qrcFile, uiReferencedQrcFiles(request.uiFile)) if (!qrcFiles.contains(qrcFile)) qrcFiles.append(qrcFile);
    if (!qrcFiles.isEmpty() && request.rccExecutable.isEmpty()) { *error = "rccExecutable is required when the UI references QRC resources"; return false; }
    foreach (const QString &qrcFile, qrcFiles) {
        const QByteArray digest = qrcDigest(qrcFile);
        if (digest.isEmpty()) { *error = QString("Unable to read QRC: %1").arg(qrcFile); return false; }
        const QString compiled = QDir(cacheRoot).filePath(QString::fromLatin1(digest) + ".rcc");
        if (!QFileInfo(compiled).exists()) {
            QProcess rcc;
            rcc.start(request.rccExecutable, QStringList() << "-binary" << qrcFile << "-o" << compiled);
            if (!rcc.waitForFinished(30000) || rcc.exitCode() != 0) {
                *error = QString("rcc failed for %1: %2").arg(qrcFile, QString::fromLocal8Bit(rcc.readAllStandardError())); return false;
            }
        }
        if (!QResource::registerResource(compiled)) { *error = QString("Unable to register resource: %1").arg(compiled); return false; }
        registeredResources_.append(compiled); result->loadedResources.append(QFileInfo(qrcFile).fileName());
    }
    foreach (const QString &fontFile, request.fontFiles) {
        if (QFontDatabase::addApplicationFont(fontFile) < 0) { *error = QString("Unable to load font: %1").arg(fontFile); return false; }
        result->loadedFonts.append(QFileInfo(fontFile).fileName());
    }
    if (!request.style.isEmpty()) {
        QApplication::setStyle(request.style);
        if (!QApplication::style()) { *error = QString("Unknown Qt style: %1").arg(request.style); return false; }
    }
    QString styleSheet;
    foreach (const QString &qssFile, request.qssFiles) {
        QFile source(qssFile);
        if (!source.open(QIODevice::ReadOnly | QIODevice::Text)) { *error = QString("Unable to read stylesheet: %1").arg(qssFile); return false; }
        styleSheet += QString::fromUtf8(source.readAll()) + QLatin1Char('\n');
        result->loadedStyleSheets.append(QFileInfo(qssFile).fileName());
    }
    qApp->setStyleSheet(styleSheet);
    return true;
}
