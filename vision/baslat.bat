@echo off
REM ShepherdAI kamera yapay zekasi: kapanirsa 10 sn sonra yeniden baslatir.
cd /d "%~dp0"
call .venv\Scripts\activate.bat
:dongu
python -m shepherd_vision run
echo Servis durdu, 10 saniye sonra yeniden baslatiliyor...
timeout /t 10 /nobreak >nul
goto dongu
