@echo off
rem Startar schemasystemet. Dubbelklicka pa filen. Stang fonstret for att stanga systemet.
cd /d "%~dp0"
echo Startar schemasystemet ...
echo Lat det har fonstret vara oppet. Stang det for att stanga systemet.
start "" http://127.0.0.1:8000
py -m uvicorn schemawebb.app:app --port 8000
if errorlevel 1 (
  echo.
  echo Det gick inte att starta. Kor forst:  py -m pip install -e ".[dev]"
  pause
)
