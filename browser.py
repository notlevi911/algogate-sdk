import sys
from pathlib import Path
from typing import Optional

from PyQt6.QtCore import QUrl
from PyQt6.QtGui import QAction
from PyQt6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLineEdit,
    QMainWindow,
    QTabWidget,
    QToolBar,
    QVBoxLayout,
    QWidget,
)
from PyQt6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PyQt6.QtWebEngineWidgets import QWebEngineView


HOME_URL = "https://example.com"


def normalize_url(value: str) -> QUrl:
    text = (value or "").strip()

    if not text:
        return QUrl(HOME_URL)

    if "://" in text:
        return QUrl(text)

    if " " in text:
        query = text.replace(" ", "+")
        return QUrl(f"https://www.google.com/search?q={query}")

    return QUrl(f"https://{text}")


class BrowserPage(QWebEnginePage):
    def __init__(self, profile: QWebEngineProfile, browser: "BrowserWindow"):
        super().__init__(profile, browser)
        self.browser = browser

    def createWindow(self, _type):
        return self.browser.create_tab(make_active=True).page()


class BrowserTab(QWebEngineView):
    def __init__(self, profile: QWebEngineProfile, browser: "BrowserWindow"):
        super().__init__(browser)
        self.browser = browser
        self.setPage(BrowserPage(profile, browser))

        self.titleChanged.connect(self._on_title_changed)
        self.urlChanged.connect(self._on_url_changed)
        self.loadStarted.connect(self.browser.sync_current_tab)
        self.loadFinished.connect(self.browser.sync_current_tab)

    def _on_title_changed(self, title: str):
        index = self.browser.tabs.indexOf(self)
        if index >= 0:
            self.browser.tabs.setTabText(index, title or "New Tab")
        self.browser.sync_current_tab()

    def _on_url_changed(self, _url: QUrl):
        self.browser.sync_current_tab()


class BrowserWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Python Chromium Browser")
        self.resize(1440, 920)

        self.profile = QWebEngineProfile("main-profile", self)
        self.profile.setPersistentStoragePath(str(Path.cwd() / ".qtwebengine"))
        self.profile.setCachePath(str(Path.cwd() / ".qtwebengine" / "cache"))

        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)
        self.tabs.setTabsClosable(True)
        self.tabs.setMovable(True)
        self.tabs.currentChanged.connect(self.on_current_tab_changed)
        self.tabs.tabCloseRequested.connect(self.close_tab)

        self.address_bar = QLineEdit()
        self.address_bar.setPlaceholderText("Search or enter website name")
        self.address_bar.returnPressed.connect(self.navigate_current_tab)

        self.toolbar = QToolBar("Navigation")
        self.toolbar.setMovable(False)
        self.addToolBar(self.toolbar)

        self.back_action = QAction("Back", self)
        self.back_action.triggered.connect(self.go_back)
        self.toolbar.addAction(self.back_action)

        self.forward_action = QAction("Forward", self)
        self.forward_action.triggered.connect(self.go_forward)
        self.toolbar.addAction(self.forward_action)

        self.reload_action = QAction("Reload", self)
        self.reload_action.triggered.connect(self.reload_page)
        self.toolbar.addAction(self.reload_action)

        self.home_action = QAction("Home", self)
        self.home_action.triggered.connect(self.go_home)
        self.toolbar.addAction(self.home_action)

        self.new_tab_action = QAction("New Tab", self)
        self.new_tab_action.triggered.connect(lambda: self.create_tab(make_active=True))
        self.toolbar.addAction(self.new_tab_action)

        toolbar_container = QWidget()
        toolbar_layout = QHBoxLayout(toolbar_container)
        toolbar_layout.setContentsMargins(8, 4, 8, 4)
        toolbar_layout.addWidget(self.address_bar)
        self.toolbar.addWidget(toolbar_container)

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.tabs)
        self.setCentralWidget(container)

        self.create_tab(make_active=True, url=HOME_URL)

    def current_browser(self) -> Optional[BrowserTab]:
        widget = self.tabs.currentWidget()
        return widget if isinstance(widget, BrowserTab) else None

    def create_tab(self, make_active: bool, url: str = HOME_URL) -> BrowserTab:
        browser = BrowserTab(self.profile, self)
        browser.setUrl(normalize_url(url))

        index = self.tabs.addTab(browser, "New Tab")
        if make_active:
            self.tabs.setCurrentIndex(index)

        return browser

    def close_tab(self, index: int):
        if self.tabs.count() == 1:
            self.create_tab(make_active=True)

        widget = self.tabs.widget(index)
        self.tabs.removeTab(index)
        if widget is not None:
            widget.deleteLater()

        self.sync_current_tab()

    def on_current_tab_changed(self, _index: int):
        self.sync_current_tab()

    def sync_current_tab(self):
        browser = self.current_browser()
        if not browser:
            return

        self.address_bar.setText(browser.url().toString())
        self.back_action.setEnabled(browser.history().canGoBack())
        self.forward_action.setEnabled(browser.history().canGoForward())
        title = browser.title() or "Python Chromium Browser"
        self.setWindowTitle(f"{title} - Python Chromium Browser")

    def navigate_current_tab(self):
        browser = self.current_browser()
        if browser:
            browser.setUrl(normalize_url(self.address_bar.text()))

    def go_back(self):
        browser = self.current_browser()
        if browser:
            browser.back()

    def go_forward(self):
        browser = self.current_browser()
        if browser:
            browser.forward()

    def reload_page(self):
        browser = self.current_browser()
        if browser:
            browser.reload()

    def go_home(self):
        browser = self.current_browser()
        if browser:
            browser.setUrl(QUrl(HOME_URL))


def main():
    app = QApplication(sys.argv)
    window = BrowserWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
