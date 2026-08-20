@echo off
setlocal
title Firefly Cover Site - GitHub Pages Deploy
cd /d "%~dp0"

echo ==============================================
echo    Firefly Cover Site - GitHub Pages Deploy
echo ==============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Git is not installed on this PC.
    echo   Please download and install Git for Windows first:
    echo   https://git-scm.com/download/win
    echo   (Restart this script after installation.)
    pause
    exit /b 1
)
echo [OK] Git found.
echo.

rem ===== EDIT THIS LINE ====================================
rem Replace the URL below with YOUR empty repository URL,
rem for example:
rem     set "REPO_URL=https://github.com/lzqiu-00/firefly-site"
set "REPO_URL="
rem ===========================================================

if "%REPO_URL%"=="" (
    echo [ERROR] Please set REPO_URL in this script first.
    echo.
    echo   Step 1: create an empty repo at https://github.com/new
    echo          (do NOT check "Add a README file")
    echo   Step 2: right-click this file - Open with - Notepad,
    echo          then put your repo URL into the line:
    echo          set "REPO_URL=..."
    echo   Step 3: run this script again.
    pause
    exit /b 1
)

echo [1/4] git init ...
git init >nul 2>nul

echo [2/4] configure local git user ...
git config user.name "samm-firefly"
git config user.email "samm-firefly@users.noreply.github.com"

echo [3/4] add and commit ...
git add .
git commit -m "deploy: firefly cover site v1" || echo [INFO] nothing new to commit

echo [4/4] set remote and push ...
git remote remove origin >nul 2>nul
git remote add origin %REPO_URL%
git branch -M main
git push -u origin main

if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. If a GitHub login window opened,
    echo   finish the login, then run this script again.
) else (
    echo.
    echo [DONE] Pushed to GitHub!
    echo.
    echo Next steps:
    echo   1. Open your repo page on github.com
    echo   2. Settings - Pages - Source: "Deploy from a branch"
    echo   3. Branch: main, folder: /(root), click Save
    echo   4. Wait 1-2 minutes, then visit:
    echo      https://YOUR-NAME.github.io/YOUR-REPO-NAME/
)
pause
