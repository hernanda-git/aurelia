$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$expected = Join-Path $root 'release\PES-win32-x64\PES.exe'
$evidence = Get-Content -LiteralPath (Join-Path $root 'verification\shortcuts-0.2.json') -Raw | ConvertFrom-Json
if ($evidence.status -ne 'PASS' -or $evidence.shortcuts.Count -ne 2) { throw 'Verified shortcuts are required.' }
$link = $evidence.shortcuts[0].path
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($link)
if ($shortcut.TargetPath -ne $expected -or -not (Test-Path -LiteralPath $expected -PathType Leaf)) { throw 'Shortcut target is not the verified PES executable.' }
Start-Process -FilePath $link
$deadline = [DateTime]::UtcNow.AddSeconds(25)
$running = $null
while ([DateTime]::UtcNow -lt $deadline) {
    $running = Get-Process -Name 'PES' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $expected -and $_.MainWindowTitle -eq 'PES' } | Select-Object -First 1
    if ($running) { break }
    Start-Sleep -Milliseconds 200
}
if (-not $running) { throw 'PES did not expose its expected desktop window.' }
$result = [pscustomobject]@{at=(Get-Date -Format o); status='PASS'; shortcut=$link; executable=$running.Path; pid=$running.Id; windowTitle=$running.MainWindowTitle; leftRunning=$true}
$json = $result | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText((Join-Path $root 'verification\shortcut-launch-0.2.json'), $json, [Text.UTF8Encoding]::new($false))
$json
