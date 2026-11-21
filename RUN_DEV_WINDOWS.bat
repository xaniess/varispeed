@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prepare-ffmpeg.ps1"
if errorlevel 1 (pause & exit /b 1)
call npm install --no-fund --no-audit
if errorlevel 1 (pause & exit /b 1)
call npm run tauri -- dev
if errorlevel 1 pause
