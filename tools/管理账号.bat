@echo off
chcp 65001 >nul
title Sam Lamp - Account Manager
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage-accounts.ps1"
pause