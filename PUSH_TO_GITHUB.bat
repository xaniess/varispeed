@echo off
setlocal
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo Git for Windows is required: https://git-scm.com/downloads/win
  echo Install it once, then rerun this script. No Rust or C++ tools are needed.
  pause
  exit /b 1
)
echo.
echo L U T E R A   /   V A R I S P E E D
echo Push source and start the GitHub Windows builder

echo.
echo First create an EMPTY private repository named lutera-varispeed:
echo https://github.com/new
set /p CONFIRM=Is the repository created in the xaniess account? Type YES to continue: 
if /I not "%CONFIRM%"=="YES" (
  echo No changes made.
  pause
  exit /b 1
)
if not exist .git ( git init || goto failed )
git branch -M main || goto failed
git add . || goto failed
git diff --cached --quiet
if errorlevel 1 git commit -m "lūtera varispeed v0.3.1: warm atelier and Windows CI" || goto failed
git remote get-url origin >nul 2>nul
if errorlevel 1 git remote add origin https://github.com/xaniess/lutera-varispeed.git || goto failed
for /f "delims=" %%a in ('git remote get-url origin') do set ORIGIN=%%a
if /I not "%ORIGIN%"=="https://github.com/xaniess/lutera-varispeed.git" (
  echo Remote origin points to %ORIGIN%. This script will not overwrite it.
  echo Review GITHUB_SETUP.md and push manually.
  pause
  exit /b 1
)
git push -u origin main || goto failed
echo.
echo Source pushed. Open GitHub Actions, then download the Windows build artifact.
echo https://github.com/xaniess/lutera-varispeed/actions
pause
exit /b 0
:failed
echo.
echo Git setup or push failed. Check the message above and GITHUB_SETUP.md.
pause
exit /b 1
