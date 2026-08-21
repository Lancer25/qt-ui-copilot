cmake_minimum_required(VERSION 3.10)
project(QtUiProbe LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)

if(NOT DEFINED QT_MAJOR_VERSION)
  set(QT_MAJOR_VERSION 5)
endif()
find_package(Qt${QT_MAJOR_VERSION} REQUIRED COMPONENTS Core Gui Widgets Network Test)

set(QT_UI_PROBE_SOURCES
  src/QtUiProbe.cpp src/ProbeServer.cpp src/ObjectInspector.cpp src/WidgetCapture.cpp
  src/RouteRecorder.cpp src/SemanticExecutor.cpp)
add_library(QtUiProbe STATIC ${QT_UI_PROBE_SOURCES})
target_include_directories(QtUiProbe PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(QtUiProbe PUBLIC Qt${QT_MAJOR_VERSION}::Core Qt${QT_MAJOR_VERSION}::Gui Qt${QT_MAJOR_VERSION}::Widgets Qt${QT_MAJOR_VERSION}::Network)

enable_testing()
add_executable(tst_qtuiprobe tests/tst_qtuiprobe.cpp tests/TestClient.cpp)
target_include_directories(tst_qtuiprobe PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include ${CMAKE_CURRENT_SOURCE_DIR}/src ${CMAKE_CURRENT_SOURCE_DIR}/tests)
target_link_libraries(tst_qtuiprobe PRIVATE QtUiProbe Qt${QT_MAJOR_VERSION}::Test)
add_test(NAME qtuiprobe COMMAND tst_qtuiprobe)
