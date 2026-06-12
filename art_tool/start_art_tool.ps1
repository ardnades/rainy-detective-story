# ============================================================
# start_art_tool.ps1 — 一鍵啟動 AI 美術生成工具後台（0-F）
# 用法：在 art_tool 目錄按右鍵「以 PowerShell 執行」，或：
#   pwsh -File .\start_art_tool.ps1
# 注意：
#   - 本腳本不會自動啟動 ComfyUI；ComfyUI Desktop 請自行開啟。
#   - 本腳本不會自動下載任何模型；checkpoint 需自行放入 ComfyUI 的 models/checkpoints。
# ============================================================
param(
  [int]$Port = 8910,
  [switch]$Install   # 帶 -Install 會先 pip install -r requirements.txt
)

$ErrorActionPreference = "Stop"
$ArtToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ArtToolDir

Write-Host "=== AI 美術生成工具 (0-F) ===" -ForegroundColor Cyan
Write-Host "工作目錄：$ArtToolDir"

# 1. 檢查 Python
$py = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $py) {
  Write-Host "[錯誤] 找不到 python，請先安裝 Python 3.10+ 並加入 PATH。" -ForegroundColor Red
  exit 1
}
Write-Host ("Python：" + (& python --version 2>&1))

# 2. 安裝 / 提示依賴
if ($Install) {
  Write-Host "安裝依賴中（requirements.txt）..." -ForegroundColor Yellow
  & python -m pip install -r requirements.txt
} else {
  $hasUvicorn = $false
  try { & python -c "import uvicorn, fastapi, jinja2, httpx" 2>$null; $hasUvicorn = ($LASTEXITCODE -eq 0) } catch {}
  if (-not $hasUvicorn) {
    Write-Host "[提示] 偵測到缺少依賴。請先執行：" -ForegroundColor Yellow
    Write-Host "       .\start_art_tool.ps1 -Install" -ForegroundColor Yellow
    Write-Host "       或手動：python -m pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
  }
}

# 3. 友善提醒（不阻擋啟動；ComfyUI 離線時頁面會顯示提示）
Write-Host ""
Write-Host "提醒：" -ForegroundColor DarkYellow
Write-Host "  1. 若 ComfyUI 尚未開啟，狀態卡會顯示離線——請先開啟 ComfyUI Desktop，" -ForegroundColor DarkYellow
Write-Host "     或在 art_tool/.env 設定 COMFYUI_URL。" -ForegroundColor DarkYellow
Write-Host "  2. 若狀態卡黃燈（checkpoint 數 = 0），請把 .safetensors 放入 ComfyUI 的" -ForegroundColor DarkYellow
Write-Host "     models/checkpoints，再重新整理 Art Studio；綠燈後才能 Generate Candidates。" -ForegroundColor DarkYellow
Write-Host ""
Write-Host ("啟動中… 請用瀏覽器開啟： http://127.0.0.1:$Port/art-studio") -ForegroundColor Green
Write-Host "（按 Ctrl+C 可停止）" -ForegroundColor DarkGray
Write-Host ""

# 4. 啟動 uvicorn（從 art_tool 目錄，模組名 server:app）
& python -m uvicorn server:app --host 127.0.0.1 --port $Port
