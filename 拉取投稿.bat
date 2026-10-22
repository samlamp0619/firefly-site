@echo off
chcp 65001 >nul
title Sam Lamp - Pull Submissions
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pull-submissions.ps1"
