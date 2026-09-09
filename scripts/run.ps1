param([Parameter(ValueFromRemainingArguments=$true)][string[]]$TaskArgs)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskNodeDir = Join-Path $projectRoot '.tooling/node_modules/node/bin'
if (-not (Test-Path (Join-Path $taskNodeDir 'node.exe'))) {
  throw 'Install the project runtime first: npm install --prefix .tooling node@24.20.0'
}
$env:PATH = "$taskNodeDir;$env:PATH"
Push-Location $projectRoot
try {
  $npmScript = Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules/npm/bin/npm-cli.js'
  & (Join-Path $taskNodeDir 'node.exe') $npmScript @TaskArgs
  exit $LASTEXITCODE
} finally { Pop-Location }
