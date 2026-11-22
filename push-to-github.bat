@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo.
echo === Navi: push this folder to GitHub (brtsmrg/navi) ===
echo.
where git >nul 2>nul
if errorlevel 1 goto :nogit
if not exist "package.json" goto :wrongfolder

rem Bring in the 7 files the cloud tool could not write (.github and .claude) from the zip
if exist ".github\workflows\ci.yml" if exist ".claude\settings.json" goto :havefiles
set "ZIP=%~dp0..\navi-repo.zip"
if not exist "%ZIP%" goto :nozip
set "TMPX=%TEMP%\navi-unzip"
if exist "%TMPX%" rmdir /s /q "%TMPX%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%TMPX%' -Force"
if errorlevel 1 goto :zipfail
xcopy "%TMPX%\navi\.github" ".github\" /E /I /Y >nul
xcopy "%TMPX%\navi\.claude" ".claude\" /E /I /Y >nul
if not exist ".github\workflows\ci.yml" goto :zipfail
:havefiles

if not exist ".git" (
  git init
  git symbolic-ref HEAD refs/heads/main
)
git config user.name >nul 2>nul || git config user.name "brtsmrg"
git config user.email >nul 2>nul || git config user.email "brtsmrg@users.noreply.github.com"
git add -A
(
echo Navi: first import
echo.
echo Co-Authored-By: Claude Sonnet 5.5 ^<noreply@anthropic.com^>
echo Claude-Session: https://claude.ai/code/session_01Deqsd9QidtoJLHHH6CWNy7
) > "%TEMP%\navi-commit.txt"
git commit -F "%TEMP%\navi-commit.txt"
git remote remove origin >nul 2>nul
git remote add origin https://github.com/brtsmrg/navi.git
git push -u origin main
if errorlevel 1 goto :pushfail
echo.
echo DONE. The code is on https://github.com/brtsmrg/navi
pause
exit /b 0

:nogit
echo Git is not installed. Install it from https://git-scm.com/download/win , then double-click this file again.
pause
exit /b 1
:wrongfolder
echo This file must stay inside the navi folder (package.json not found next to it).
pause
exit /b 1
:nozip
echo Could not find %~dp0..\navi-repo.zip . Keep navi-repo.zip next to the navi folder, then try again.
pause
exit /b 1
:zipfail
echo Could not unpack the .github and .claude files from navi-repo.zip. Tell Claude what is shown above.
pause
exit /b 1
:pushfail
echo.
echo Push did not finish. If a browser window or sign-in box opened, sign in to GitHub and approve it, then double-click this file again.
echo If it says the token lacks "workflow" permission, tell Claude and it will send the workflow files another way.
pause
exit /b 1
