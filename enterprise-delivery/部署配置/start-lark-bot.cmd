@echo off
REM 企业信息安全合规 · Lark 机器人启动脚本（当前用户级自启，无需管理员）
REM 日志: %USERPROFILE%\.dsh\logs\lark-bot.log  审计: %USERPROFILE%\.dsh\logs\lark-audit.jsonl
set DSH_HOME=%USERPROFILE%\.dsh
REM 显式开启 TLS 校验（手册 7.2：https 证书核验）
set NODE_TLS_REJECT_UNAUTHORIZED=1
if not exist "%USERPROFILE%\.dsh\logs" mkdir "%USERPROFILE%\.dsh\logs"
call dsh --profile lark >> "%USERPROFILE%\.dsh\logs\lark-bot.log" 2>&1
