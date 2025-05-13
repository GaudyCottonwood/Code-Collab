@echo off
start "Server" cmd /k "cd /d %~dp0\server && npm start"
start "Client" cmd /k "cd /d %~dp0\client && npm start"