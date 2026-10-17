@echo off
rem Lis avtosell narxlarini saytga yuborib turadi. Oyna ochiq tursin.
title Lis avtosell sync
cd /d "%~dp0"
node lisAutosellSync.js
pause
