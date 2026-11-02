param(
    [string]$SourceDirectory = 'D:\works\gala\十二橙器\uploads'
)

$ErrorActionPreference = 'Stop'
$outputDirectory = Join-Path $PSScriptRoot '..\apps\web\public\images\works'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Add-Type -AssemblyName System.Drawing
$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }

foreach ($rank in 1..11) {
    $sourceFile = Get-ChildItem -LiteralPath $SourceDirectory -File | Where-Object { $_.BaseName -eq "cover_rank_$rank" } | Select-Object -First 1
    if (-not $sourceFile) { throw "Missing cover for rank $rank in $SourceDirectory" }
    $sourceImage = [System.Drawing.Image]::FromFile($sourceFile.FullName)
    try {
        $longEdge = if ($rank -eq 9) { 1600.0 } else { 1200.0 }
        $ratio = [Math]::Min([double]1, [double]($longEdge / [Math]::Max($sourceImage.Width, $sourceImage.Height)))
        $width = [Math]::Max(1, [int]($sourceImage.Width * $ratio))
        $height = [Math]::Max(1, [int]($sourceImage.Height * $ratio))
        $targetImage = [System.Drawing.Bitmap]::new($width, $height)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($targetImage)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.DrawImage($sourceImage, 0, 0, $width, $height)
            } finally { $graphics.Dispose() }
            $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
            try {
                $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]88)
                $targetImage.Save((Join-Path $outputDirectory "$rank.jpg"), $jpegEncoder, $parameters)
            } finally { $parameters.Dispose() }
        } finally { $targetImage.Dispose() }
    } finally { $sourceImage.Dispose() }
}

Copy-Item -LiteralPath (Join-Path $SourceDirectory 'cover_rank_12.webp') -Destination (Join-Path $outputDirectory '12.webp') -Force
Write-Output "Prepared all 12 covers from $SourceDirectory"
& node (Join-Path $PSScriptRoot 'prepare-cover-variants.mjs') $SourceDirectory
if ($LASTEXITCODE -ne 0) { throw 'Responsive cover preparation failed.' }
