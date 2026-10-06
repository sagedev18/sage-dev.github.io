@echo off
setlocal enabledelayedexpansion

rem ============================================================================
rem  School website launcher
rem  Opens the school website in your browser.
rem
rem This is a plain static site, so there is no server to start. It opens
rem  straight from disk and works offline.
rem ============================================================================

rem The school website lives in the "school-website" folder next to this one.
set "PAGE=%~dp0..\school-website\index.html"

title School Website

if not exist "%PAGE%" (
  echo.
  echo   Could not find:
  echo     %PAGE%
  echo.
  pause
  exit /b 1
)

echo   Opening the school website...
start "" "%PAGE%"
exit /b 0