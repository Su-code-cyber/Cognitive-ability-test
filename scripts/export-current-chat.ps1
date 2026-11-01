param(
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$SessionId = '01a18d48-ca95-7aa0-ab74-8527c7c9265a',
    [string]$PythonExecutable
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sessionDirectory = Join-Path $env:USERPROFILE '.codex\sessions'
$sessionFiles = @(Get-ChildItem -LiteralPath $sessionDirectory -Recurse -File -Filter "*$SessionId*.jsonl" | Sort-Object FullName)
if ($sessionFiles.Count -eq 0) { throw '没有找到当前聊天的本地会话记录；请使用应用原生导出或完整分享记录。' }
if (!$PythonExecutable) { $PythonExecutable = Join-Path $projectRoot '.venv\Scripts\python.exe' }
if (!(Test-Path -LiteralPath $PythonExecutable -PathType Leaf)) { throw '未找到 Python；请先创建 .venv，或用 -PythonExecutable 指定已有解释器。' }
$exportScript = Join-Path $projectRoot 'scripts\export-ai-records.py'
$exportArguments = @('-B', $exportScript)
foreach ($sessionFile in $sessionFiles) { $exportArguments += @('--source', $sessionFile.FullName) }
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
& $PythonExecutable @exportArguments
if ($LASTEXITCODE -ne 0) { throw '会话导出失败' }
