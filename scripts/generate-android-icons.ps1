[CmdletBinding()]
param(
    [string]$ProjectRoot = ''
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ProjectRoot = Split-Path -Parent $scriptDirectory
}

function New-HexColor {
    param(
        [Parameter(Mandatory = $true)][string]$Hex,
        [int]$Alpha = 255
    )

    $value = $Hex.TrimStart('#')
    if ($value.Length -ne 6) {
        throw "Unsupported color value: $Hex"
    }

    $r = [Convert]::ToInt32($value.Substring(0, 2), 16)
    $g = [Convert]::ToInt32($value.Substring(2, 2), 16)
    $b = [Convert]::ToInt32($value.Substring(4, 2), 16)
    return [System.Drawing.Color]::FromArgb($Alpha, $r, $g, $b)
}

function New-RoundedPath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $r = [Math]::Min($Radius, [Math]::Min($Width / 2, $Height / 2))
    $d = $r * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $Width - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $Width - $d, $Y + $Height - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $Height - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Set-HighQuality {
    param([System.Drawing.Graphics]$Graphics)

    $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
}

function Fill-RoundedGradient {
    param(
        [System.Drawing.Graphics]$Graphics,
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius,
        [System.Drawing.Color]$StartColor,
        [System.Drawing.Color]$EndColor,
        [float]$Angle
    )

    $path = New-RoundedPath -X $X -Y $Y -Width $Width -Height $Height -Radius $Radius
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.RectangleF($X, $Y, $Width, $Height)),
        $StartColor,
        $EndColor,
        $Angle
    )
    $Graphics.FillPath($brush, $path)
    $brush.Dispose()
    $path.Dispose()
}

function Draw-FilledCircle {
    param(
        [System.Drawing.Graphics]$Graphics,
        [float]$CenterX,
        [float]$CenterY,
        [float]$Radius,
        [System.Drawing.Color]$Color
    )

    $brush = New-Object System.Drawing.SolidBrush($Color)
    $Graphics.FillEllipse($brush, $CenterX - $Radius, $CenterY - $Radius, $Radius * 2, $Radius * 2)
    $brush.Dispose()
}

function Draw-GoodsMark {
    param(
        [System.Drawing.Graphics]$Graphics,
        [float]$Scale = 1.0,
        [float]$OffsetX = 0,
        [float]$OffsetY = 0,
        [bool]$ShowShadow = $true
    )

    function SX([float]$Value) { return $OffsetX + ($Value * $Scale) }
    function SY([float]$Value) { return $OffsetY + ($Value * $Scale) }
    function SS([float]$Value) { return $Value * $Scale }

    if ($ShowShadow) {
        Draw-FilledCircle -Graphics $Graphics -CenterX (SX 512) -CenterY (SY 780) -Radius (SS 246) -Color (New-HexColor '#28589E' 42)
    }

    Fill-RoundedGradient -Graphics $Graphics -X (SX 236) -Y (SY 308) -Width (SS 552) -Height (SS 412) -Radius (SS 126) -StartColor (New-HexColor '#3F86F7') -EndColor (New-HexColor '#74B0FF') -Angle 38
    Fill-RoundedGradient -Graphics $Graphics -X (SX 200) -Y (SY 220) -Width (SS 624) -Height (SS 188) -Radius (SS 96) -StartColor (New-HexColor '#2F73EA') -EndColor (New-HexColor '#5BA0FF') -Angle 18

    $highlightPath = New-RoundedPath -X (SX 254) -Y (SY 252) -Width (SS 516) -Height (SS 48) -Radius (SS 24)
    $highlightBrush = New-Object System.Drawing.SolidBrush((New-HexColor '#8BBCFF' 82))
    $Graphics.FillPath($highlightBrush, $highlightPath)
    $highlightBrush.Dispose()
    $highlightPath.Dispose()

    $slotPath = New-RoundedPath -X (SX 396) -Y (SY 390) -Width (SS 232) -Height (SS 40) -Radius (SS 20)
    $slotBrush = New-Object System.Drawing.SolidBrush((New-HexColor '#FFFFFF' 240))
    $Graphics.FillPath($slotBrush, $slotPath)
    $slotBrush.Dispose()
    $slotPath.Dispose()

    Draw-FilledCircle -Graphics $Graphics -CenterX (SX 292) -CenterY (SY 396) -Radius (SS 18) -Color (New-HexColor '#FFD54E')
    Draw-FilledCircle -Graphics $Graphics -CenterX (SX 732) -CenterY (SY 396) -Radius (SS 18) -Color (New-HexColor '#FFD54E')

    $stickerPath = New-RoundedPath -X (SX 304) -Y (SY 494) -Width (SS 416) -Height (SS 164) -Radius (SS 44)
    $stickerBrush = New-Object System.Drawing.SolidBrush((New-HexColor '#FFFFFF' 247))
    $stickerPen = New-Object System.Drawing.Pen((New-HexColor '#CDDEFF'), (SS 6))
    $Graphics.FillPath($stickerBrush, $stickerPath)
    $Graphics.DrawPath($stickerPen, $stickerPath)
    $stickerPen.Dispose()
    $stickerBrush.Dispose()
    $stickerPath.Dispose()

    $line1 = New-RoundedPath -X (SX 362) -Y (SY 540) -Width (SS 208) -Height (SS 24) -Radius (SS 12)
    $line2 = New-RoundedPath -X (SX 362) -Y (SY 582) -Width (SS 164) -Height (SS 24) -Radius (SS 12)
    $line3 = New-RoundedPath -X (SX 362) -Y (SY 624) -Width (SS 120) -Height (SS 24) -Radius (SS 12)
    $lineBrush1 = New-Object System.Drawing.SolidBrush((New-HexColor '#4A8CF7'))
    $lineBrush2 = New-Object System.Drawing.SolidBrush((New-HexColor '#74A9FF'))
    $lineBrush3 = New-Object System.Drawing.SolidBrush((New-HexColor '#BED6FF'))
    $Graphics.FillPath($lineBrush1, $line1)
    $Graphics.FillPath($lineBrush2, $line2)
    $Graphics.FillPath($lineBrush3, $line3)
    $lineBrush1.Dispose()
    $lineBrush2.Dispose()
    $lineBrush3.Dispose()
    $line1.Dispose()
    $line2.Dispose()
    $line3.Dispose()

    Draw-FilledCircle -Graphics $Graphics -CenterX (SX 634) -CenterY (SY 574) -Radius (SS 18) -Color (New-HexColor '#FFD54E')
}

