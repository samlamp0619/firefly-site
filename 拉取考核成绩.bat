@echo off
chcp 65001 >nul
title Sam Lamp - Pull Exam Results
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pull-exam-results.ps1"
