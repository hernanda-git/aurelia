@echo off
set "PESFOCUS=C:\Workspace\pesautomation\desktop\release\PES-win32-x64\PES.exe"
if not exist "%PESFOCUS%" (
  echo PES has not been packaged at the expected workspace path.
  echo See C:\Workspace\pesautomation\desktop\README.md
  pause
  exit /b 1
)
start "" "%PESFOCUS%"
