@echo off
set "PES=%~dp0desktop\release\PES-win32-x64\PES.exe"
if not exist "%PES%" (
  echo PES has not been packaged at the expected workspace path.
  echo See %~dp0desktop\README.md
  pause
  exit /b 1
)
start "" "%PES%"
