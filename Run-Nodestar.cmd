@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "NODESTAR_NO_PAUSE="
set "NODESTAR_TEST="
set "NODESTAR_NO_OPEN="
:args
if "%~1"=="" goto setup
if /i "%~1"=="--no-pause" (
  set "NODESTAR_NO_PAUSE=1"
) else if /i "%~1"=="--test" (
  set "NODESTAR_TEST=1"
) else if /i "%~1"=="--no-open" (
  set "NODESTAR_NO_OPEN=1"
) else (
  echo Unknown option: "%~1"
  echo Usage: Run-Nodestar.cmd [--test] [--no-pause] [--no-open]
  exit /b 1
)
shift /1
goto args
:setup
title Nodestar
pushd "%~dp0"
if errorlevel 1 exit /b 1
where node.exe >nul 2>&1
if errorlevel 1 goto missing
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing
node.exe -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)"
if errorlevel 1 goto missing
if not exist "node_modules\.bin\vinext.cmd" (
  echo Installing dependencies for the first run...
  call npm.cmd ci
  if errorlevel 1 goto failed
)
if defined NODESTAR_TEST goto tests
echo.
if defined NODESTAR_NO_OPEN (
  echo Open http://localhost:5199/ when the server is ready.
) else (
  echo Nodestar opens in its own window once the server is ready.
  start "" /b powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-nodestar.ps1"
)
echo Keep this window open. Press Ctrl+C to stop Nodestar.
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
echo Nodestar encountered an error. See the details above.
if not defined NODESTAR_NO_PAUSE pause
popd
exit /b 1
:finished
if not defined NODESTAR_NO_PAUSE pause
popd
exit /b 0
