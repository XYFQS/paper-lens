param(
    [string]$ZoteroPath = 'D:\zotero\zotero.exe',
    [switch]$NoWatch
)

$ErrorActionPreference = 'Stop'
$lensRoot = Split-Path -Parent $PSScriptRoot
$devRoot = Join-Path $lensRoot '.dev'
$profile = Join-Path $devRoot 'profile'
$data = Join-Path $devRoot 'data'
$loader = Join-Path $devRoot 'loader'
$sourcePath = (Resolve-Path -LiteralPath (Join-Path $lensRoot 'addon')).Path
$utf8 = [Text.UTF8Encoding]::new($false)

# Never attach the development loader to the user's normal Zotero profile.
$existing = Get-CimInstance Win32_Process -Filter "name = 'zotero.exe'" |
    Where-Object { $_.CommandLine -like ('*"' + $profile + '"*') }
if ($existing) {
    Write-Output 'Preview is already running. Save source files to reload, or use the development menu.'
    exit 0
}
if (-not (Test-Path -LiteralPath $ZoteroPath)) { throw 'Zotero executable not found. Set -ZoteroPath.' }
foreach ($directory in @($profile, $data, $loader, (Join-Path $profile 'extensions'))) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
$preferences = [ordered]@{
    'extensions.zotero.dataDir' = $data
    'extensions.zotero.useDataDir' = $true
    'extensions.zotero.firstRun.skipFirefoxProfileAccessCheck' = $true
    'extensions.zotero.firstRun2' = $false
    'extensions.zotero.sync.autoSync' = $false
    'extensions.autoDisableScopes' = 0
    'extensions.enabledScopes' = 15
    'extensions.update.enabled' = $false
    'nglayout.debug.disable_xul_cache' = $true
    'nglayout.debug.disable_xul_fastload' = $true
}
$lines = foreach ($entry in $preferences.GetEnumerator()) {
    'user_pref(' + (ConvertTo-Json $entry.Key -Compress) + ', ' + (ConvertTo-Json $entry.Value -Compress) + ');'
}
[IO.File]::WriteAllText((Join-Path $profile 'user.js'), ($lines -join "`n"), $utf8)
$config = @{
    sourcePath = $sourcePath
    sourceURI = ([Uri]::new($sourcePath + '\')).AbsoluteUri
    dataDir = $data
    watch = -not $NoWatch
}
[IO.File]::WriteAllText((Join-Path $loader 'config.json'), ($config | ConvertTo-Json), $utf8)
$manifest = @{
    manifest_version = 2
    name = 'Paper Lens Development Preview'
    version = '1.0.0'
    applications = @{
        zotero = @{
            id = 'paper-lens-dev-loader@local.zotero'
            update_url = 'https://example.invalid/dev.json'
            strict_min_version = '9.0.6'
            strict_max_version = '9.0.*'
        }
    }
}
[IO.File]::WriteAllText((Join-Path $loader 'manifest.json'), ($manifest | ConvertTo-Json -Depth 5), $utf8)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dev-loader.js') -Destination (Join-Path $loader 'bootstrap.js') -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$package = Join-Path $profile 'extensions/paper-lens-dev-loader@local.zotero.xpi'
$stream = [IO.File]::Open($package, [IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in Get-ChildItem -LiteralPath $loader -File) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $file.Name) | Out-Null
    }
}
finally {
    $archive.Dispose()
    $stream.Dispose()
}
Start-Process -FilePath $ZoteroPath -ArgumentList @('-no-remote', '-profile', ('"' + $profile + '"'), '-ZoteroDebugText') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $devRoot 'startup.log') -RedirectStandardError (Join-Path $devRoot 'stderr.log')
Write-Output 'Development preview launched with an isolated library.'
if ($NoWatch) {
    Write-Output 'Automatic reload is disabled. Use the development menu to reload source files.'
}
else {
    Write-Output 'Saving addon source files reloads the plugin after approximately two seconds.'
}
Write-Output ('Preview data: ' + $data)
