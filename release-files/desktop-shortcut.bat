@echo off
rem Puts two icons on the Desktop: "Gaming Lounge" (starts the app if needed and opens it in Chrome)
rem and "Stop Gaming Lounge" (switches it off). Run this once on each computer; running it again just replaces the icons.
powershell -NoProfile -Command "$d = [Environment]::GetFolderPath('Desktop'); $w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut((Join-Path $d 'Gaming Lounge.lnk')); $s.TargetPath = '%~dp0start.bat'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Description = 'Start the Level 9 Gaming Lounge app'; $c = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LocalAppData) | ForEach-Object { Join-Path $_ 'Google\Chrome\Application\chrome.exe' } | Where-Object { Test-Path $_ } | Select-Object -First 1; if ($c) { $s.IconLocation = $c + ',0' }; $s.Save(); $t = $w.CreateShortcut((Join-Path $d 'Stop Gaming Lounge.lnk')); $t.TargetPath = '%~dp0stop.bat'; $t.WorkingDirectory = '%~dp0'; $t.WindowStyle = 7; $t.Description = 'Stop the Level 9 Gaming Lounge app'; $t.IconLocation = 'shell32.dll,27'; $t.Save(); if ((Test-Path (Join-Path $d 'Gaming Lounge.lnk')) -and (Test-Path (Join-Path $d 'Stop Gaming Lounge.lnk'))) { Write-Host ('Done. Two icons were put on your Desktop: ' + $d); exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo.
  echo Could not create the icons. Right-click start.bat and choose Send to ^> Desktop ^(create shortcut^) instead.
)
pause
