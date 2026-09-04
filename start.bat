@echo off
title CineIA - Serveur Local
set PATH=C:\Users\joris\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%
start http://localhost:5173
node node_modules\vite\bin\vite.js --host
pause
