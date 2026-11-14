@echo off
chcp 65001 >nul
title AstrBot Chat Bridge
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0chat-bridge.ps1"
pause
