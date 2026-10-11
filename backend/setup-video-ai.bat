@echo off
cd /d "%~dp0"
set "PYTHON_COMMAND="
for /f "tokens=1,2" %%A in ('py -3.11 --version 2^>^&1') do (
  echo %%A %%B | findstr /B /C:"Python 3.11." >nul && set "PYTHON_COMMAND=py -3.11"
)
if not defined PYTHON_COMMAND (
  for /f "tokens=1,2" %%A in ('python --version 2^>^&1') do (
    echo %%A %%B | findstr /B /C:"Python 3.11." >nul && set "PYTHON_COMMAND=python"
  )
)
if not defined PYTHON_COMMAND (
  echo.
  echo Python 3.11 was not found. Install Python 3.11 with Add Python to PATH, then close and reopen Command Prompt.
  echo Check with: python --version   and   py -0p
  pause
  exit /b 1
)
%PYTHON_COMMAND% -m pip install -r ai\requirements.txt
if errorlevel 1 (
  echo.
  echo Video AI package installation failed. Share the error above.
  pause
  exit /b 1
)
echo.
echo Video AI packages installed successfully.
pause
