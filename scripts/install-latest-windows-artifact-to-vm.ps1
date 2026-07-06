param(
  [string]$ManifestUrl = 'https://lucky-kwiatkowska.s3.sgp.io.cloud.ovh.net/polytrader2/windows/latest/windows-installer.json',
  [string]$VmSshTarget = 'User@192.168.250.2',
  [string]$RemoteTempFolderName = 'polytrader2-install',
  [string]$DownloadRoot = (Join-Path $PSScriptRoot '..\dist\ovh-s3-artifacts'),
  [switch]$KeepDownload
)

$ErrorActionPreference = 'Stop'

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  Write-Host ('> {0} {1}' -f $FilePath, ($Arguments -join ' '))
  $output = & $FilePath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  foreach ($line in $output) {
    Write-Host $line
  }

  if ($exitCode -ne 0) {
    throw ('Command failed with exit code {0}: {1}' -f $exitCode, $FilePath)
  }
}

function Invoke-NativeCommandText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  Write-Host ('> {0} {1}' -f $FilePath, ($Arguments -join ' '))
  $output = & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw ('Command failed with exit code {0}: {1}' -f $LASTEXITCODE, $FilePath)
  }

  return ($output -join [Environment]::NewLine)
}

function ConvertTo-EncodedPowerShellCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Script
  )

  return [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Script))
}

function Invoke-RemotePowerShell {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Script
  )

  $encoded = ConvertTo-EncodedPowerShellCommand -Script $Script
  Invoke-NativeCommand -FilePath 'ssh' -Arguments @($VmSshTarget, 'powershell', '-NoProfile', '-EncodedCommand', $encoded)
}

function Invoke-RemotePowerShellText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Script
  )

  $encoded = ConvertTo-EncodedPowerShellCommand -Script $Script
  return Invoke-NativeCommandText -FilePath 'ssh' -Arguments @($VmSshTarget, 'powershell', '-NoProfile', '-EncodedCommand', $encoded)
}

function Get-LatestInstallerManifest {
  $manifestText = Invoke-NativeCommandText -FilePath 'curl.exe' -Arguments @(
    '-L',
    '-f',
    '--retry',
    '3',
    '--retry-delay',
    '2',
    '--max-time',
    '60',
    $ManifestUrl
  )

  $manifest = $manifestText | ConvertFrom-Json
  if (-not $manifest.downloadUrl) {
    throw 'Installer manifest does not include downloadUrl.'
  }
  if (-not $manifest.fileName) {
    throw 'Installer manifest does not include fileName.'
  }
  if (-not $manifest.sha256) {
    throw 'Installer manifest does not include sha256.'
  }

  Write-Host ('LatestVersion={0}' -f $manifest.version)
  Write-Host ('InstallerName={0}' -f $manifest.fileName)
  Write-Host ('InstallerSize={0}' -f $manifest.size)
  Write-Host ('InstallerSHA256={0}' -f $manifest.sha256)
  return $manifest
}

function Get-InstallerFromS3 {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Manifest
  )

  $version = if ($Manifest.version) { [string]$Manifest.version } else { 'latest' }
  $downloadDir = Join-Path $DownloadRoot $version
  if (Test-Path $downloadDir) {
    Remove-Item -LiteralPath $downloadDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null

  $installerPath = Join-Path $downloadDir ([string]$Manifest.fileName)
  Invoke-NativeCommand -FilePath 'curl.exe' -Arguments @(
    '-L',
    '-f',
    '--retry',
    '3',
    '--retry-delay',
    '2',
    '--connect-timeout',
    '20',
    '-o',
    $installerPath,
    [string]$Manifest.downloadUrl
  )

  $installer = Get-Item -LiteralPath $installerPath
  $hash = Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256
  Write-Host ('LocalSHA256={0}' -f $hash.Hash)

  if ($hash.Hash -ne [string]$Manifest.sha256) {
    throw 'Downloaded installer hash does not match manifest sha256.'
  }

  if ($Manifest.size -and ($installer.Length -ne [int64]$Manifest.size)) {
    throw ('Downloaded installer size mismatch. Expected {0}, got {1}.' -f $Manifest.size, $installer.Length)
  }

  return $installer
}

function Convert-ToScpWindowsPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WindowsPath
  )

  return $WindowsPath.Replace('\', '/')
}

function Uninstall-ExistingPolytrader2 {
  $script = @'
$ErrorActionPreference = 'Stop'
$key = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like 'Polytrader2*' } |
  Sort-Object DisplayName |
  Select-Object -First 1

