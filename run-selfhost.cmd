@echo off
setlocal

if not exist ".env.server" (
  echo [ERROR] .env.server not found.
  echo Copy .env.server.example to .env.server and fill required values first.
  exit /b 1
)

docker compose up -d --build
if errorlevel 1 (
  echo [ERROR] docker compose failed.
  exit /b 1
)

echo.
echo [OK] Services are up.
docker compose ps
echo.
echo Backend: http://localhost:5000
echo MongoDB: mongodb://localhost:27017
