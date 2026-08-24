cmake_minimum_required(VERSION 3.10)
project(QtUiPreviewHost LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)

set(QT_MAJOR_VERSION "" CACHE STRING "Qt major version: 5 or 6")
if(QT_MAJOR_VERSION STREQUAL "5")
  find_package(Qt5 5.9.6 REQUIRED COMPONENTS Core Gui Widgets UiTools Test)
  set(QT_PACKAGE Qt5)
elseif(QT_MAJOR_VERSION STREQUAL "6")
  find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets UiTools Test)
  set(QT_PACKAGE Qt6)
else()
  message(FATAL_ERROR "Set -DQT_MAJOR_VERSION=5 or -DQT_MAJOR_VERSION=6. A PreviewHost is built per target Qt Kit.")
endif()

add_library(qt-ui-preview-host-core
  src/PreviewRequest.cpp
  src/ResourceLoader.cpp
  src/FormLoader.cpp
)
target_include_directories(qt-ui-preview-host-core PUBLIC src)
target_link_libraries(qt-ui-preview-host-core PUBLIC
  ${QT_PACKAGE}::Core ${QT_PACKAGE}::Gui ${QT_PACKAGE}::Widgets ${QT_PACKAGE}::UiTools)

add_executable(qt-ui-preview-host src/main.cpp)
target_link_libraries(qt-ui-preview-host PRIVATE qt-ui-preview-host-core)

if(QT_MAJOR_VERSION STREQUAL "5")
  set(QT_QMAKE_PATH "${Qt5Core_QMAKE_EXECUTABLE}")
else()
  set(QT_QMAKE_PATH "${Qt6Core_QMAKE_EXECUTABLE}")
endif()
if(NOT QT_QMAKE_PATH)
  get_target_property(QT_QMAKE_PATH ${QT_PACKAGE}::qmake IMPORTED_LOCATION)
endif()
if(NOT QT_QMAKE_PATH)
  get_target_property(QT_QMAKE_PATH ${QT_PACKAGE}::qmake IMPORTED_LOCATION_RELEASE)
endif()
if(NOT QT_QMAKE_PATH OR QT_QMAKE_PATH STREQUAL "QT_QMAKE_PATH-NOTFOUND"
   OR QT_QMAKE_PATH MATCHES "::" OR NOT EXISTS "${QT_QMAKE_PATH}")
  # Some Qt 5.9.6 package files do not expose qmake as an imported target.
  # Derive the Kit root from the selected Qt package directory instead of
  # silently producing /rcc.exe when CMAKE_PREFIX_PATH is not retained as a
  # normal variable by an older Qt package config.
  set(QT_CORE_PACKAGE_DIR "${${QT_PACKAGE}Core_DIR}")
  get_filename_component(QT_KIT_ROOT "${QT_CORE_PACKAGE_DIR}/../../.." ABSOLUTE)
  set(QT_QMAKE_PATH "${QT_KIT_ROOT}/bin/qmake${CMAKE_EXECUTABLE_SUFFIX}")
endif()
if(NOT QT_QMAKE_PATH)
  message(FATAL_ERROR "The selected Qt Kit did not expose qmake; unable to locate its exact rcc executable")
endif()
get_filename_component(QT_BIN_DIR "${QT_QMAKE_PATH}" DIRECTORY)
set(PREVIEW_TEST_RCC_PATH "${QT_BIN_DIR}/rcc${CMAKE_EXECUTABLE_SUFFIX}")

enable_testing()
add_executable(tst_previewhost tests/tst_previewhost.cpp)
target_compile_definitions(tst_previewhost PRIVATE
  PREVIEW_TEST_RCC_PATH="${PREVIEW_TEST_RCC_PATH}")
target_link_libraries(tst_previewhost PRIVATE qt-ui-preview-host-core ${QT_PACKAGE}::Test)
add_test(NAME tst_previewhost COMMAND tst_previewhost)

# CTest starts tst_previewhost as a separate process.  On Windows the test
# executable needs the *same* Kit's Qt DLLs (not whichever Qt happens to be
# on the developer's PATH).  Keep the semicolons in PATH escaped: CMake uses
# semicolons as its list separator, while CTest must receive one PATH value.
if(WIN32)
  set(PREVIEW_TEST_PATH "${QT_BIN_DIR};$ENV{PATH}")
  string(REPLACE ";" "\\;" PREVIEW_TEST_PATH "${PREVIEW_TEST_PATH}")
  set_tests_properties(tst_previewhost PROPERTIES
    ENVIRONMENT "PATH=${PREVIEW_TEST_PATH}")
endif()
