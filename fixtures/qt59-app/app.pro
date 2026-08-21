QT += core gui widgets network
CONFIG += c++11
TEMPLATE = app
TARGET = qt-ui-copilot-qt59-fixture

SOURCES += src/main.cpp src/MainWindow.cpp
FORMS += ui/MainWindow.ui ui/NetworkSettings.ui
RESOURCES += resources/common.qrc
DEFINES += QT_UI_COPILOT_ENABLED

include(../../native/qt-ui-probe/qt-ui-probe.pri)
