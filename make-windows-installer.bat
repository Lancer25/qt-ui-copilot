@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-windows-installer.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Installer build failed with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
