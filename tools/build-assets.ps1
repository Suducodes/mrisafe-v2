# Asset build: headless Blender bake + export, then Meshopt compression into public/assets.
#   powershell -File tools/build-assets.ps1 [-Quick]
param([switch]$Quick, [switch]$Reference)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$blender = 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe'
$raw = Join-Path $root 'assets-src\build'
$pub = Join-Path $root 'public\assets'
New-Item -ItemType Directory -Force $raw, $pub | Out-Null

$bargs = @('-b', (Join-Path $root 'assets-src\scanner.blend'), '--python-exit-code', '1',
           '-P', (Join-Path $root 'tools\bake_and_export.py'), '--', $raw)
if ($Quick) { $bargs += '--quick' }
if ($Reference) { $bargs += '--reference' }    # also path-trace the cold-open shot as ground truth
& $blender @bargs
if ($LASTEXITCODE -ne 0) { throw "Blender build failed (exit $LASTEXITCODE)" }

Push-Location $root
try {
  foreach ($n in 'scanner', 'suite') {
    # 14-bit texcoords: the default 12 bits is half a texel on a 2048 lightmap atlas
    npx gltf-transform meshopt (Join-Path $raw "$n.glb") (Join-Path $pub "$n.glb") --level high --quantize-texcoord 14
    if ($LASTEXITCODE -ne 0) { throw "meshopt failed on $n" }
  }
} finally { Pop-Location }
Copy-Item (Join-Path $raw 'lm_*.webp'), (Join-Path $raw 'probe_room.hdr'), (Join-Path $raw 'lightmaps.json') $pub -Force
Get-ChildItem $raw, $pub -File | Select-Object @{n = 'file'; e = { $_.FullName.Substring($root.Length + 1) } }, @{n = 'KB'; e = { [int]($_.Length / 1KB) } } | Format-Table -AutoSize
