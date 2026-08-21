#include <QtUiProbe/QtUiProbe.h>
#include "ProbeInternal.h"

#include <QtCore/QUuid>
#include <QtWidgets/QApplication>

namespace {
QString g_serverName;
}

namespace QtUiProbe {

bool install(const InstallOptions &requested)
{
    if (!qApp) return false;
    if (!g_serverName.isEmpty()) return true;
    InstallOptions options = requested;
    if (options.sessionToken.isEmpty()) options.sessionToken = QUuid::createUuid().toString().remove(QLatin1Char('{')).remove(QLatin1Char('}'));
    if (options.serverName.isEmpty()) options.serverName = QString::fromLatin1("qt-ui-copilot-%1").arg(options.sessionToken);
    if (!QtUiProbeInternal::createServer(options.serverName, options.sessionToken, options.enableSemanticActions, options.recordTextEntry)) return false;
    QtUiProbeInternal::routeRecorder();
    g_serverName = options.serverName;
    return true;
}

void uninstall()
{
    QtUiProbeInternal::destroyServer();
    g_serverName.clear();
}

QString serverName() { return g_serverName; }

} // namespace QtUiProbe
