@echo off
setlocal
cd /d "%~dp0"
echo.
echo  l u t e r a    /    v a r i s p e e d
 echo  Native Windows build - Tauri v2
 echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-windows.ps1"
if errorlevel 1 (
  echo.
  echo BUILD FAILED. Read the error above.
  echo Prerequisites: Node LTS, Rust MSVC, Visual Studio C++ Build Tools, and WebView2.
  pause
  exit /b 1
)
 echo.
 echo Build completed.
pause
