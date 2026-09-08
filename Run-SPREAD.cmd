@echo off
setlocal
cd /d "%~dp0"
title SPREAD - Run Test
where node.exe >nul 2>&1
if errorlevel 1 goto missing
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing
if /i "%~1"=="--test" goto tests
if not exist "node_modules\.bin\vinext.cmd" (
  echo Installing dependencies for the first run...
  call npm.cmd ci
  if errorlevel 1 goto failed
)
echo.
echo Open http://localhost:5173/ when the server is ready.
echo Keep this window open. Press Ctrl+C to stop SPREAD.
echo.
call npm.cmd run dev
if errorlevel 1 goto failed
goto finished
:tests
call npm.cmd test
if errorlevel 1 goto failed
echo All tests passed.
goto finished
:missing
echo Install Node.js 22.13 or later, then try again.
:failed
echo SPREAD encountered an error. See the details above.
if /i not "%~2"=="--no-pause" pause
exit /b 1
:finished
if /i not "%~2"=="--no-pause" pause
exit /b 0
