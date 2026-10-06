@echo off
setlocal enabledelayedexpansion

rem ============================================================================
rem  StudyFlow admin console
rem  Opens the admin page. It will ask for a code as well as a login, because
rem  an admin account on its own does not open the console.
rem ============================================================================

title StudyFlow Admin

call "%~dp0_start-studyflow-server.bat" go
if errorlevel 1 pause
start "" "http://localhost:3000/admin.html"
exit /b 0