cmake_minimum_required(VERSION 3.10)
project(QtUiCopilotQt59Fixture LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTORCC ON)
enable_testing()

find_package(Qt5 5.9 REQUIRED COMPONENTS Core Gui Widgets Network)
add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../../native/qt-ui-probe ${CMAKE_BINARY_DIR}/qt-ui-probe)

add_executable(qt-ui-copilot-qt59-fixture
  src/main.cpp src/MainWindow.cpp ui/MainWindow.ui ui/NetworkSettings.ui resources/common.qrc)
target_link_libraries(qt-ui-copilot-qt59-fixture PRIVATE Qt5::Core Qt5::Gui Qt5::Widgets Qt5::Network QtUiProbe)
target_compile_definitions(qt-ui-copilot-qt59-fixture PRIVATE QT_UI_COPILOT_ENABLED)
