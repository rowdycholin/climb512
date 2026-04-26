@echo off
REM start-dev.bat - Start Climb512 in bind-mounted Next.js development mode
REM Usage: scripts\start-dev.bat [--build] [--fresh] [--logs]

setlocal EnableDelayedExpansion

set REPO_ROOT=%~dp0..
set BUILD_FLAG=
set FRESH=false
set FOLLOW_LOGS=false
set COMPOSE_FILES=-f docker-compose.yml -f docker-compose.dev.yml

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

docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running. Start Docker Desktop and try again.
    exit /b 1
)

if "%FRESH%"=="true" (
    echo -- Removing existing app data and dev volumes...
    docker compose %COMPOSE_FILES% down -v 2>nul
)

echo -- Starting Climb512 in development mode...
docker compose %COMPOSE_FILES% up %BUILD_FLAG% -d
if errorlevel 1 (
    echo ERROR: Failed to start containers. Check logs with: docker compose %COMPOSE_FILES% logs
    exit /b 1
)

echo.
echo   Climb512 dev server is running at http://localhost:8080
echo   Source changes in .\app are bind-mounted into the web container.
echo.
echo   Useful commands:
echo     docker compose %COMPOSE_FILES% logs web -f
echo     scripts\stop-dev.bat
echo     scripts\start.bat --build    ^(production-style image rebuild^)
echo.

if "%FOLLOW_LOGS%"=="true" (
    docker compose %COMPOSE_FILES% logs web -f
)

endlocal
