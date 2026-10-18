@echo off
rem BUFF buy order narxlarini saytga yuborib turadi. Oyna ochiq tursin.
title BUFF sync
cd /d "%~dp0"
node buffSync.js
pause
