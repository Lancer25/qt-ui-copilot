#include <QtCore/QFile>
#include <QtCore/QProcessEnvironment>
#include <QtWidgets/QApplication>
#include <QtWidgets/QMainWindow>
#include <QtUiProbe/QtUiProbe.h>

QMainWindow *createMainWindow();

int main(int argc, char *argv[])
{
    QApplication application(argc, argv);
    QFile styleSheet(QLatin1String(":/styles/dark.qss"));
    if (styleSheet.open(QIODevice::ReadOnly | QIODevice::Text)) application.setStyleSheet(QString::fromUtf8(styleSheet.readAll()));

#ifdef QT_UI_COPILOT_ENABLED
    QtUiProbe::InstallOptions options;
    options.sessionToken = qgetenv("QT_UI_COPILOT_TOKEN");
    options.serverName = qgetenv("QT_UI_COPILOT_SERVER_NAME");
    options.enableSemanticActions = qgetenv("QT_UI_COPILOT_ENABLE_ACTIONS") == "1";
    QtUiProbe::install(options);
#endif

    QMainWindow *window = createMainWindow();
    window->show();
    const int result = application.exec();
    delete window;
    return result;
}
