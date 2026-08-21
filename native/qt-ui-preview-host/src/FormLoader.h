#pragma once

#include "PreviewRequest.h"

#include <QUiLoader>
#include <QMap>

class QWidget;

class FormLoader : public QUiLoader {
public:
    explicit FormLoader(QObject *parent = 0);
    QWidget *loadForm(const PreviewRequest &request, PreviewResult *result, QString *error);
protected:
    QWidget *createWidget(const QString &className, QWidget *parent, const QString &name);
private:
    void readPromotedWidgets(const QString &uiFile);
    QMap<QString, QString> promotedBases_;
    PreviewResult *result_;
};

PreviewResult renderPreview(const PreviewRequest &request);
