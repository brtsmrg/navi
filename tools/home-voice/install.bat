@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0install-log.txt"
echo ==== %DATE% %TIME% ==== > "%LOG%"
call :main
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (echo ALL DONE >> "%LOG%") else (echo STOPPED, code %RC% >> "%LOG%")
if "%RC%"=="0" (echo ALL DONE. Close this window.) else (echo STOPPED. The reason is in install-log.txt in this folder.)
timeout /t 15 >nul
endlocal
exit /b %RC%

:main
set "PY="
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY (
  py -3.11 -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PY=py -3.11"
)
if not defined PY (
  echo Python 3.11 was not found. >> "%LOG%"
  echo Python 3.11 was not found. Install it from python.org, then run this again.
  exit /b 11
)
echo Using Python: %PY% >> "%LOG%"
%PY% --version >> "%LOG%" 2>&1

for /f %%F in ('powershell -NoProfile -Command "[math]::Round((Get-PSDrive C).Free/1GB)"') do set "FREEGB=%%F"
echo Free space on C: %FREEGB% GB >> "%LOG%"
if defined FREEGB if %FREEGB% LSS 15 (
  echo Less than 15 GB free on C: this needs about 12 GB. >> "%LOG%"
  echo Not enough free space on C: ^(need about 12 GB^).
  exit /b 12
)

where nvidia-smi >nul 2>&1
if errorlevel 1 (echo nvidia-smi not found: no NVIDIA driver? >> "%LOG%") else (nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv >> "%LOG%" 2>&1)

if not exist "venv\Scripts\python.exe" (
  echo Making the private Python folder ... >> "%LOG%"
  %PY% -m venv venv >> "%LOG%" 2>&1
  if errorlevel 1 (echo Could not make the venv. >> "%LOG%" & exit /b 13)
)
set "VPY=%~dp0venv\Scripts\python.exe"
"%VPY%" -m pip install --upgrade pip >> "%LOG%" 2>&1

if not exist "venv\torch.ok" (
  echo Installing PyTorch with CUDA ^(about 2.5 GB, a few minutes^) ... >> "%LOG%"
  echo Installing PyTorch ^(about 2.5 GB^) ... this takes a few minutes.
  "%VPY%" -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124 >> "%LOG%" 2>&1
  if errorlevel 1 (echo PyTorch install failed. >> "%LOG%" & exit /b 14)
  echo ok> "venv\torch.ok"
)

if not exist "venv\voice.ok" (
  echo Installing the voice model code ... >> "%LOG%"
  echo Installing the voice parts ...
  "%VPY%" -m pip install -r requirements-extra.txt >> "%LOG%" 2>&1
  if errorlevel 1 (echo Extra packages failed. >> "%LOG%" & exit /b 15)
  "%VPY%" -m pip install --no-deps chatterbox-tts==0.1.7 >> "%LOG%" 2>&1
  if errorlevel 1 (echo chatterbox-tts failed. >> "%LOG%" & exit /b 16)
  echo ok> "venv\voice.ok"
)

"%VPY%" -c "import torch;print('torch',torch.__version__,'cuda',torch.cuda.is_available())" >> "%LOG%" 2>&1
"%VPY%" -c "from chatterbox.tts import ChatterboxTTS;print('chatterbox import ok')" >> "%LOG%" 2>&1
if errorlevel 1 (echo chatterbox could not be imported. >> "%LOG%" & exit /b 17)

echo Making listening samples with the real voice ^(first time downloads about 3 GB^) ...
echo Making listening samples ... first time downloads the voice model.
"%VPY%" make-sample.py >> "%LOG%" 2>&1
if errorlevel 1 (echo Sample making failed. >> "%LOG%" & exit /b 18)
exit /b 0
