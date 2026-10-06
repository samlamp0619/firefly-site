@echo off
chcp 65001 >nul
title Sam Lamp - Sync Bilibili Videos
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-and-push.ps1"
