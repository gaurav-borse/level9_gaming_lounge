@echo off
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Startup')) 'Gaming Lounge.lnk')"
echo Done. The lounge app will no longer start by itself.
pause
