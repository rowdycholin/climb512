@echo off
REM stop-dev.bat - Stop Climb512 development compose stack
REM Usage: scripts\stop-dev.bat [--clean]

setlocal EnableDelayedExpansion

set REPO_ROOT=%~dp0..
set COMPOSE_FILES=-f docker-compose.yml -f docker-compose.dev.yml
set CLEAN=false

:parse_args
if "%~1"=="" goto :stop
if /i "%~1"=="--clean" (
    set CLEAN=true
    shift
    goto :parse_args
)
echo Unknown flag: %~1
exit /b 1

:stop
cd /d "%REPO_ROOT%"

if "%CLEAN%"=="true" (
    echo -- Stopping Climb512 dev mode and removing volumes...
    echo WARNING: This deletes Postgres data plus dev dependency/cache volumes.
    set /p confirm="Continue? [y/N]: "
    if /i "!confirm!"=="y" (
        docker compose %COMPOSE_FILES% down -v
        echo -- Stopped and volumes removed.
    ) else (
        echo -- Aborted.
    )
) else (
    echo -- Stopping Climb512 dev mode ^(volumes preserved^)...
    docker compose %COMPOSE_FILES% down
    echo -- Stopped.
)

endlocal
