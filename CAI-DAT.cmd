@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Cai dat bot crawl op lung
rem Cho phep Git / Supabase dung dang nhap da luu tren may
set GCM_INTERACTIVE=
set GIT_TERMINAL_PROMPT=
set AI_AGENT=
set NO_COLOR=
for /f "delims==" %%v in ('set CLAUDE 2^>nul') do set %%v=

echo === 1/2 Cai thu vien ===
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto fail

echo.
echo === 2/2 Database + Edge Functions + Discord + GitHub + web bao cao ===
call npm.cmd run setup
if errorlevel 1 goto fail

echo.
echo XONG! Notepad se mo 2 file:
echo   invite-link.txt  = link moi bot vao server Discord
echo   report-link.txt  = link web xem bao cao (luu lai / ghim len trinh duyet)
start "" notepad invite-link.txt
start "" notepad report-link.txt
pause
exit /b 0

:fail
echo.
echo CO LOI - chup man hinh cua so nay gui cho Claude.
pause
exit /b 1
