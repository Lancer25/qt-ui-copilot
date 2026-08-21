#ifndef QT_UI_PROBE_TEST_CLIENT_H
#define QT_UI_PROBE_TEST_CLIENT_H

#include <QtCore/QJsonObject>
#include <QtCore/QString>

class TestClient {
public:
    explicit TestClient(const QString &serverName);
    QJsonObject sendRequest(const QString &token, const QString &method, const QJsonObject &params = QJsonObject()) const;
    static QString validToken();
private:
    QString m_serverName;
};

#endif
