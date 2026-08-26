/** Concrete Qt Widgets classes that can safely appear as Designer widgets.
 * Abstract bases, item classes, models, actions and optional QML/OpenGL
 * widgets are intentionally excluded. The list follows the Qt 5 Widgets
 * module and main-window class groupings. */
export const QT_WIDGET_CLASSES = new Set([
  'QWidget', 'QDialog', 'QMainWindow', 'QFrame', 'QGroupBox', 'QLabel', 'QLineEdit', 'QTextEdit', 'QPlainTextEdit', 'QTextBrowser',
  'QPushButton', 'QToolButton', 'QCommandLinkButton', 'QCheckBox', 'QRadioButton', 'QComboBox', 'QFontComboBox', 'QKeySequenceEdit',
  'QSpinBox', 'QDoubleSpinBox', 'QDateEdit', 'QTimeEdit', 'QDateTimeEdit', 'QDial', 'QSlider', 'QScrollBar', 'QProgressBar', 'QLCDNumber', 'QCalendarWidget',
  'QDialogButtonBox', 'QTabBar', 'QTabWidget', 'QToolBox', 'QStackedWidget', 'QScrollArea', 'QSplitter', 'QSizeGrip',
  'QListWidget', 'QListView', 'QTableWidget', 'QTableView', 'QTreeWidget', 'QTreeView', 'QHeaderView', 'QGraphicsView',
  'QStatusBar', 'QMenuBar', 'QToolBar', 'QDockWidget', 'QMdiArea', 'QMdiSubWindow', 'QWizard', 'QWizardPage',
  'QColorDialog', 'QFileDialog', 'QFontDialog', 'QInputDialog', 'QMessageBox', 'QProgressDialog',
]);

export function isQtWidgetClass(className: string): boolean { return QT_WIDGET_CLASSES.has(className); }
