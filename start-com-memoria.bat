@echo off
echo ====================================
echo Iniciando servidor com 4GB de memoria
echo ====================================
node --max-old-space-size=4096 server1.js
pause
