# clean-lock.ps1
# Author: Emmansun (LightCrypto-Link)
# Description: Sanitize internal registry URLs in package-lock.json before pushing to GitHub.

$lockFile = "package-lock.json"
# 🔴 Change this to your actual corporate registry URL
$internalRegistry = "https://artifact.cargosmart.com/artifactory/api/npm/npm-repository-virtual-external" 
$publicRegistry   = "https://registry.npmjs.org"

if (-not (Test-Path $lockFile)) {
    Write-Error "Error: $lockFile not found in the current directory!"
    exit 1
}

Write-Host "Reading $lockFile..." -ForegroundColor Cyan
$content = Get-Content $lockFile -Raw

if ($content -match [regex]::Escape($internalRegistry)) {
    Write-Host "Found internal registry URLs. Sanitizing..." -ForegroundColor Yellow
    
    # Perform global regex replacement
    $sanitizedContent = $content -replace [regex]::Escape($internalRegistry), $publicRegistry
    
    # Save back with UTF-8 encoding (compliant with npm standard)
    [System.IO.File]::WriteAllText((Get-Item $lockFile).FullName, $sanitizedContent, (New-Object System.Text.UTF8Encoding($false)))
    
    Write-Host "Success: All internal URLs replaced with public registry!" -ForegroundColor Green
} else {
    Write-Host "Clean: No internal registry URLs detected." -ForegroundColor Green
}
