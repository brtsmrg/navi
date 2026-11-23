@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0push-update-log.txt"
echo ==== %DATE% %TIME% ==== > "%LOG%"
where git >nul 2>&1
if errorlevel 1 (
  echo Git is not installed or not on PATH. >> "%LOG%"
  echo Git is not installed or not on PATH.
  goto :end
)
if not exist ".git" (
  echo This folder is not the Navi repo: %CD% >> "%LOG%"
  echo This folder is not the Navi repo: %CD%
  goto :end
)
git add -A >> "%LOG%" 2>&1
git diff --cached --quiet
if not errorlevel 1 (
  echo Nothing new to commit. Trying push anyway. >> "%LOG%"
  goto :push
)
> "%TEMP%\navi-update-msg.txt" echo Demo runs in real time and calls queue in order, so no step is skipped
>> "%TEMP%\navi-update-msg.txt" echo.
>> "%TEMP%\navi-update-msg.txt" echo Co-Authored-By: Claude Sonnet 5.5 ^<noreply@anthropic.com^>
>> "%TEMP%\navi-update-msg.txt" echo Claude-Session: https://claude.ai/code/session_01Deqsd9QidtoJLHHH6CWNy7
git -c user.name="brtsmrg" -c user.email="brtsmrg@users.noreply.github.com" commit -F "%TEMP%\navi-update-msg.txt" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo Commit failed. See push-update-log.txt >> "%LOG%"
  echo Commit failed. See push-update-log.txt
  goto :end
)
:push
git push origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  echo First push failed, trying to sync first. >> "%LOG%"
  git -c user.name="brtsmrg" -c user.email="brtsmrg@users.noreply.github.com" pull --rebase origin main >> "%LOG%" 2>&1
  git push origin main >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo Push failed. See push-update-log.txt >> "%LOG%"
    echo PUSH FAILED. Open push-update-log.txt in this folder.
    goto :end
  )
)
echo PUSH OK >> "%LOG%"
echo.
echo PUSH OK - Navi update is on GitHub. Pages redeploys in about 2 minutes.
:end
echo.
timeout /t 8 >nul
endlocal
