@echo off
chcp 65001 >nul
title Brand Architect AI Pro - Windows Setup
color 0A

echo.
echo  ============================================
echo   Brand Architect AI Pro - Windows Setup
echo  ============================================
echo.

:: ── Check Node.js ────────────────────────────────────────────────────────────
echo [1/5] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Node.js not found!
    echo  Download from: https://nodejs.org  (version 20 or higher)
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  OK: Node.js %NODE_VER%

:: ── Check Python ─────────────────────────────────────────────────────────────
echo [2/5] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Python not found!
    echo  Download from: https://python.org  (version 3.11 or higher)
    echo  Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do set PY_VER=%%i
echo  OK: %PY_VER%

:: ── Check/Install pnpm ───────────────────────────────────────────────────────
echo [3/5] Checking pnpm...
pnpm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  pnpm not found - installing...
    npm install -g pnpm
    if %errorlevel% neq 0 (
        color 0C
        echo  ERROR: Failed to install pnpm
        pause
        exit /b 1
    )
)
for /f "tokens=*" %%i in ('pnpm --version') do set PNPM_VER=%%i
echo  OK: pnpm %PNPM_VER%

:: ── Setup .env file ──────────────────────────────────────────────────────────
echo [4/5] Setting up environment...
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  Created .env from .env.example
        echo.
        echo  IMPORTANT: Edit the .env file and set:
        echo    EXTERNAL_DATABASE_URL  - your Neon/PostgreSQL connection string
        echo    AUTH_JWT_SECRET        - any long random string
        echo    OPENAI_API_KEY         - your OpenAI API key
        echo.
        echo  Then re-run setup.bat
        pause
        exit /b 0
    ) else (
        echo  WARNING: No .env file found. Creating a template...
        (
            echo # Brand Architect AI Pro - Environment Variables
            echo.
            echo # Database - Use your Neon or PostgreSQL connection string
            echo EXTERNAL_DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
            echo.
            echo # Auth - Any long random string (at least 32 characters)
            echo AUTH_JWT_SECRET=change-me-to-a-long-random-secret-string-minimum-32-chars
            echo.
            echo # AI Provider - Your OpenAI API key
            echo OPENAI_API_KEY=sk-...
            echo.
            echo # Optional - Gemini API key for image generation
            echo # GEMINI_API_KEY=
            echo.
            echo # Optional - Disable credits system during development
            echo # CREDITS_ENABLED=false
        ) > .env
        echo.
        echo  IMPORTANT: Edit the .env file with your credentials
        echo  Then re-run setup.bat
        pause
        exit /b 0
    )
) else (
    echo  OK: .env file exists
)

:: ── Install JS dependencies ───────────────────────────────────────────────────
echo [5/5] Installing dependencies...
echo  Installing Node.js packages (this may take a few minutes)...
call pnpm install
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Failed to install Node.js packages
    pause
    exit /b 1
)
echo  OK: Node.js packages installed

echo  Installing Python packages (this may take a few minutes)...
pip install -r artifacts\api-server-python\requirements.txt -q
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Failed to install Python packages
    echo  Try running: pip install -r artifacts\api-server-python\requirements.txt
    pause
    exit /b 1
)
echo  OK: Python packages installed

:: ── Initialize Database ───────────────────────────────────────────────────────
echo  Creating database tables...
cd artifacts\api-server-python
python -c "from app.models import Base; from app.database import engine; Base.metadata.create_all(engine); print('  OK: Database tables created')"
if %errorlevel% neq 0 (
    color 0E
    echo  WARNING: Could not create database tables
    echo  Make sure EXTERNAL_DATABASE_URL is set correctly in .env
)
cd ..\..

:: ── Done ─────────────────────────────────────────────────────────────────────
color 0A
echo.
echo  ============================================
echo   Setup Complete!
echo  ============================================
echo.
echo  To start the application, run:
echo    dev.bat
echo.
echo  Then open in your browser:
echo    http://localhost:5000   - Frontend
echo    http://localhost:8080/api/docs  - API Docs
echo.
echo  First login creates your admin account.
echo.
pause
