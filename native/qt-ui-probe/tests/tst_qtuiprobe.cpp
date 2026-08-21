#include <QtTest/QtTest>
#include <QtWidgets/QApplication>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QWidget>

#include <QtUiProbe/QtUiProbe.h>
#include "ProbeInternal.h"
#include "TestClient.h"

static QJsonObject findNode(const QJsonObject &tree, const QString &objectName)
{
    if (tree.value("objectName").toString() == objectName) return tree;
    const QJsonArray children = tree.value("children").toArray();
    for (int i = 0; i < children.size(); ++i) {
        const QJsonObject found = findNode(children.at(i).toObject(), objectName);
        if (!found.isEmpty()) return found;
    }
    return QJsonObject();
}

class ProbeTest : public QObject {
    Q_OBJECT
private slots:
    void initTestCase() {
        QtUiProbe::InstallOptions options; options.sessionToken = TestClient::validToken(); options.serverName = "qt-ui-probe-test";
        options.enableSemanticActions = true;
        QVERIFY(QtUiProbe::install(options));
    }
    void cleanupTestCase() { QtUiProbe::uninstall(); }
    void requiresTokenAndRejectsUnknownMethod() {
        TestClient client(QtUiProbe::serverName());
        QCOMPARE(client.sendRequest("wrong", "listWindows").value("error").toObject().value("code").toString(), QString("AUTH_FAILED"));
        QCOMPARE(client.sendRequest(TestClient::validToken(), "deleteFile").value("error").toObject().value("code").toString(), QString("METHOD_NOT_ALLOWED"));
    }
    void reportsNamedWidgetTree() {
        QWidget window; window.setObjectName("testWindow"); QPushButton button("Save", &window); button.setObjectName("saveButton");
        QJsonObject tree = QtUiProbeInternal::dumpWidgetTree(&window);
        QCOMPARE(findNode(tree, "saveButton").value("className").toString(), QString("QPushButton"));
    }
    void rejectsActionClassMismatch() {
        QWidget window; window.setObjectName("plain");
        TestClient client(QtUiProbe::serverName()); QJsonObject params; params.insert("objectName", "plain");
        QCOMPARE(client.sendRequest(TestClient::validToken(), "invokeButton", params).value("success").toBool(), false);
    }
};

QTEST_MAIN(ProbeTest)
#include "tst_qtuiprobe.moc"
