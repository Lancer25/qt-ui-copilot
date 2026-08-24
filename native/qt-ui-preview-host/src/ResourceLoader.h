#pragma once

#include "PreviewRequest.h"

#include <QStringList>

class ResourceLoader {
public:
    ResourceLoader();
    ~ResourceLoader();
    bool load(const PreviewRequest &request, PreviewResult *result, QString *error);

    // Exposed for the native regression test so cache isolation remains
    // observable without having to execute two different Qt kits in one test
    // process.  The default is always the Qt major version used to build the
    // current PreviewHost.
    static QString resourceCacheKeyForTesting(const QString &qrcFile,
                                              const QString &rccExecutable,
                                              int qtMajor = 0);
private:
    QStringList registeredResources_;
};
