@echo off
setlocal enabledelayedexpansion

rem ============================================================================
rem  Sage Dev portfolio launcher
rem  Opens the portfolio in your browser.
rem
rem This is a plain static site, so there is no server to start. It opens
rem  straight from disk and works offline.
rem ============================================================================

rem The portfolio lives in the "main portifolio" folder next to this one.
set "PAGE=%~dp0..\main portifolio\index.html"

title Sage Dev - Portfolio

if not exist "%PAGE%" (
  echo.
  echo   Could not find:
  echo     %PAGE%
  echo.
  pause
  exit /b 1
)

echo   Opening the Sage Dev portfolio...
start "" "%PAGE%"
exit /b 0