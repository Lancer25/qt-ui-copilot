#include "PreviewRequest.h"

#include <QJsonArray>

namespace {
QStringList stringList(const QJsonObject &object, const char *name)
{
    QStringList values;
    const QJsonArray array = object.value(QLatin1String(name)).toArray();
    for (int index = 0; index < array.size(); ++index) {
        if (array.at(index).isString()) values.append(array.at(index).toString());
    }
    return values;
}
}

PreviewRequest::PreviewRequest() : width(900), height(640) {}

bool PreviewRequest::fromJson(const QJsonObject &object, PreviewRequest *request, QString *error)
{
    if (!request || !error) return false;
    PreviewRequest parsed;
    parsed.uiFile = object.value("uiFile").toString();
    parsed.rccExecutable = object.value("rccExecutable").toString();
    parsed.cacheDirectory = object.value("cacheDirectory").toString();
    parsed.outputImage = object.value("outputImage").toString();
    parsed.locale = object.value("locale").toString();
    parsed.style = object.value("style").toString();
    parsed.width = object.value("width").toInt(900);
    parsed.height = object.value("height").toInt(640);
    parsed.qrcFiles = stringList(object, "qrcFiles");
    parsed.qssFiles = stringList(object, "stylesheets");
    parsed.fontFiles = stringList(object, "fonts");
    parsed.pluginPaths = stringList(object, "pluginPaths");
    if (parsed.uiFile.isEmpty()) { *error = "uiFile is required"; return false; }
    if (parsed.outputImage.isEmpty()) { *error = "outputImage is required"; return false; }
    if (parsed.width <= 0 || parsed.height <= 0 || parsed.width > 8192 || parsed.height > 8192) {
        *error = "width and height must be between 1 and 8192"; return false;
    }
    if (!parsed.qrcFiles.isEmpty() && parsed.rccExecutable.isEmpty()) { *error = "rccExecutable is required when qrcFiles are supplied"; return false; }
    *request = parsed;
    return true;
}

PreviewResult::PreviewResult() : success(false) {}

QJsonObject PreviewResult::toJson() const
{
    QJsonObject object;
    object.insert("success", success);
    if (!imagePath.isEmpty()) object.insert("imagePath", imagePath);
    if (!error.isEmpty()) object.insert("error", error);
    QJsonArray resources; foreach (const QString &value, loadedResources) resources.append(value);
    QJsonArray styles; foreach (const QString &value, loadedStyleSheets) styles.append(value);
    QJsonArray fonts; foreach (const QString &value, loadedFonts) fonts.append(value);
    QJsonArray degraded;
    foreach (const DegradedWidget &value, degradedWidgets) {
        QJsonObject item; item.insert("className", value.className); item.insert("fallbackClass", value.fallbackClass); item.insert("objectName", value.objectName); degraded.append(item);
    }
    QJsonArray widgets;
    foreach (const PreviewWidget &value, this->widgets) {
        QJsonObject item; item.insert("objectName", value.objectName); item.insert("className", value.className); item.insert("styleSheetMatched", value.styleSheetMatched); widgets.append(item);
    }
    object.insert("loadedResources", resources); object.insert("loadedStyleSheets", styles); object.insert("loadedFonts", fonts);
    object.insert("degradedWidgets", degraded); object.insert("widgets", widgets);
    return object;
}

const PreviewWidget *PreviewResult::widget(const QString &objectName) const
{
    for (int index = 0; index < widgets.size(); ++index) if (widgets.at(index).objectName == objectName) return &widgets.at(index);
    return 0;
}
