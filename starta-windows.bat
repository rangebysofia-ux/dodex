@echo off
rem Startar schemasystemet. Dubbelklicka pa filen. Stang fonstret for att stanga systemet.
cd /d "%~dp0"
rem Enheterna sparas i en fast mapp utanfor programmet, sa att de ligger kvar nar en ny version laddas ner.
if not defined SCHEMA_DATA set "SCHEMA_DATA=%USERPROFILE%\DODEX-data"
if not exist "%SCHEMA_DATA%\schemasystem.db" if exist "data\schemasystem.db" (
  mkdir "%SCHEMA_DATA%" 2>nul
  copy /y "data\schemasystem.db*" "%SCHEMA_DATA%\" >nul
  echo Dina enheter har flyttats till %SCHEMA_DATA%
)
echo Startar schemasystemet ...
echo Enheterna sparas i %SCHEMA_DATA%
echo Lat det har fonstret vara oppet. Stang det for att stanga systemet.
start "" http://127.0.0.1:8000
py -m uvicorn schemawebb.app:app --port 8000
if errorlevel 1 (
  echo.
  echo Det gick inte att starta. Kor forst:  py -m pip install -e ".[dev]"
  pause
)
