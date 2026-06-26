@echo off
title Sport Annotate
echo ==========================================
echo   Sport Annotation Tool
echo ==========================================
echo.

if "%~1"=="" (
    set /p "VIDEO_PATH=Enter video path (or drag video file here): "
) else (
    set VIDEO_PATH=%~1
)

if not exist "%VIDEO_PATH%" (
    echo.
    echo ERROR: File not found: %VIDEO_PATH%
    pause
    exit /b 1
)

echo.
echo Detecting athletes in video...
echo This may take a few minutes depending on video length.
echo.
cd /d "%~dp0"
python prep_clip.py --video "%VIDEO_PATH%"

echo.
echo Session ended.
pause
