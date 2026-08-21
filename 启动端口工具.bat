@echo off
rem Port killer launcher - runs the tool without a console window
cd /d "%~dp0"
where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw "%~dp0port_killer.py"
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        start "" python "%~dp0port_killer.py"
    ) else (
        echo Python not found. Please install Python 3 and add it to PATH.
        pause
    )
)