if (-not $key) {
  Write-Output 'UninstallEntry=NotFound'
  exit 0
}

Get-Process Polytrader2 -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

$command = $key.QuietUninstallString
if (-not $command) {
  $command = $key.UninstallString + ' /S'
}

if ($command -match '^"([^"]+)"\s*(.*)$') {
  $file = $Matches[1]
  $args = $Matches[2]
} else {
  $parts = $command -split '\s+', 2
  $file = $parts[0]
  $args = if ($parts.Count -gt 1) { $parts[1] } else { '' }
}

Write-Output ('Uninstaller=' + $file)
Write-Output ('Arguments=' + $args)

$process = Start-Process -FilePath $file -ArgumentList $args -Wait -PassThru
Write-Output ('UninstallerExitCode=' + $process.ExitCode)

Start-Sleep -Seconds 3
$exePath = Join-Path $env:LOCALAPPDATA 'Programs\Polytrader2\Polytrader2.exe'
Write-Output ('ExeExistsAfterUninstall=' + (Test-Path $exePath))

$remaining = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like 'Polytrader2*' } |
  Measure-Object |
  Select-Object -ExpandProperty Count

Write-Output ('RemainingUninstallEntries=' + $remaining)
'@

  Invoke-RemotePowerShell -Script $script
}

function Install-Polytrader2 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteInstallerPath
  )

  $remoteInstallerLiteral = $RemoteInstallerPath.Replace("'", "''")
  $script = @"
`$ErrorActionPreference = 'Stop'
Get-Process Polytrader2 -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

`$installer = '$remoteInstallerLiteral'
Write-Output ('RemoteInstaller=' + `$installer)
`$process = Start-Process -FilePath `$installer -ArgumentList '/S' -Wait -PassThru
Write-Output ('InstallerExitCode=' + `$process.ExitCode)

Start-Sleep -Seconds 3
`$exePath = Join-Path `$env:LOCALAPPDATA 'Programs\Polytrader2\Polytrader2.exe'
Write-Output ('ExePath=' + `$exePath)
Write-Output ('ExeExists=' + (Test-Path `$exePath))
Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
  Where-Object { `$_.DisplayName -like 'Polytrader2*' } |
  Select-Object DisplayName, DisplayVersion, InstallLocation, UninstallString, QuietUninstallString |
  Format-List
"@

  Invoke-RemotePowerShell -Script $script
}

Invoke-NativeCommand -FilePath 'ssh' -Arguments @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', $VmSshTarget, 'cmd', '/c', 'echo %COMPUTERNAME% && whoami')

$manifest = Get-LatestInstallerManifest
$installerFile = Get-InstallerFromS3 -Manifest $manifest

$remoteTempPath = (Invoke-RemotePowerShellText -Script @"
`$ErrorActionPreference = 'Stop'
`$path = Join-Path `$env:TEMP '$($RemoteTempFolderName.Replace("'", "''"))'
New-Item -ItemType Directory -Force -Path `$path | Out-Null
Write-Output `$path
"@).Trim().Split([Environment]::NewLine)[-1].Trim()

$remoteInstallerPath = Join-Path $remoteTempPath $installerFile.Name
$remoteScpPath = Convert-ToScpWindowsPath -WindowsPath $remoteInstallerPath
Invoke-NativeCommand -FilePath 'scp' -Arguments @($installerFile.FullName, ('{0}:{1}' -f $VmSshTarget, $remoteScpPath))

$remoteHashOutput = Invoke-RemotePowerShellText -Script @"
`$ErrorActionPreference = 'Stop'
`$hash = Get-FileHash -LiteralPath '$($remoteInstallerPath.Replace("'", "''"))' -Algorithm SHA256
Write-Output ('RemoteSHA256=' + `$hash.Hash)
"@
Write-Host $remoteHashOutput

if ($remoteHashOutput -notmatch [regex]::Escape([string]$manifest.sha256)) {
  throw 'Remote installer hash does not match manifest sha256.'
}

Uninstall-ExistingPolytrader2
Install-Polytrader2 -RemoteInstallerPath $remoteInstallerPath

if (-not $KeepDownload) {
  $downloadDir = Join-Path $DownloadRoot ([string]$manifest.version)
  if (Test-Path $downloadDir) {
    Remove-Item -LiteralPath $downloadDir -Recurse -Force
  }
}
