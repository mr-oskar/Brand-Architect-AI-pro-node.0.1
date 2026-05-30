@echo off
chcp 65001 >nul
title Brand Architect AI Pro - Development Server
color 0A

echo.
echo  ============================================
echo   Brand Architect AI Pro - Dev Server
echo  ============================================
echo  Frontend  -^>  http://localhost:5000
echo  Backend   -^>  http://localhost:8080
echo  API Docs  -^>  http://localhost:8080/api/docs
echo  ============================================
echo.
echo  Two windows will open:
echo    Window 1: Python API Server (port 8080)
echo    Window 2: React Frontend    (port 5000)
echo.
echo  Close this window or press Ctrl+C to stop the frontend.
echo  Close the API Server window to stop the backend.
echo.

:: ── Check dependencies ────────────────────────────────────────────────────────
if not exist "node_modules" (
    color 0C
    echo  ERROR: Dependencies not installed!
    echo  Please run setup.bat first.
    pause
    exit /b 1
)

python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Python not found. Install from https://python.org
    pause
    exit /b 1
)

:: ── Start Python API Server in a new window ───────────────────────────────────
echo  Starting Python API Server...
start "Brand Architect - API Server (port 8080)" cmd /k ^
    "cd /d %~dp0..\artifacts\api-server-python && echo. && echo  API Server running on http://localhost:8080 && echo  Press Ctrl+C to stop && echo. && python -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload --reload-dir app"

:: ── Wait for backend to start ─────────────────────────────────────────────────
echo  Waiting 3 seconds for API server to start...
timeout /t 3 /nobreak >nul

:: ── Start React Frontend (this window) ───────────────────────────────────────
echo  Starting React Frontend...
echo.
set PORT=5000
set BASE_PATH=/
call pnpm --filter @workspace/brand-os run dev

pause
