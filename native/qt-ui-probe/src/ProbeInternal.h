#ifndef QT_UI_PROBE_INTERNAL_H
#define QT_UI_PROBE_INTERNAL_H

#include <QtCore/QJsonObject>
#include <QtCore/QPoint>
#include <QtCore/QString>
#include <QtCore/QVector>

class QWidget;
class QObject;
class QLocalServer;

namespace QtUiProbeInternal {

struct RecordedStep {
    QString action;
    QString objectPath;
    QJsonObject value;
};

QJsonObject widgetSummary(QWidget *widget);
QJsonObject dumpWidgetTree(QWidget *widget, int maxDepth = 64);
QWidget *findWidget(const QString &objectName);
QWidget *findWindow(const QString &name);
QWidget *widgetAt(const QPoint &point);
QString objectPath(QObject *object);
QJsonObject capture(QWidget *widget);
QJsonObject identifyVisibleUi();
bool executeAction(const QString &method, const QJsonObject &params, QJsonObject *result, QString *error);

class RouteRecorder;
RouteRecorder *routeRecorder();

class ProbeServer;
ProbeServer *createServer(const QString &name, const QString &token, bool semanticActions, bool recordTextEntry);
void destroyServer();

} // namespace QtUiProbeInternal

#endif
