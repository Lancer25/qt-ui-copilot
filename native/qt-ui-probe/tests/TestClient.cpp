#include "TestClient.h"

#include <QtCore/QJsonDocument>
#include <QtCore/QJsonParseError>
#include <QtCore/QElapsedTimer>
#include <QtWidgets/QApplication>
#include <QtNetwork/QLocalSocket>

TestClient::TestClient(const QString &serverName) : m_serverName(serverName) {}

QString TestClient::validToken() { return QString::fromLatin1("test-probe-token"); }

QJsonObject TestClient::sendRequest(const QString &token, const QString &method, const QJsonObject &params) const
{
    QLocalSocket socket;
    socket.connectToServer(m_serverName);
    if (!socket.waitForConnected(1000)) return QJsonObject();
    QJsonObject request; request.insert("id", "test"); request.insert("token", token); request.insert("method", method); request.insert("params", params);
    socket.write(QJsonDocument(request).toJson(QJsonDocument::Compact)); socket.write("\n"); socket.flush();
    QElapsedTimer timer; timer.start();
    while (!socket.canReadLine() && timer.elapsed() < 1000) {
        qApp->processEvents();
        socket.waitForReadyRead(10);
    }
    if (!socket.canReadLine()) return QJsonObject();
    const QJsonDocument response = QJsonDocument::fromJson(socket.readLine());
    return response.object();
}
