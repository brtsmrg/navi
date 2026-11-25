@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0transcripts-log.txt"
echo ==== %DATE% %TIME% ==== > "%LOG%"
call :main
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (echo ALL DONE >> "%LOG%") else (echo STOPPED, code %RC% >> "%LOG%")
if "%RC%"=="0" (echo ALL DONE. The transcripts are in the research folder.) else (echo STOPPED. The reason is in transcripts-log.txt in this folder.)
timeout /t 15 >nul
endlocal
exit /b %RC%

:main
if not exist "venv\Scripts\python.exe" (
  echo The home voice Python folder venv is missing. Run install.bat first. >> "%LOG%"
  echo venv is missing. Run install.bat first.
  exit /b 10
)
set "VPY=%~dp0venv\Scripts\python.exe"
if not exist "research\transcripts" mkdir "research\transcripts"
rem yt-dlp goes into its own folder, so nothing in the working voice Python folder changes.
if not exist "research\libs\yt_dlp" (
  echo Installing yt-dlp into research\libs ... >> "%LOG%"
  "%VPY%" -m pip install --target "research\libs" yt-dlp >> "%LOG%" 2>&1
  if errorlevel 1 (echo yt-dlp install failed. >> "%LOG%" & exit /b 11)
)
set "PYTHONPATH=%~dp0research\libs"
set "GOT=0"
for %%V in (4gLApmCoDVs P1pwdfDHU9A 5EBrHxbNId4 UX6uK3lXIQI ZRhE0Ou1QtY xh1x4KENO2Q) do (
  echo Getting captions for %%V ... >> "%LOG%"
  echo Getting captions for %%V ...
  "%VPY%" -m yt_dlp --skip-download --write-auto-subs --write-subs --sub-langs "en.*" --sub-format vtt --no-playlist -o "research\transcripts\%%V.%%(ext)s" "https://www.youtube.com/watch?v=%%V" >> "%LOG%" 2>&1
  if errorlevel 1 (echo   could not get %%V >> "%LOG%") else (set /a GOT+=1)
)
echo Videos done: %GOT% of 6 >> "%LOG%"
"%VPY%" vtt2txt.py "research\transcripts" >> "%LOG%" 2>&1
if "%GOT%"=="0" (echo No captions could be downloaded. YouTube may be refusing the requests. >> "%LOG%" & exit /b 12)
exit /b 0
