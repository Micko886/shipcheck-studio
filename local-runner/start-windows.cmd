@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo 请先安装 Node.js 22.19+ 或更新版本：https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\lighthouse\cli\index.js" (
  echo 首次使用，正在本机安装 Lighthouse 开源依赖...
  call npm install --no-audit --no-fund
  if errorlevel 1 (echo 依赖安装失败，请检查网络或 npm 配置 & pause & exit /b 1)
)
node server.cjs
pause
