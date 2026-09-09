#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Autobase'),
  [switch]$NoLaunch
)

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
    throw 'Autobase requires 64-bit Windows.'
  }
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
    throw 'This release supports Windows x64. Windows ARM64 has not been verified.'
  }

  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $release = Invoke-RestMethod 'https://api.github.com/repos/mahojo99/autobase/releases/latest' -Headers @{ 'User-Agent' = 'Autobase-Installer' } -TimeoutSec 30
  $asset = @($release.assets | Where-Object { $_.name -eq 'Autobase-windows-x64.zip' })
  if ($asset.Count -ne 1 -or $asset[0].digest -notmatch '^sha256:([a-fA-F0-9]{64})$') {
    throw 'The latest release has no verified Windows ZIP. Use the GitHub Releases page.'
  }
  $expectedHash = $Matches[1]
  $assetUrl = $asset[0].browser_download_url
  if ($assetUrl -notmatch '^https://github\.com/mahojo99/autobase/releases/download/[^/]+/Autobase-windows-x64\.zip$') {
    throw 'Unexpected release download address.'
  }

  $installBase = [IO.Path]::GetFullPath($InstallRoot)
  New-Item -ItemType Directory -Path $installBase -Force | Out-Null
  # Each attempt gets its own folder, so updates never overwrite a running app or user data.
  $attempt = Join-Path $installBase ('app-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $attempt | Out-Null
  $zipPath = Join-Path $attempt 'Autobase.zip'
  Write-Host 'Downloading Autobase for Windows...'
  Invoke-WebRequest $assetUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 600
  if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'The download checksum does not match GitHub. Nothing was launched; run the command again.'
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    foreach ($entry in $archive.Entries) {
      $entryPath = $entry.FullName.Replace('/', '\')
      $destination = [IO.Path]::GetFullPath((Join-Path $attempt $entryPath))
      if ([IO.Path]::IsPathRooted($entryPath) -or $entryPath.Contains(':') -or -not $destination.StartsWith($attempt + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The download contains an invalid archive path. Nothing was launched.'
      }
    }
  } finally { $archive.Dispose() }
  [IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $attempt)
  $executable = Join-Path $attempt 'Autobase-win32-x64\Autobase.exe'
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw 'The download did not contain Autobase.exe. Nothing was launched.'
  }
  Remove-Item -LiteralPath $zipPath
  Write-Host "Installed: $executable"
  Write-Host 'Choose Try offline demo, or install Codex / Claude Code and sign in through Settings.'
  if (-not $NoLaunch) { Start-Process -FilePath $executable -WorkingDirectory (Split-Path -Parent $executable) -WindowStyle Normal }
  $executable
}
