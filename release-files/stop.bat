@echo off
rem Stops only the lounge app that was started from this folder.
powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq '%~dp0node\node.exe' } | Stop-Process -Force"
echo The lounge app has been stopped. Your data is safe.
ping -n 3 127.0.0.1 >nul
