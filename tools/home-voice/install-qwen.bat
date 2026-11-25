@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0qwen-log.txt"
echo ==== %DATE% %TIME% ==== > "%LOG%"
call :main
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (echo ALL DONE >> "%LOG%") else (echo STOPPED, code %RC% >> "%LOG%")
if "%RC%"=="0" (echo ALL DONE. Samples are in the samples folder.) else (echo STOPPED. The reason is in qwen-log.txt in this folder.)
timeout /t 15 >nul
endlocal
exit /b %RC%

:main
if not exist "qwen-sample.py" (echo qwen-sample.py is missing. >> "%LOG%" & echo qwen-sample.py is missing. & exit /b 10)
if not exist "server.py" (echo server.py is missing. >> "%LOG%" & echo server.py is missing. & exit /b 10)
set "PY="
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY (
  py -3.12 -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PY=py -3.12"
)
if not defined PY (
  py -3.11 -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PY=py -3.11"
)
if not defined PY (
  echo Python 3.11 or 3.12 was not found. >> "%LOG%"
  echo Python 3.11 or 3.12 was not found. Install it from python.org, then run this again.
  exit /b 11
)
echo Using Python: %PY% >> "%LOG%"
%PY% --version >> "%LOG%" 2>&1

for /f %%F in ('powershell -NoProfile -Command "[math]::Round((Get-PSDrive C).Free/1GB)"') do set "FREEGB=%%F"
echo Free space on C: %FREEGB% GB >> "%LOG%"
if defined FREEGB if %FREEGB% LSS 20 (
  echo Less than 20 GB free on C: this needs about 12 GB. >> "%LOG%"
  echo Not enough free space on C: ^(need about 12 GB^).
  exit /b 12
)

rem A separate private Python folder, so the working Chatterbox voice is never touched.
if not exist "venv-qwen\Scripts\python.exe" (
  echo Making the separate Python folder venv-qwen ... >> "%LOG%"
  %PY% -m venv venv-qwen >> "%LOG%" 2>&1
  if errorlevel 1 (echo Could not make venv-qwen. >> "%LOG%" & exit /b 13)
)
set "VPY=%~dp0venv-qwen\Scripts\python.exe"
"%VPY%" -m pip install --upgrade pip >> "%LOG%" 2>&1

if not exist "venv-qwen\torch.ok" (
  echo Installing PyTorch with CUDA ^(about 2.5 GB^) ... >> "%LOG%"
  echo Installing PyTorch ^(about 2.5 GB^) ... a few minutes.
  "%VPY%" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124 >> "%LOG%" 2>&1
  if errorlevel 1 (echo PyTorch install failed. >> "%LOG%" & exit /b 14)
  echo ok> "venv-qwen\torch.ok"
)

if not exist "venv-qwen\qwen.ok" (
  echo Installing Qwen3-TTS ^(Apache-2.0^) ... >> "%LOG%"
  echo Installing Qwen3-TTS ...
  "%VPY%" -m pip install -U qwen-tts soundfile scipy "numpy<2.3" >> "%LOG%" 2>&1
  if errorlevel 1 (echo qwen-tts install failed. >> "%LOG%" & exit /b 15)
  echo ok> "venv-qwen\qwen.ok"
)

"%VPY%" -c "import torch;print('torch',torch.__version__,'cuda',torch.cuda.is_available())" >> "%LOG%" 2>&1
"%VPY%" -c "import torch,sys;sys.exit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
if errorlevel 1 (
  echo CUDA is not visible. Putting the CUDA build of PyTorch back ... >> "%LOG%"
  "%VPY%" -m pip install --force-reinstall --no-deps torch torchaudio --index-url https://download.pytorch.org/whl/cu124 >> "%LOG%" 2>&1
  "%VPY%" -c "import torch,sys;print('cuda',torch.cuda.is_available());sys.exit(0 if torch.cuda.is_available() else 1)" >> "%LOG%" 2>&1
  if errorlevel 1 (echo PyTorch cannot see the graphics card. >> "%LOG%" & exit /b 16)
)
"%VPY%" -c "from qwen_tts import Qwen3TTSModel;print('qwen_tts import ok')" >> "%LOG%" 2>&1
if errorlevel 1 (echo qwen_tts could not be imported. >> "%LOG%" & exit /b 17)

echo Making the Qwen samples ^(first time downloads about 4.5 GB^) ...
echo Making the Qwen samples. The first time this downloads the model.
"%VPY%" qwen-sample.py >> "%LOG%" 2>&1
if errorlevel 1 (echo Sample making failed. >> "%LOG%" & exit /b 18)
exit /b 0
