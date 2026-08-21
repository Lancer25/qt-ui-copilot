#ifndef QT_UI_PROBE_QT_UI_PROBE_H
#define QT_UI_PROBE_QT_UI_PROBE_H

#include <QtCore/QString>

class QApplication;

namespace QtUiProbe {

/** Options deliberately expose no arbitrary-object or arbitrary-slot access. */
struct InstallOptions {
    QString sessionToken;
    QString serverName;
    bool enableSemanticActions;
    bool recordTextEntry;
    InstallOptions() : enableSemanticActions(false), recordTextEntry(false) {}
};

/**
 * Installs the development-only local probe.  It must be called after a
 * QApplication has been created.  Returns false for invalid options or if a
 * server cannot be bound. Calling it more than once is harmless.
 */
bool install(const InstallOptions &options = InstallOptions());
void uninstall();
QString serverName();

} // namespace QtUiProbe

#endif
