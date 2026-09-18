param(
    [string]$ZoteroPath = 'D:\zotero\zotero.exe',
    [string]$NodePath = 'node'
)

$ErrorActionPreference = 'Stop'
$lensRoot = Split-Path -Parent $PSScriptRoot
$nodeExecutable = (Get-Command $NodePath -ErrorAction Stop).Source
Push-Location -LiteralPath $lensRoot
try {
    & ./scripts/build.ps1
    & $nodeExecutable scripts/prepare.cjs | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Test profile preparation failed' }
    $info = Get-Content -LiteralPath '.test/latest.json' -Raw -Encoding UTF8 | ConvertFrom-Json
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $runnerPackage = Join-Path $info.profile 'extensions/paper-lens-test@local.zotero.xpi'
    [IO.Compression.ZipFile]::CreateFromDirectory($info.runner, $runnerPackage)

    $mockScript = '"' + (Join-Path $lensRoot 'scripts/mock.cjs') + '"'
    $mock = Start-Process -FilePath $nodeExecutable -ArgumentList $mockScript -WindowStyle Hidden -PassThru
    try {
        $launchOptions = @{
            FilePath = $ZoteroPath
            ArgumentList = @('-no-remote', '-profile', ('"' + $info.profile + '"'), '-ZoteroDebugText')
            WindowStyle = 'Hidden'
            RedirectStandardOutput = Join-Path $lensRoot '.test/startup.log'
            RedirectStandardError = Join-Path $lensRoot '.test/stderr.log'
        }
        Start-Process @launchOptions
        try {
            $deadline = (Get-Date).AddMinutes(2)
            while (-not (Test-Path -LiteralPath $info.output) -and (Get-Date) -lt $deadline) {
                Start-Sleep -Seconds 1
            }
            if (-not (Test-Path -LiteralPath $info.output)) { throw 'Native tests timed out' }
            $result = Get-Content -LiteralPath $info.output -Raw -Encoding UTF8 | ConvertFrom-Json
            $result | ConvertTo-Json -Depth 5
            if (-not $result.success) { throw 'Native tests failed' }
        }
        finally {
            # A run has to take its Zotero down with it, on success as much as on failure:
            # a leftover keeps the profile and the shared debug log busy and starves the next
            # run past its deadline. The handle Start-Process gave back is only the launcher,
            # which hands off to the real process, so it is not what holds the profile. Match
            # on the profile path instead, which is this run's own throwaway directory and so
            # can never match the Zotero the user is working in.
            $owned = [Regex]::Escape($info.profile)
            try {
                Get-CimInstance Win32_Process -Filter "Name='zotero.exe'" |
                    Where-Object { $_.CommandLine -match $owned } |
                    ForEach-Object { taskkill /F /T /PID $_.ProcessId | Out-Null }
            }
            catch { }
        }
    }
    finally {
        if ($mock -and -not $mock.HasExited) { Stop-Process -Id $mock.Id }
    }
}
finally {
    Pop-Location
}
