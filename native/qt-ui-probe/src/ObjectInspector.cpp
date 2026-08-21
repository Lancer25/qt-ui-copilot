#include "ProbeInternal.h"

#include <QtCore/QMetaObject>
#include <QtCore/QJsonArray>
#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QLayout>
#include <QtWidgets/QWidget>

namespace QtUiProbeInternal {

QString objectPath(QObject *object)
{
    QStringList parts;
    for (QObject *current = object; current; current = current->parent()) {
        const QString name = current->objectName();
        parts.prepend(name.isEmpty() ? QString::fromLatin1(current->metaObject()->className()) : name);
    }
    return parts.join(QLatin1Char('/'));
}

QJsonObject widgetSummary(QWidget *widget)
{
    QJsonObject object;
    if (!widget) return object;
    const QRect geometry = widget->geometry();
    object.insert("objectName", widget->objectName());
    object.insert("className", QString::fromLatin1(widget->metaObject()->className()));
    object.insert("objectPath", objectPath(widget));
    object.insert("visible", widget->isVisible());
    object.insert("enabled", widget->isEnabled());
    object.insert("windowTitle", widget->windowTitle());
    object.insert("text", widget->property("text").toString());
    QJsonObject rect;
    rect.insert("x", geometry.x()); rect.insert("y", geometry.y());
    rect.insert("width", geometry.width()); rect.insert("height", geometry.height());
    object.insert("geometry", rect);
    if (widget->layout()) object.insert("layoutClass", QString::fromLatin1(widget->layout()->metaObject()->className()));
    return object;
}

static QJsonObject dumpNode(QWidget *widget, int remaining)
{
    QJsonObject object = widgetSummary(widget);
    QJsonArray children;
    if (remaining > 0) {
        const QObjectList objects = widget->children();
        for (int i = 0; i < objects.size(); ++i) {
            QWidget *child = qobject_cast<QWidget *>(objects.at(i));
            if (child) children.append(dumpNode(child, remaining - 1));
        }
    }
    object.insert("children", children);
    return object;
}

QJsonObject dumpWidgetTree(QWidget *widget, int maxDepth) { return dumpNode(widget, qBound(0, maxDepth, 64)); }

QWidget *findWidget(const QString &objectName)
{
    const QWidgetList all = QApplication::allWidgets();
    for (int i = 0; i < all.size(); ++i)
        if (all.at(i)->objectName() == objectName) return all.at(i);
    return 0;
}

QWidget *findWindow(const QString &name)
{
    const QWidgetList windows = QApplication::topLevelWidgets();
    for (int i = 0; i < windows.size(); ++i) {
        QWidget *window = windows.at(i);
        if (window->objectName() == name || window->windowTitle() == name) return window;
    }
    return 0;
}

QWidget *widgetAt(const QPoint &point) { return QApplication::widgetAt(point); }

QJsonObject identifyVisibleUi()
{
    QJsonArray windows;
    const QWidgetList top = QApplication::topLevelWidgets();
    for (int i = 0; i < top.size(); ++i) if (top.at(i)->isVisible()) windows.append(widgetSummary(top.at(i)));
    QJsonObject result; result.insert("windows", windows); return result;
}

} // namespace QtUiProbeInternal
