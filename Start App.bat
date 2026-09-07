@echo off
cd /d "%~dp0"
title Market Signal Triage - Launcher

if not exist "node_modules" (
  echo Installing dependencies the first time - this may take a minute...
  call npm install
)
if not exist "server\node_modules" (
  call npm install --prefix server
)
if not exist "client\node_modules" (
  call npm install --prefix client
)

start "Market Signal Triage - running (keep this window open)" cmd /k "npm run dev"

echo Waiting for the app to start...
timeout /t 6 /nobreak >nul

start http://localhost:5173

exit
