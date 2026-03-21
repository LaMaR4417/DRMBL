@echo off
cd /d "%~dp0"
echo Starting DRMBL local server...
vercel dev --yes
pause
