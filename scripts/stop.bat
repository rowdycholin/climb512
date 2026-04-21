@echo off
REM stop.bat — Stop Climb512 (Windows)
REM Usage: scripts\stop.bat [--clean]
REM
REM Flags:
REM   --clean   Also remove the postgres data volume (DELETES ALL DATA)

setlocal

set REPO_ROOT=%~dp0..
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
    echo -- Stopping Climb512 and removing data volume...
    echo WARNING: This will delete all stored training plans and logs.
    set /p confirm="Continue? [y/N]: "
    if /i "!confirm!"=="y" (
        docker compose down -v
        echo -- Stopped and data removed.
    ) else (
        echo -- Aborted.
    )
) else (
    echo -- Stopping Climb512 ^(data preserved^)...
    docker compose down
    echo -- Stopped.
)

endlocal
