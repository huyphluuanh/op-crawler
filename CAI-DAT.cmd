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

echo === 1/3 Cai thu vien ===
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto fail

echo.
echo === 2/3 Database + Edge Functions + Discord ===
call npm.cmd run setup
if errorlevel 1 goto fail

echo.
echo === 3/3 Day code len GitHub ===
git push -u origin main
if errorlevel 1 echo (Chua day duoc code len GitHub - kiem tra repo github.com/huyphluuanh/op-crawler da tao chua. Bot van chay binh thuong.)

echo.
echo XONG! Mo link trong file invite-link.txt de moi bot vao server Discord.
start "" notepad invite-link.txt
pause
exit /b 0

:fail
echo.
echo CO LOI - chup man hinh cua so nay gui cho Claude.
pause
exit /b 1
