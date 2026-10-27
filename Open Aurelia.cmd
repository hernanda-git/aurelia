@echo off
set "AURELIA=%~dp0desktop\release\Aurelia-win32-x64\Aurelia.exe"
if not exist "%AURELIA%" (
  echo Aurelia has not been packaged at the expected workspace path.
  echo See %~dp0desktop\README.md
  pause
  exit /b 1
)
start "" "%AURELIA%"
