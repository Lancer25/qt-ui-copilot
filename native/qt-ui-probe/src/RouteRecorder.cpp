#include "ProbeInternal.h"

#include <QtCore/QEvent>
#include <QtCore/QJsonArray>
#include <QtGui/QMouseEvent>
#include <QtWidgets/QApplication>
#include <QtWidgets/QWidget>

namespace QtUiProbeInternal {

class RouteRecorderImpl : public QObject {
public:
    RouteRecorderImpl(bool allowText) : m_allowText(allowText) { qApp->installEventFilter(this); }
    ~RouteRecorderImpl() { if (qApp) qApp->removeEventFilter(this); }
    QVector<RecordedStep> steps() const { return m_steps; }
protected:
    bool eventFilter(QObject *watched, QEvent *event) {
        // Observation only: never consume an event belonging to the application.
        if (event->type() == QEvent::MouseButtonRelease) {
            QWidget *widget = qobject_cast<QWidget *>(watched);
            if (widget) {
                RecordedStep step; step.action = "invoke"; step.objectPath = objectPath(widget);
                step.value.insert("objectName", widget->objectName()); m_steps.append(step);
            }
        } else if (event->type() == QEvent::Show) {
            QWidget *widget = qobject_cast<QWidget *>(watched);
            if (widget && widget->isWindow()) {
                RecordedStep step; step.action = "windowShown"; step.objectPath = objectPath(widget);
                step.value.insert("objectName", widget->objectName()); m_steps.append(step);
            }
        }
        Q_UNUSED(m_allowText);
        return false;
    }
private:
    bool m_allowText;
    QVector<RecordedStep> m_steps;
};

class RouteRecorder {};
static RouteRecorderImpl *g_recorder = 0;

RouteRecorder *routeRecorder()
{
    if (!g_recorder) g_recorder = new RouteRecorderImpl(false);
    return reinterpret_cast<RouteRecorder *>(g_recorder);
}

} // namespace QtUiProbeInternal
