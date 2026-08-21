#include "ui_MainWindow.h"
#include "ui_NetworkSettings.h"

#include <QtWidgets/QDialog>
#include <QtWidgets/QMainWindow>

class FixtureMainWindow : public QMainWindow {
public:
    FixtureMainWindow() {
        m_ui.setupUi(this);
        connect(m_ui.settingsButton, &QPushButton::clicked, this, [this]() {
            m_ui.settingsStack->setCurrentWidget(m_ui.settingsLandingPage);
        });
        connect(m_ui.networkButton, &QPushButton::clicked, this, [this]() { openNetworkSettings(); });
    }
private:
    void openNetworkSettings() {
        QDialog *dialog = new QDialog(this);
        Ui::NetworkSettings networkUi;
        networkUi.setupUi(dialog);
        dialog->setAttribute(Qt::WA_DeleteOnClose);
        dialog->show();
    }
    Ui::MainWindow m_ui;
};

QMainWindow *createMainWindow() { return new FixtureMainWindow; }
