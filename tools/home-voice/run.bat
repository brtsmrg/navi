@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "venv\voice.ok" (
  echo Run install.bat first.
  timeout /t 10 >nul
  exit /b 1
)
echo Navi home voice. Keep this window open while you prepare roads in Navi. > "%~dp0run-log.txt"
"%~dp0venv\Scripts\python.exe" launch.py 2>> "%~dp0run-log.txt"
echo.
echo The home voice stopped. See run-log.txt if that was not expected.
timeout /t 20 >nul
endlocal
