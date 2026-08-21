#pragma once

#include "PreviewRequest.h"

#include <QStringList>

class ResourceLoader {
public:
    ResourceLoader();
    ~ResourceLoader();
    bool load(const PreviewRequest &request, PreviewResult *result, QString *error);
private:
    QStringList registeredResources_;
};
