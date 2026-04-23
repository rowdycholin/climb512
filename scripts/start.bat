@echo off
REM start.bat — Start Climb512 using Docker Compose (Windows)
REM Usage: scripts\start.bat [--build] [--fresh] [--logs]
REM
REM Flags:
REM   --build   Force rebuild of the web image (use after code changes)
REM   --fresh   Destroy existing data volume and start clean
REM   --logs    Tail logs after starting

setlocal EnableDelayedExpansion

set REPO_ROOT=%~dp0..
set BUILD_FLAG=
set FRESH=false
set FOLLOW_LOGS=false

:parse_args
if "%~1"=="" goto :start
if /i "%~1"=="--build" (
    set BUILD_FLAG=--build
    shift
    goto :parse_args
)
if /i "%~1"=="--fresh" (
    set FRESH=true
    shift
    goto :parse_args
)
if /i "%~1"=="--logs" (
    set FOLLOW_LOGS=true
    shift
    goto :parse_args
)
echo Unknown flag: %~1
exit /b 1

:start
cd /d "%REPO_ROOT%"

REM Verify Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running. Start Docker Desktop and try again.
    exit /b 1
)

if "%FRESH%"=="true" (
    echo -- Removing existing data volume...
    docker compose down -v 2>nul
)

echo -- Starting Climb512...
docker compose up %BUILD_FLAG% -d
if errorlevel 1 (
    echo ERROR: Failed to start containers. Check logs with: docker compose logs
    exit /b 1
)

echo.
echo   Climb512 is running at http://localhost:8080
echo   Login: climber1 / climbin512!
echo.
echo   Useful commands:
echo     docker compose logs web -f       ^(follow app logs^)
echo     scripts\stop.bat                 ^(stop^)
echo     scripts\start.bat --build        ^(rebuild after code changes^)
echo.

if "%FOLLOW_LOGS%"=="true" (
    docker compose logs web -f
)

endlocal
