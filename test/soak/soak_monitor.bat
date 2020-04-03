@echo off

:: @see - https://stackoverflow.com/a/10052222
:: BatchGotAdmin
:-------------------------------------
REM  --> Check for permissions
IF "%PROCESSOR_ARCHITECTURE%" EQU "amd64" (
>nul 2>&1 "%SYSTEMROOT%\SysWOW64\cacls.exe" "%SYSTEMROOT%\SysWOW64\config\system"
) ELSE (
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
)

REM --> If error flag set, we do not have admin.
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    set params= %*
    echo UAC.ShellExecute "cmd.exe", "/c ""%~s0"" %params:"=""%", "", "runas", 1 >> "%temp%\getadmin.vbs"

    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    pushd "%CD%"
    CD /D "%~dp0"
:--------------------------------------

setlocal

:: Script to start a remote-debug-enabled chrome instance and a monitoring script
:: that writes CPU, GPU, disk, and network monitoring stats to a csv file

:: @todo - look into GNU coreutils for Windows to get the true timestamp...

echo Note that this scripts will terminate all running Chrome instances.
echo To cancel, hit ctrl+c, otherwise,
pause

call :getFilenameTimestamp

set "chrome_test_url=%1"
set "chrome_remote_debug_port=9222"
set "chrome_user_data_dir=dev-mode-removeme"
set "chrome_disk_cache_dir=null"
set "monitor_filename=%~dp0monitor_%filename_timestamp%.csv"

:: Kill Chrome
echo Killing Chrome...
call :terminateAllChromeInstances

:: Start Chrome with debugging options
echo Starting Chrome...
call :startProxy
start /b cmd /c call "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"^
 --remote-debugging-port=%chrome_remote_debug_port%^
 --user-data-dir=%chrome_user_data_dir%^
 --disk-cache-dir=%chrome_disk_cache_dir%^
 --overscroll-history-navigation=0^
 --disable-web-security^
 --allow-file-access-from-files^
 --new-window^
 --no-default-browser-check^
 --disable-infobars^
 "%chrome_test_url%"

:: Display Info
echo.
echo ++++++++++++++++++++++++++++++++++++++++++++++++
echo +++
echo +++ ====== Chrome Remote Debugger Address ======
echo|set /p="+++"
ipconfig | findstr "IPv4"
echo +++   Port  . . . . . . . . . . . . . . : %chrome_remote_debug_port%
echo +++
echo +++ ========== Monitoring output file ==========
echo +++   %monitor_filename%
echo +++
echo +++ * Dont close Chrome manually
echo +++ * To quit this monitoring session, hit ctrl+c, then choose "NO" when asked to terminate...
echo +++
echo ++++++++++++++++++++++++++++++++++++++++++++
echo.

:: Start Monitor
echo Starting Monitor...
typeperf -cf ./counters.txt -o %monitor_filename%

:: Clean Up
endlocal
echo Quitting...
call :stopProxy
call :terminateAllChromeInstances
pause
EXIT /B %ERRORLEVEL%


::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
:: Functions
::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

::
:getFilenameTimestamp
:: @see - https://stackoverflow.com/a/25714111
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do (set "dt=%%a")
set "custom_year=%dt:~0,4%"
set "custom_month=%dt:~4,2%"
set "custom_day=%dt:~6,2%"
set "custom_hours=%dt:~8,2%"
set "custom_minutes=%dt:~10,2%"
set "custom_seconds=%dt:~12,2%"
set "filename_timestamp=%custom_year%_%custom_month%_%custom_day%_%custom_hours%_%custom_minutes%_%custom_seconds%"
exit /B 0

::
:startProxy
call :stopProxy
:: give it some time to start up...
timeout /t 5 /nobreak
netsh interface portproxy add v4tov4^
 listenport=%chrome_remote_debug_port%^
 connectaddress=127.0.0.1^
 connectport=%chrome_remote_debug_port%^
 listenaddress=0.0.0.0

::
:stopProxy
netsh interface portproxy delete v4tov4^
 listenport=%chrome_remote_debug_port%^
 listenaddress=0.0.0.0

::
:terminateAllChromeInstances
taskkill /F /IM chrome.exe /T
