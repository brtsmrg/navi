@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0make-samples-log.txt"
echo ==== %DATE% %TIME% ==== > "%LOG%"
if not exist "venv\voice.ok" (
  echo The home voice is not installed here. Run install.bat first. >> "%LOG%"
  echo The home voice is not installed here. Run install.bat first.
  goto :end
)
if not exist "venv\Scripts\python.exe" (
  echo venv\Scripts\python.exe is missing. Run install.bat again. >> "%LOG%"
  echo venv\Scripts\python.exe is missing. Run install.bat again.
  goto :end
)
if not exist "server.py" (
  echo server.py is missing. >> "%LOG%"
  goto :end
)
echo Making the listening samples. This takes a few minutes. Do not close this window.
"%~dp0venv\Scripts\python.exe" make-sample.py >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FAILED. Open make-samples-log.txt in this folder. >> "%LOG%"
  echo FAILED. Open make-samples-log.txt in this folder.
  goto :end
)
echo DONE >> "%LOG%"
echo DONE. Samples are in the samples folder.
:end
echo.
timeout /t 10 >nul
endlocal
