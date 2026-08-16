@echo off
REM 启动示例：lark 机器人（Windows 无管理员权限自启，放入启动文件夹）
REM 日志: %USERPROFILE%\.dsh\logs\lark-bot.log  审计: %USERPROFILE%\.dsh\logs\lark-audit.jsonl
set DSH_HOME=%USERPROFILE%\.dsh
REM 显式开启 TLS 校验（https 证书核验，勿设为 0）
set NODE_TLS_REJECT_UNAUTHORIZED=1
if not exist "%USERPROFILE%\.dsh\logs" mkdir "%USERPROFILE%\.dsh\logs"
REM 替换为你的 dsh CLI 路径
"C:\path\to\dsh.cmd" --profile lark >> "%USERPROFILE%\.dsh\logs\lark-bot.log" 2>&1
