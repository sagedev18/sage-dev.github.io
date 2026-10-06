@echo off
setlocal enabledelayedexpansion

rem ============================================================================
rem  Shared helper. NOT meant to be clicked on its own.
rem
rem  Makes sure the StudyFlow server is answering on port 3000, starting it in
rem  a minimised window if it is not. The StudyFlow launchers call this first,
rem  then open their own page.
rem
rem  Returns 0 when the server is up, 1 when it could not be started.
rem ============================================================================

if "%~1"=="" (
  echo This file is a helper. Use one of the "Open ....bat" launchers instead.
  pause
  exit /b 1
)

set "APP_DIR=%~dp0..\study-app"
set "APP_URL=http://localhost:3000"
set "NODE=C:\Program Files\nodejs\node.exe"

if not exist "%APP_DIR%\server\server.js" (
  echo.
  echo   StudyFlow was not found in this folder:
  echo     %APP_DIR%
  echo.
  echo   Open the "Open StudyFlow.bat" file in Notepad and change the APP_DIR
  echo   line to point at the right folder.
  echo.
  exit /b 1
)

if not exist "%NODE%" (
  echo.
  echo   Node.js was not found at:
  echo     %NODE%
  echo.
  echo   Install Node.js 22.5 or newer from https://nodejs.org, then try again.
  echo.
  exit /b 1
)

rem --- Already running? Then leave it alone. --------------------------------

call :checkhealth
if not errorlevel 1 exit /b 0

rem --- Not running, so start it --------------------------------------------
echo   Starting StudyFlow, this takes a second...

rem dotenv reads .env from the working directory, so change into the app folder
rem before starting the server or it silently loses JWT_SECRET.
cd /d "%APP_DIR%"
start "StudyFlow server" /min "%NODE%" "%APP_DIR%\server\server.js"

set /a tries=0
:waitloop
call :checkhealth
if not errorlevel 1 exit /b 0

set /a tries+=1
if !tries! geq 30 (
  echo.
  echo   StudyFlow did not start within 30 seconds.
  echo.
  echo   Look for the "StudyFlow server" window in your taskbar and click it to
  echo   see the error. Common causes:
  echo     - port 3000 is already used by another program
  echo     - data\studyflow.db is locked by another copy of the server
  echo.
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto waitloop

rem ============================================================================
rem  checkhealth
rem  Exits 0 when the server replies, 1 when it does not.
rem ============================================================================

:checkhealth
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%APP_URL%/api/health' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
exit /b