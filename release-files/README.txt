GAMING LOUNGE MANAGER
=====================

START:   double-click  start.bat
         (the first time, a "Gaming Lounge" shortcut is also placed on your Desktop)
STOP:    double-click  stop.bat    (or just leave it running all day)

The app runs quietly in the background (there is no window to close by accident).
stop.bat stops it. If something goes wrong, the data folder has server.log and server-error.log.

YOUR DATA
---------
Everything is in the  data  folder next to start.bat. Copy that folder to keep a backup.

FORGOT THE OWNER PIN?
---------------------
1. Close the app (stop.bat).
2. In the  data  folder, make a text file named  reset-owner-pin.txt
   containing only the new PIN (4 to 8 digits).
3. Start the app again. The PIN is changed and the file is deleted.

START WITH WINDOWS (optional)
-----------------------------
autostart-on.bat makes the app start when Windows starts. autostart-off.bat undoes it.

NOTES
-----
* The app only works on this laptop. It is not reachable from other devices.
* Timer alerts make a sound once you have clicked anywhere on the screen after opening the app
  (a yellow note on the Floor screen tells you when sound is off). Keep the app window open
  (not minimised) so alerts are on time.
* You stay signed in for 12 hours, then sign in again.
* If the app says port 3000 is busy, close the other program that uses it.
