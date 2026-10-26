@echo off
setlocal
title AiHub Build
cd /d "%~dp0"

rem Keep batch builds independent from IDE/agent terminals.
set "ELECTRON_RUN_AS_NODE="

set "NO_PAUSE="
if /i "%~1"=="--no-pause" set "NO_PAUSE=1"

echo =========================================
echo  AiHub local Windows build
echo =========================================
echo  Project: %CD%
echo  Output:  release\
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  echo Install Node.js 20 or newer, then try again.
  echo https://nodejs.org/
  goto :failed
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [ERROR] Dependencies are not installed.
  echo Run this command first:
  echo     npm install
  goto :failed
)

echo [BUILD] npm run build:win
echo.
call npm run build:win
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Build failed with exit code %EXIT_CODE%.
  goto :failed
)

echo.
echo [OK] Build complete.
echo.
echo Artifacts in release\:
dir /b "release\*.exe" 2>nul
echo.

if not defined NO_PAUSE pause
endlocal & exit /b 0

:failed
echo.
if not defined NO_PAUSE pause
endlocal & exit /b 1
