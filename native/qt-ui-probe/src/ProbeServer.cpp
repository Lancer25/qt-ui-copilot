#include "ProbeInternal.h"

#include <QtCore/QEventLoop>
#include <QtCore/QHash>
#include <QtCore/QJsonArray>
#include <QtCore/QJsonDocument>
#include <QtCore/QJsonParseError>
#include <QtCore/QMetaObject>
#include <QtCore/QPointer>
#include <QtCore/QTimer>
#include <QtNetwork/QLocalServer>
#include <QtNetwork/QLocalSocket>
#include <QtWidgets/QApplication>
#include <QtWidgets/QWidget>

namespace QtUiProbeInternal {

static const int kMaximumMessageSize = 1024 * 1024;

class ProbeServerImpl : public QObject {
public:
    ProbeServerImpl(const QString &name, const QString &token, bool semanticActions, bool recordText)
        : m_token(token), m_actionsEnabled(semanticActions), m_server(new QLocalServer(this)) {
        Q_UNUSED(recordText);
        QLocalServer::removeServer(name);
#if QT_VERSION >= QT_VERSION_CHECK(5, 10, 0)
        m_server->setSocketOptions(QLocalServer::UserAccessOption);
#endif
        if (!m_server->listen(name)) return;
        connect(m_server, &QLocalServer::newConnection, this, [this]() { accept(); });
    }
    bool listening() const { return m_server->isListening(); }
    QString name() const { return m_server->fullServerName(); }
private:
    void accept() {
        while (m_server->hasPendingConnections()) {
            QLocalSocket *socket = m_server->nextPendingConnection();
            m_buffers.insert(socket, QByteArray());
            connect(socket, &QLocalSocket::readyRead, this, [this, socket]() { read(socket); });
            connect(socket, &QLocalSocket::disconnected, this, [this, socket]() { m_buffers.remove(socket); socket->deleteLater(); });
        }
    }
    void send(QLocalSocket *socket, const QJsonObject &object) {
        socket->write(QJsonDocument(object).toJson(QJsonDocument::Compact)); socket->write("\n"); socket->flush();
    }
    QJsonObject error(const QString &id, const QString &code, const QString &message) {
        QJsonObject failure; failure.insert("id", id); failure.insert("success", false);
        QJsonObject detail; detail.insert("code", code); detail.insert("message", message); failure.insert("error", detail); return failure;
    }
    void read(QLocalSocket *socket) {
        QByteArray &buffer = m_buffers[socket]; buffer += socket->readAll();
        if (buffer.size() > kMaximumMessageSize) { socket->disconnectFromServer(); return; }
        int newline = -1;
        while ((newline = buffer.indexOf('\n')) >= 0) {
            const QByteArray line = buffer.left(newline); buffer.remove(0, newline + 1);
            if (line.size() > kMaximumMessageSize) { send(socket, error(QString(), "MESSAGE_TOO_LARGE", "Message is larger than 1 MiB")); continue; }
            QJsonParseError parseError; const QJsonDocument doc = QJsonDocument::fromJson(line, &parseError);
            if (parseError.error != QJsonParseError::NoError || !doc.isObject()) { send(socket, error(QString(), "INVALID_REQUEST", "Request must be a JSON object")); continue; }
            dispatch(socket, doc.object());
        }
    }
    void dispatch(QLocalSocket *socket, const QJsonObject &request) {
        const QString id = request.value("id").toString();
        if (request.value("token").toString() != m_token) { send(socket, error(id, "AUTH_FAILED", "Invalid session token")); return; }
        const QString method = request.value("method").toString();
        const QJsonObject params = request.value("params").toObject();
        static const QStringList readonly = QStringList() << "listWindows" << "dumpWidgetTree" << "findWidget" << "hitTest" << "identifyVisibleUi" << "captureWindow" << "captureWidget" << "getActiveModal" << "getFocusWidget";
        static const QStringList actions = QStringList() << "activateWindow" << "resizeWindow" << "invokeButton" << "triggerAction" << "selectTab" << "selectComboItem" << "setLineEditText" << "setCheckState" << "waitForWidget" << "waitForUi";
        if (!readonly.contains(method) && !actions.contains(method)) { send(socket, error(id, "METHOD_NOT_ALLOWED", "Method is not in the QtUiProbe allowlist")); return; }
        if (actions.contains(method) && !m_actionsEnabled) { send(socket, error(id, "ACTION_DISABLED", "Semantic actions are disabled for this session")); return; }

        QJsonObject result; QString failure;
        // install() creates the server on QApplication's thread, so readyRead
        // is delivered on the GUI thread.  This avoids post-5.9 functor-based
        // invokeMethod overloads while retaining the GUI-thread invariant.
        handleOnGuiThread(method, params, &result, &failure);
        if (!failure.isEmpty()) { send(socket, error(id, failure == "Method is not allowed" ? "METHOD_NOT_ALLOWED" : "REQUEST_FAILED", failure)); return; }
        QJsonObject response; response.insert("id", id); response.insert("success", true); response.insert("result", result); send(socket, response);
    }
    void handleOnGuiThread(const QString &method, const QJsonObject &params, QJsonObject *result, QString *failure) {
        if (method == QLatin1String("listWindows")) {
            QJsonArray windows; const QWidgetList top = QApplication::topLevelWidgets();
            for (int i = 0; i < top.size(); ++i) windows.append(widgetSummary(top.at(i)));
            result->insert("windows", windows); return;
        }
        if (method == QLatin1String("dumpWidgetTree")) { QWidget *window = findWindow(params.value("window").toString()); if (!window) { *failure = "Window not found"; return; } *result = dumpWidgetTree(window); return; }
        if (method == QLatin1String("findWidget")) { QWidget *widget = findWidget(params.value("objectName").toString()); if (!widget) { *failure = "Widget not found"; return; } *result = widgetSummary(widget); return; }
        if (method == QLatin1String("hitTest")) { QWidget *widget = widgetAt(QPoint(params.value("x").toInt(), params.value("y").toInt())); if (!widget) { *failure = "No widget at point"; return; } *result = widgetSummary(widget); return; }
        if (method == QLatin1String("identifyVisibleUi")) { *result = identifyVisibleUi(); return; }
        if (method == QLatin1String("captureWindow")) { QWidget *window = findWindow(params.value("window").toString()); *result = capture(window); if (result->contains("error")) *failure = result->value("error").toString(); return; }
        if (method == QLatin1String("captureWidget")) { QWidget *widget = findWidget(params.value("objectName").toString()); *result = capture(widget); if (result->contains("error")) *failure = result->value("error").toString(); return; }
        if (method == QLatin1String("getActiveModal")) { QWidget *modal = QApplication::activeModalWidget(); if (modal) *result = widgetSummary(modal); return; }
        if (method == QLatin1String("getFocusWidget")) { QWidget *focus = QApplication::focusWidget(); if (focus) *result = widgetSummary(focus); return; }
        if (!executeAction(method, params, result, failure)) return;
    }
    QString m_token;
    bool m_actionsEnabled;
    QLocalServer *m_server;
    QHash<QLocalSocket *, QByteArray> m_buffers;
};

class ProbeServer {};
static ProbeServerImpl *g_server = 0;
ProbeServer *createServer(const QString &name, const QString &token, bool semanticActions, bool recordText)
{
    destroyServer(); g_server = new ProbeServerImpl(name, token, semanticActions, recordText);
    if (!g_server->listening()) { delete g_server; g_server = 0; return 0; }
    return reinterpret_cast<ProbeServer *>(g_server);
}
void destroyServer() { delete g_server; g_server = 0; }

} // namespace QtUiProbeInternal
