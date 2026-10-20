@echo off
rem Makes the lounge app start by itself when this laptop signs in to Windows.
powershell -NoProfile -Command "$p = Join-Path ([Environment]::GetFolderPath('Startup')) 'Gaming Lounge.lnk'; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($p); $s.TargetPath = '%~dp0start.bat'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()"
echo Done. The lounge app will now start when Windows starts.
pause