function New-BaseBitmap {
    param([int]$Size)

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $bitmap.SetResolution(72, 72)
    return $bitmap
}

function Render-SquareIcon {
    param([int]$Size = 1024)

    $bitmap = New-BaseBitmap -Size $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    Set-HighQuality -Graphics $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)

    Fill-RoundedGradient -Graphics $graphics -X 72 -Y 72 -Width 880 -Height 880 -Radius 224 -StartColor (New-HexColor '#F8FBFF') -EndColor (New-HexColor '#E7F1FF') -Angle 45
    Draw-FilledCircle -Graphics $graphics -CenterX 270 -CenterY 248 -Radius 172 -Color (New-HexColor '#FFFFFF' 148)
    Draw-FilledCircle -Graphics $graphics -CenterX 810 -CenterY 788 -Radius 228 -Color (New-HexColor '#D8E8FF' 184)
    $framePath = New-RoundedPath -X 77 -Y 77 -Width 870 -Height 870 -Radius 219
    $framePen = New-Object System.Drawing.Pen((New-HexColor '#FFFFFF' 188), 10)
    $graphics.DrawPath($framePen, $framePath)
    $framePen.Dispose()
    $framePath.Dispose()

    Draw-GoodsMark -Graphics $graphics -OffsetY 42

    $graphics.Dispose()
    return $bitmap
}

function Render-RoundIcon {
    param([int]$Size = 1024)

    $bitmap = New-BaseBitmap -Size $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    Set-HighQuality -Graphics $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $circleRect = New-Object System.Drawing.RectangleF(92, 92, 840, 840)
    $circleBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($circleRect, (New-HexColor '#F8FBFF'), (New-HexColor '#E7F1FF'), 45)
    $graphics.FillEllipse($circleBrush, $circleRect)
    $circleBrush.Dispose()
    Draw-FilledCircle -Graphics $graphics -CenterX 334 -CenterY 274 -Radius 156 -Color (New-HexColor '#FFFFFF' 146)
    Draw-FilledCircle -Graphics $graphics -CenterX 760 -CenterY 772 -Radius 202 -Color (New-HexColor '#D8E8FF' 176)
    $circlePen = New-Object System.Drawing.Pen((New-HexColor '#FFFFFF' 184), 10)
    $graphics.DrawEllipse($circlePen, $circleRect)
    $circlePen.Dispose()

    Draw-GoodsMark -Graphics $graphics -Scale 0.94 -OffsetX 31 -OffsetY 74

    $graphics.Dispose()
    return $bitmap
}

function Render-ForegroundIcon {
    param([int]$Size = 1024)

    $bitmap = New-BaseBitmap -Size $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    Set-HighQuality -Graphics $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)

    Draw-GoodsMark -Graphics $graphics -Scale 0.9 -OffsetX 51 -OffsetY 89 -ShowShadow $false

    $graphics.Dispose()
    return $bitmap
}

function Save-ScaledPng {
    param(
        [System.Drawing.Bitmap]$SourceBitmap,
        [int]$Size,
        [string]$Path
    )

    $directory = Split-Path -Parent $Path
    if (-not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }

    $target = New-Object System.Drawing.Bitmap($Size, $Size)
    $target.SetResolution(72, 72)
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    Set-HighQuality -Graphics $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($SourceBitmap, 0, 0, $Size, $Size)
    $graphics.Dispose()
    $target.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $target.Dispose()
}

$androidResRoot = Join-Path $ProjectRoot 'android\app\src\main\res'
$publicAssetsRoot = Join-Path $ProjectRoot 'public\assets'

$squareSource = Render-SquareIcon
$roundSource = Render-RoundIcon
$foregroundSource = Render-ForegroundIcon

Save-ScaledPng -SourceBitmap $squareSource -Size 1024 -Path (Join-Path $publicAssetsRoot 'icon-android-1024.png')
Save-ScaledPng -SourceBitmap $foregroundSource -Size 1024 -Path (Join-Path $publicAssetsRoot 'icon-android-foreground-1024.png')

$sizes = @{
    'mipmap-mdpi' = 48
    'mipmap-hdpi' = 72
    'mipmap-xhdpi' = 96
    'mipmap-xxhdpi' = 144
    'mipmap-xxxhdpi' = 192
}

foreach ($entry in $sizes.GetEnumerator()) {
    $targetDir = Join-Path $androidResRoot $entry.Key
    Save-ScaledPng -SourceBitmap $squareSource -Size $entry.Value -Path (Join-Path $targetDir 'ic_launcher.png')
    Save-ScaledPng -SourceBitmap $foregroundSource -Size $entry.Value -Path (Join-Path $targetDir 'ic_launcher_foreground.png')
    Save-ScaledPng -SourceBitmap $roundSource -Size $entry.Value -Path (Join-Path $targetDir 'ic_launcher_round.png')
}

$squareSource.Dispose()
$roundSource.Dispose()
$foregroundSource.Dispose()

Write-Output 'Android launcher icons generated.'
