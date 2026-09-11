$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$lensRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $lensRoot 'addon/manifest.json'
$lensManifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$lensDist = Join-Path $lensRoot 'dist'
New-Item -ItemType Directory -Force -Path $lensDist | Out-Null

# Drop packages from earlier versions so an outdated build cannot be uploaded by mistake.
Get-ChildItem -LiteralPath $lensDist -File |
    Where-Object { $_.Name -match '^paper-lens-.*\.(xpi|zip)$' } |
    Remove-Item -Force

function Write-LensZip($Destination, $Entries) {
    $stream = [IO.File]::Open($Destination, [IO.FileMode]::Create)
    $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($entry in $Entries) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $entry.Path, $entry.Name, [IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    }
    finally {
        $zip.Dispose()
        $stream.Dispose()
    }
}

function Get-LensEntries($Directory, $RelativeTo) {
    Get-ChildItem -LiteralPath $Directory -Recurse -File | ForEach-Object {
        @{
            Path = $_.FullName
            Name = $_.FullName.Substring($RelativeTo.Length + 1).Replace('\', '/')
        }
    }
}

$addon = Join-Path $lensRoot 'addon'
$entries = @(Get-LensEntries $addon $addon)
$entries += @{ Path = (Join-Path $lensRoot 'LICENSE'); Name = 'LICENSE' }
$xpi = Join-Path $lensDist ('paper-lens-' + $lensManifest.version + '.xpi')
Write-LensZip $xpi $entries

# Explicit allowlist keeps caches, credentials and development dependencies out of releases.
$source = @()
foreach ($directory in @('addon', 'scripts', 'tests', 'docs')) {
    $base = Join-Path $lensRoot $directory
    if (Test-Path -LiteralPath $base) {
        $source += @(Get-LensEntries $base $lensRoot)
    }
}
$rootFiles = @(
    'README.md', 'LICENSE', 'package.json', '.gitignore',
    '.prettierrc.json', '.prettierignore', '.editorconfig', '.vscode/tasks.json'
)
foreach ($name in $rootFiles) {
    $source += @{ Path = (Join-Path $lensRoot $name); Name = $name }
}
$sourceZip = Join-Path $lensDist ('paper-lens-' + $lensManifest.version + '-source.zip')
Write-LensZip $sourceZip $source

@($xpi, $sourceZip) | ForEach-Object {
    (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLower() + '  ' + (Split-Path $_ -Leaf)
} | Set-Content -LiteralPath (Join-Path $lensDist 'SHA256SUMS.txt') -Encoding ascii
Write-Output $xpi
Write-Output $sourceZip
