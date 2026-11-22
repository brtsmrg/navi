@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-log.txt"
echo === Navi push %DATE% %TIME% === > "%LOG%"
echo.
echo === Navi: push this folder to GitHub (brtsmrg/navi) ===
echo A log is written to %LOG%
echo.
where git >nul 2>nul
if errorlevel 1 goto :nogit
if not exist "package.json" goto :wrongfolder

rem 1. Bring in the files the cloud tool could not write (.github and .claude) from the zip
if exist ".github\workflows\ci.yml" if exist ".claude\settings.json" goto :havefiles
set "ZIP=%~dp0..\navi-repo.zip"
if not exist "%ZIP%" goto :nozip
set "TMPX=%TEMP%\navi-unzip"
if exist "%TMPX%" rmdir /s /q "%TMPX%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%TMPX%' -Force" >> "%LOG%" 2>&1
if errorlevel 1 goto :zipfail
xcopy "%TMPX%\navi\.github" ".github\" /E /I /Y >nul
xcopy "%TMPX%\navi\.claude" ".claude\" /E /I /Y >nul
if not exist ".github\workflows\ci.yml" goto :zipfail
:havefiles

rem 2. Local git repo and commit (safe to repeat; "nothing to commit" is fine)
if not exist ".git" (
  git init >> "%LOG%" 2>&1
  git symbolic-ref HEAD refs/heads/main >> "%LOG%" 2>&1
)
git config user.name >nul 2>nul || git config user.name "brtsmrg"
git config user.email >nul 2>nul || git config user.email "brtsmrg@users.noreply.github.com"
if not exist ".git\info" mkdir ".git\info"
findstr /x /c:"push-log.txt" ".git\info\exclude" >nul 2>nul || echo push-log.txt>> ".git\info\exclude"
git add -A >> "%LOG%" 2>&1
(
echo Navi: first import
echo.
echo Co-Authored-By: Claude Sonnet 5.5 ^<noreply@anthropic.com^>
echo Claude-Session: https://claude.ai/code/session_01Deqsd9QidtoJLHHH6CWNy7
) > "%TEMP%\navi-commit.txt"
git commit -F "%TEMP%\navi-commit.txt" >> "%LOG%" 2>&1
git branch -M main >> "%LOG%" 2>&1
git remote remove origin >nul 2>nul
git remote add origin https://github.com/brtsmrg/navi.git

rem 3. Sign-in: forget any old or broken saved GitHub login so Git asks for a fresh browser sign-in
echo Git version and sign-in helper: >> "%LOG%"
git --version >> "%LOG%" 2>&1
git credential-manager --version >> "%LOG%" 2>&1
git config --show-origin --get-all credential.helper >> "%LOG%" 2>&1
(echo protocol=https& echo host=github.com& echo.) | git credential reject >> "%LOG%" 2>&1
cmdkey /delete:git:https://github.com >> "%LOG%" 2>&1
cmdkey /delete:LegacyGeneric:target=git:https://github.com >> "%LOG%" 2>&1
git config --local credential.helper manager >> "%LOG%" 2>&1
git config --local credential.https://github.com.provider github >> "%LOG%" 2>&1

echo.
echo Pushing now. A browser window will open: sign in to GitHub and click Authorize.
echo.
git push -u origin main >> "%LOG%" 2>&1
if errorlevel 1 goto :pushfail
echo Push finished OK >> "%LOG%"
echo.
echo DONE. The code is on https://github.com/brtsmrg/navi
pause
exit /b 0

:nogit
echo Git is not installed. Install it from https://git-scm.com/download/win , then double-click this file again.
echo Git is not installed >> "%LOG%"
pause
exit /b 1
:wrongfolder
echo This file must stay inside the navi folder (package.json not found next to it).
echo Wrong folder >> "%LOG%"
pause
exit /b 1
:nozip
echo Could not find %~dp0..\navi-repo.zip . Keep navi-repo.zip next to the navi folder, then try again.
echo Zip missing >> "%LOG%"
pause
exit /b 1
:zipfail
echo Could not unpack the .github and .claude files from navi-repo.zip. Tell Claude.
echo Zip unpack failed >> "%LOG%"
pause
exit /b 1
:pushfail
echo.
echo Push did not finish. Claude can read the log: %LOG%
echo Push FAILED >> "%LOG%"
pause
exit /b 1
