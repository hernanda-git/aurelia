param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$desktopRoot = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $desktopRoot 'release\PES-win32-x64\PES.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Build PES before creating shortcuts.' }
$oldExe = Join-Path $desktopRoot 'release\PES Focus-win32-x64\PES Focus.exe'
$shell = New-Object -ComObject WScript.Shell
$folders = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
$results = @()
foreach ($folder in $folders) {
    if (-not $folder -or -not (Test-Path -LiteralPath $folder -PathType Container)) { throw 'The current user shortcut folder is unavailable.' }
    $shortcutPath = $null
    foreach ($name in @('PES.lnk', 'PES Tasks.lnk', 'PES Tasks 2.lnk')) {
        $candidate = Join-Path $folder $name
        if (-not (Test-Path -LiteralPath $candidate)) { $shortcutPath = $candidate; break }
        $existing = $shell.CreateShortcut($candidate)
        if ($existing.TargetPath -eq $exe -or $existing.TargetPath -eq $oldExe) { $shortcutPath = $candidate; break }
    }
    if (-not $shortcutPath) { throw 'Existing unrelated PES shortcuts were left untouched; choose a free shortcut name.' }
    if (-not $VerifyOnly) {
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $exe
        $shortcut.WorkingDirectory = Split-Path $exe -Parent
        $shortcut.IconLocation = "$exe,0"
        $shortcut.Description = 'PES - List Tasks'
        $shortcut.WindowStyle = 1
        $shortcut.Save()
    }
    if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { throw 'Shortcut was not created.' }
    $readback = $shell.CreateShortcut($shortcutPath)
    if ($readback.TargetPath -ne $exe -or $readback.WorkingDirectory -ne (Split-Path $exe -Parent) -or $readback.IconLocation -ne "$exe,0") { throw 'Shortcut readback did not match the intended target.' }
    $results += [pscustomobject]@{path=$shortcutPath; target=$readback.TargetPath; workingDirectory=$readback.WorkingDirectory; icon=$readback.IconLocation; verified=$true}
}
if ($results.Count -ne 2) { throw 'Expected exactly two verified shortcuts.' }
$evidence = [pscustomobject]@{at=(Get-Date -Format o); status='PASS'; administratorRequired=$false; shortcuts=$results}
$json = $evidence | ConvertTo-Json -Depth 5
if (-not $VerifyOnly) { [IO.File]::WriteAllText((Join-Path $desktopRoot 'verification\shortcuts-0.2.json'), $json, [Text.UTF8Encoding]::new($false)) }
$json
