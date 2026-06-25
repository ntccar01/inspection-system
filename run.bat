@echo off
chcp 65001 >nul
title 驗車場智慧預約系統
echo ========================================
echo  驗車場智慧預約與流場管理系統
echo ========================================
echo.
echo  正在檢查 Flask 套件...
python -m pip install flask -q
if %errorlevel% neq 0 (
    echo  安裝 Flask 失敗，請確認 Python 已正確安裝
    pause
    exit /b
)
echo.
echo  正在啟動系統...
echo  啟動完成後會自動開啟瀏覽器
echo.
start python app.py
pause
