#include "ProbeInternal.h"

#include <QtCore/QBuffer>
#include <QtCore/QByteArray>
#include <QtGui/QPixmap>
#include <QtWidgets/QWidget>

namespace QtUiProbeInternal {

QJsonObject capture(QWidget *widget)
{
    QJsonObject result;
    if (!widget) { result.insert("error", "Widget not found"); return result; }
    const QSize size = widget->size();
    if (size.width() <= 0 || size.height() <= 0 || size.width() > 8192 || size.height() > 8192) {
        result.insert("error", "Screenshot dimensions must be between 1 and 8192 pixels"); return result;
    }
    const QPixmap pixmap = widget->grab();
    QBuffer buffer;
    buffer.open(QIODevice::WriteOnly);
    if (!pixmap.save(&buffer, "PNG")) { result.insert("error", "Unable to encode PNG"); return result; }
    result.insert("pngBase64", QString::fromLatin1(buffer.data().toBase64()));
    result.insert("width", pixmap.width()); result.insert("height", pixmap.height());
    return result;
}

} // namespace QtUiProbeInternal
