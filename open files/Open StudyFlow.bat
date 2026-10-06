@echo off
setlocal enabledelayedexpansion

rem ============================================================================
rem  StudyFlow
rem  Double-click this file to open the StudyFlow showcase, which is the front
rem  page for the project.
rem
rem  The showcase and the app are served by the same server, so this starts
rem  that server first if it is not already running.
rem ============================================================================

title StudyFlow

call "%~dp0_start-studyflow-server.bat" go
if errorlevel 1 pause
start "" "http://localhost:3000/showcase"
exit /b 0