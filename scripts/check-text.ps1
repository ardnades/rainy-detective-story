# check-text.ps1 —— 繁體中文劇情文字機械檢查
# 注意：CLAUDE.md 是規則正本（必然含黑名單例句），不要拿它自檢。
# 用法：pwsh scripts/check-text.ps1 <檔案路徑> [<檔案路徑>...]
#   例：pwsh scripts/check-text.ps1 content/story.json content/endings.json
#   例：pwsh scripts/check-text.ps1 brief/seven-letters.md
# 違規時印出 [WARN] 與行號，最後輸出統計；有違規 exit 1，全淨 exit 0。
# 規則正本見專案根目錄 CLAUDE.md「文字規範」與「AI 慣用語黑名單」。

param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]$Path
)

$ErrorActionPreference = 'Continue'

# ---- 規則定義 ------------------------------------------------------------

# 常見簡體字（僅收簡繁字形確定不同、且繁中文本絕不該出現者）
$simplified = '[这们来时说为发现学还过给问吗会没经动让见认识话语题间长门书车东买卖钱请谢谁电战观关键将岁觉极压厂广汉号红华机鸡积级纪举兰离历两辆灵龄马满么样应该变谈论议读记鱼龙凤齐风云亿传伤伦众农刘则务势医协单击润涛烂热爱觉证诉词译试诗误调谈贝财责败货质购贵费赛输辑边达迁过运还这进远违连迟选逊递逻邮]'

# AI 慣用語黑名單（與 CLAUDE.md 同步維護）
$blacklist = '不禁|彷彿|宛如|深邃|璀璨|一抹|眸子|嘴角勾起|嘴角上揚|緩緩道|緩緩說|心中一震|心頭一緊|湧上心頭|若有所思|莫名地|難以言喻|千言萬語|時光荏苒|歲月靜好'

# 異國文字混入（韓文／希臘文／西里爾文）
$foreign = '[ᄀ-ᇿ가-힯Ͱ-ϿЀ-ӿ]'

$checks = @(
    @{ Name = '簡體字混入';        Pattern = $simplified;                                  AllExt = $true }
    @{ Name = 'ASCII 省略號(...)'; Pattern = '\.{3}';                                      AllExt = $true }
    @{ Name = '句號式省略(。。。)'; Pattern = '。{2,}';                                     AllExt = $true }
    @{ Name = '孤立單省略號(…)';   Pattern = '(?<!…)…(?!…)';                               AllExt = $true }
    @{ Name = '孤立單破折號(—)';   Pattern = '(?<!—)—(?!—)';                               AllExt = $true }
    @{ Name = 'ASCII 破折號(--)';  Pattern = '(?<!-)--(?!-)';                              AllExt = $true }
    @{ Name = '半形標點貼中文';    Pattern = '[一-鿿][,.?!;:()]|[,.?!;:()][一-鿿]'; AllExt = $true }
    @{ Name = 'AI 慣用語';         Pattern = $blacklist;                                   AllExt = $true }
    @{ Name = '異國文字混入';      Pattern = $foreign;                                     AllExt = $true }
    # Markdown 殘留只檢查 json/txt（md 檔本身允許 Markdown）
    @{ Name = 'Markdown 殘留';     Pattern = '\*\*|^#{1,6}\s|```';                         AllExt = $false; Ext = @('.json', '.txt') }
)

# ---- 執行 -----------------------------------------------------------------

$totalViolations = 0
$files = foreach ($p in $Path) { Get-Item -Path $p -ErrorAction SilentlyContinue }
$missing = $Path | Where-Object { -not (Test-Path $_) }
foreach ($m in $missing) { Write-Host "[WARN] 找不到檔案：$m" -ForegroundColor Yellow }

foreach ($file in $files) {
    if (-not $file) { continue }
    $lines = Get-Content -Path $file.FullName -Encoding UTF8
    $fileViolations = 0
    Write-Host "`n=== $($file.Name) ===" -ForegroundColor Cyan

    foreach ($check in $checks) {
        if (-not $check.AllExt -and $check.Ext -notcontains $file.Extension) { continue }

        for ($i = 0; $i -lt $lines.Count; $i++) {
            $matchResults = [regex]::Matches($lines[$i], $check.Pattern)
            foreach ($m in $matchResults) {
                $shown = if ($m.Value.Length -gt 20) { $m.Value.Substring(0, 20) + '…' } else { $m.Value }
                Write-Host ("[WARN] L{0,-5} {1}：{2}" -f ($i + 1), $check.Name, $shown) -ForegroundColor Yellow
                $fileViolations++
            }
        }
    }

    if ($fileViolations -eq 0) {
        Write-Host "PASS — 無違規" -ForegroundColor Green
    } else {
        Write-Host "共 $fileViolations 項違規" -ForegroundColor Red
    }
    $totalViolations += $fileViolations
}

Write-Host "`n========================================"
if ($totalViolations -eq 0) {
    Write-Host "全部檔案 PASS" -ForegroundColor Green
    exit 0
} else {
    Write-Host "合計 $totalViolations 項違規 — 清零前視為未完成（見 CLAUDE.md 原則 2）" -ForegroundColor Red
    exit 1
}
