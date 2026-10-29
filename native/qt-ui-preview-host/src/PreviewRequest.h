#pragma once

#include <QJsonObject>
#include <QList>
#include <QString>
#include <QStringList>

struct DegradedWidget {
    QString className;
    QString fallbackClass;
    QString objectName;
};

struct PreviewWidget {
    QString objectName;
    QString className;
    bool styleSheetMatched;
};

struct PreviewRequest {
    QString uiFile;
    QString rccExecutable;
    QString cacheDirectory;
    QString outputImage;
    QString locale;
    QString style;
    int width;
    int height;
    QStringList qrcFiles;
    QStringList qssFiles;
    QStringList fontFiles;
    QStringList pluginPaths;

    PreviewRequest();
    static bool fromJson(const QJsonObject &object, PreviewRequest *request, QString *error);
};

struct PreviewResult {
    bool success;
    int width;
    int height;
    QString imagePath;
    QString error;
    QStringList loadedResources;
    QStringList loadedStyleSheets;
    QStringList loadedFonts;
    QList<DegradedWidget> degradedWidgets;
    QList<PreviewWidget> widgets;

    PreviewResult();
    QJsonObject toJson() const;
    const PreviewWidget *widget(const QString &objectName) const;
};
