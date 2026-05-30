@echo off
chcp 65001 >nul
title Brand Architect AI Pro - Stop Servers
color 0E

echo.
echo  Stopping all Brand Architect servers...
echo.

:: Kill processes on port 8080 (Python API)
echo  Stopping API Server (port 8080)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill processes on port 5000 (Vite frontend)
echo  Stopping Frontend (port 5000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Close any open dev server windows
taskkill /F /FI "WINDOWTITLE eq Brand Architect*" >nul 2>&1

color 0A
echo.
echo  All servers stopped.
echo.
pause
