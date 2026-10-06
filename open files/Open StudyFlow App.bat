@echo off
setlocal enabledelayedexpansion

rem ============================================================================
rem  StudyFlow app
rem  Opens the actual study planner. If you are not signed in yet it takes you
rem  to the login page, which is correct.
rem ============================================================================

title StudyFlow App

call "%~dp0_start-studyflow-server.bat" go
if errorlevel 1 pause
start "" "http://localhost:3000/index.html"
exit /b 0