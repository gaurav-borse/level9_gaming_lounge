@echo off
setlocal
cd /d "%~dp0"
if not defined PORT set "PORT=3000"
set "URL=http://127.0.0.1:%PORT%"

rem Already running? Then just open it.
call :ping
if %errorlevel%==0 goto open

if not exist "data" mkdir "data"
set "HOSTNAME=127.0.0.1"
set "NODE_ENV=production"
set "LOUNGE_DATA_DIR=%~dp0data"
echo Starting the lounge app...
rem Hidden window (a visible console can freeze the app if someone clicks inside it). Output goes to data\server.log.
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '%~dp0node\node.exe' -ArgumentList '\"%~dp0app\server.js\"' -RedirectStandardOutput '%~dp0data\server.log' -RedirectStandardError '%~dp0data\server-error.log'"

set /a tries=0
:wait
set /a tries+=1
if %tries% gtr 45 goto failed
call :ping
if %errorlevel%==0 goto open
ping -n 2 127.0.0.1 >nul
goto wait

:failed
echo.
echo The app did not start. The reason is in the data folder: server-error.log
echo (open it with Notepad). Send it to your support person if you are not sure.
echo If another program is using port %PORT%, close it and try again.
pause
exit /b 1

:open
if defined LOUNGE_NO_BROWSER exit /b 0
if not exist "data\.shortcut-made" call :shortcut
rem Google Chrome only (an app-style window without tabs or address bar).
rem Its own profile folder, so these two settings always apply: alert sounds may play without anyone clicking first, and no first-run screens.
set "CHROME_ARGS=--app=%URL% --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check "--user-data-dir=%~dp0data\chrome-profile""
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" goto chrome64
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" goto chrome86
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" goto chromeuser
echo.
echo Google Chrome was not found, so no window was opened.
echo The lounge app is running. Install Chrome, or open this address in Chrome: %URL%
pause
exit /b 0
:chrome64
start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" %CHROME_ARGS%
exit /b 0
:chrome86
start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" %CHROME_ARGS%
exit /b 0
:chromeuser
start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" %CHROME_ARGS%
exit /b 0

:ping
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing '%URL%/api/health' -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:shortcut
powershell -NoProfile -Command "$p = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Gaming Lounge.lnk'; if (-not (Test-Path $p)) { $s = (New-Object -ComObject WScript.Shell).CreateShortcut($p); $s.TargetPath = '%~dp0start.bat'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save() }" >nul 2>&1
echo made> "data\.shortcut-made"
exit /b 0
