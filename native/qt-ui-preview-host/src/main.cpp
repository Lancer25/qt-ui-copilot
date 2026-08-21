#include "FormLoader.h"
#include "PreviewRequest.h"

#include <QApplication>
#include <QJsonDocument>
#include <QTextStream>

int main(int argc, char *argv[])
{
#if QT_VERSION < QT_VERSION_CHECK(6, 0, 0)
    QApplication::setAttribute(Qt::AA_EnableHighDpiScaling);
#endif
    QApplication application(argc, argv);
    QTextStream input(stdin, QIODevice::ReadOnly); QTextStream output(stdout, QIODevice::WriteOnly);
    while (!input.atEnd()) {
        const QString line = input.readLine(); if (line.trimmed().isEmpty()) continue;
        PreviewResult result; QJsonParseError parseError;
        const QJsonDocument json = QJsonDocument::fromJson(line.toUtf8(), &parseError);
        PreviewRequest request; QString error;
        if (parseError.error != QJsonParseError::NoError || !json.isObject() || !PreviewRequest::fromJson(json.object(), &request, &error)) result.error = error.isEmpty() ? parseError.errorString() : error;
        else result = renderPreview(request);
        output << QString::fromUtf8(QJsonDocument(result.toJson()).toJson(QJsonDocument::Compact)) << QLatin1Char('\n'); output.flush();
    }
    return 0;
}
