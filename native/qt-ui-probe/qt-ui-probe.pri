QT += core gui widgets network
INCLUDEPATH += $$PWD/include $$PWD/src
HEADERS += $$PWD/include/QtUiProbe/QtUiProbe.h $$PWD/src/ProbeInternal.h
SOURCES += $$PWD/src/QtUiProbe.cpp $$PWD/src/ProbeServer.cpp $$PWD/src/ObjectInspector.cpp \
           $$PWD/src/WidgetCapture.cpp $$PWD/src/RouteRecorder.cpp $$PWD/src/SemanticExecutor.cpp
