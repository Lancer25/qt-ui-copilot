#include "ProbeInternal.h"

#include <QtCore/QElapsedTimer>
#include <QtCore/QThread>
#if QT_VERSION >= QT_VERSION_CHECK(6, 0, 0)
#include <QtGui/QAction>
#else
#include <QtWidgets/QAction>
#endif
#include <QtWidgets/QAbstractButton>
#include <QtWidgets/QApplication>
#include <QtWidgets/QCheckBox>
#include <QtWidgets/QComboBox>
#include <QtWidgets/QLineEdit>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QTabWidget>
#include <QtWidgets/QWidget>

namespace QtUiProbeInternal {

static QWidget *target(const QJsonObject &params) { return findWidget(params.value("objectName").toString()); }
static bool requireWidget(QWidget *widget, const char *className, QString *error)
{
    if (!widget) { *error = QString::fromLatin1("Target widget was not found"); return false; }
    if (!widget->inherits(className)) { *error = QString::fromLatin1("Target does not support this semantic action"); return false; }
    return true;
}

bool executeAction(const QString &method, const QJsonObject &params, QJsonObject *result, QString *error)
{
    if (method == QLatin1String("activateWindow")) {
        QWidget *widget = target(params); if (!widget) { *error = "Target widget was not found"; return false; }
        widget->window()->activateWindow(); widget->window()->raise(); result->insert("activated", true); return true;
    }
    if (method == QLatin1String("resizeWindow")) {
        QWidget *widget = target(params); if (!widget) { *error = "Target widget was not found"; return false; }
        const int width = params.value("width").toInt(-1), height = params.value("height").toInt(-1);
        if (width < 1 || height < 1 || width > 8192 || height > 8192) { *error = "Invalid window size"; return false; }
        widget->window()->resize(width, height); result->insert("resized", true); return true;
    }
    if (method == QLatin1String("invokeButton")) {
        QWidget *widget = target(params); if (!requireWidget(widget, "QAbstractButton", error)) return false;
        static_cast<QAbstractButton *>(widget)->click(); result->insert("invoked", true); return true;
    }
    if (method == QLatin1String("triggerAction")) {
        const QString name = params.value("objectName").toString();
        QAction *action = qobject_cast<QAction *>(qApp->findChild<QAction *>(name));
        if (!action) { *error = "Target action was not found"; return false; }
        action->trigger(); result->insert("triggered", true); return true;
    }
    if (method == QLatin1String("selectTab")) {
        QWidget *widget = target(params); if (!requireWidget(widget, "QTabWidget", error)) return false;
        QTabWidget *tabs = static_cast<QTabWidget *>(widget); int index = params.value("index").toInt(-1);
        if (index < 0 && params.contains("text")) {
            const QString text = params.value("text").toString();
            for (int i = 0; i < tabs->count(); ++i) if (tabs->tabText(i) == text) { index = i; break; }
        }
        if (index < 0 || index >= tabs->count()) { *error = "Tab index was not found"; return false; }
        tabs->setCurrentIndex(index); result->insert("index", index); return true;
    }
    if (method == QLatin1String("selectComboItem")) {
        QWidget *widget = target(params); if (!requireWidget(widget, "QComboBox", error)) return false;
        QComboBox *combo = static_cast<QComboBox *>(widget); int index = params.value("index").toInt(-1);
        if (index < 0 && params.contains("text")) index = combo->findText(params.value("text").toString());
        if (index < 0 || index >= combo->count()) { *error = "Combo item was not found"; return false; }
        combo->setCurrentIndex(index); result->insert("index", index); return true;
    }
    if (method == QLatin1String("setLineEditText")) {
        QWidget *widget = target(params); if (!requireWidget(widget, "QLineEdit", error)) return false;
        static_cast<QLineEdit *>(widget)->setText(params.value("text").toString()); result->insert("set", true); return true;
    }
    if (method == QLatin1String("setCheckState")) {
        QWidget *widget = target(params); if (!requireWidget(widget, "QAbstractButton", error)) return false;
        QAbstractButton *button = static_cast<QAbstractButton *>(widget); if (!button->isCheckable()) { *error = "Target button is not checkable"; return false; }
        button->setChecked(params.value("checked").toBool()); result->insert("checked", button->isChecked()); return true;
    }
    if (method == QLatin1String("waitForWidget") || method == QLatin1String("waitForUi")) {
        const QString expected = method == QLatin1String("waitForWidget") ? params.value("objectName").toString() : params.value("objectName").toString();
        const int timeout = qBound(0, params.value("timeoutMs").toInt(3000), 30000);
        QElapsedTimer timer; timer.start();
        while (timer.elapsed() < timeout) { QWidget *widget = findWidget(expected); if (widget && widget->isVisible()) { result->insert("found", widgetSummary(widget)); return true; } qApp->processEvents(); QThread::msleep(20); }
        *error = "Timed out waiting for target widget"; return false;
    }
    *error = "Method is not allowed"; return false;
}

} // namespace QtUiProbeInternal
