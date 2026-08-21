cmake_minimum_required(VERSION 3.16)
project(QtUiCopilotQt6Fixture LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTORCC ON)
enable_testing()

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets Network)
set(QT_MAJOR_VERSION 6)
add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../../native/qt-ui-probe ${CMAKE_BINARY_DIR}/qt-ui-probe)

add_executable(qt-ui-copilot-qt6-fixture
  ../qt59-app/src/main.cpp ../qt59-app/src/MainWindow.cpp
  ../qt59-app/ui/MainWindow.ui ../qt59-app/ui/NetworkSettings.ui ../qt59-app/resources/common.qrc)
target_include_directories(qt-ui-copilot-qt6-fixture PRIVATE ${CMAKE_CURRENT_LIST_DIR}/../qt59-app/src)
set_target_properties(qt-ui-copilot-qt6-fixture PROPERTIES
  AUTOUIC_SEARCH_PATHS "${CMAKE_CURRENT_LIST_DIR}/../qt59-app/ui")
target_link_libraries(qt-ui-copilot-qt6-fixture PRIVATE Qt6::Core Qt6::Gui Qt6::Widgets Qt6::Network QtUiProbe)
target_compile_definitions(qt-ui-copilot-qt6-fixture PRIVATE QT_UI_COPILOT_ENABLED)
