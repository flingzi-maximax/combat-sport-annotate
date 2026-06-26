@echo off
title Sport Annotate - Setup
echo ==========================================
echo   Sport Annotation Tool - Setup
echo ==========================================
echo.

echo [1/2] Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed. Make sure Python is installed and in PATH.
    pause
    exit /b 1
)

echo.
echo [2/2] Installing frontend dependencies...
cd app
call pnpm install
if errorlevel 1 (
    echo ERROR: pnpm install failed. Make sure Node.js and pnpm are installed.
    echo Install pnpm with: npm install -g pnpm
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ==========================================
echo   Setup complete!
echo   Drag a video onto annotate.bat to start.
echo ==========================================
pause
