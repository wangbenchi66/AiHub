@echo off
setlocal
title AiHub Dev
cd /d "%~dp0"

rem Avoid inheriting ELECTRON_RUN_AS_NODE from IDE/agent terminals.
set "ELECTRON_RUN_AS_NODE="

rem Use a project-local profile so Electron can always create its singleton lock
rem and GPU cache, even when the project lives under a restricted folder.
if not defined AIHUB_USER_DATA set "AIHUB_USER_DATA=%~dp0.electron-data"

rem This machine/agent environment requires software rendering and no sandbox
rem for Electron's renderer; these only affect `npm run dev`, not the installer.
set "NO_SANDBOX=1"
set "ELECTRON_CLI_ARGS=["--disable-gpu"]"

where npm >nul 2>nul
if errorlevel 1 (
  echo [AiHub] npm was not found.
  echo Install Node.js 20 or newer, then double-click this file again.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [AiHub] Dependencies are not installed.
  echo.
  echo Run this command in the project folder first:
  echo     npm install
  echo.
  pause
  exit /b 1
)

echo [AiHub] Starting AiHub with: npm run dev
echo.
call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [AiHub] npm run dev exited with code %EXIT_CODE%.
  pause
)

endlocal & exit /b %EXIT_CODE%
