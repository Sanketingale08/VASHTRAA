$pub = 'c:\Users\Administrator\OneDrive\Desktop\VASHTRAA_1\artifacts\vastraa\public\images'
$dst = 'c:\Users\Administrator\OneDrive\Desktop\VASHTRAA_1\artifacts\vastraa\dist\public\images'

$map = @{
  'hero-gadwal-1.png' = 'product-3.png'
  'hero-banarasi-1.png' = 'product-1.png'
  'hero-kanjivaram-1.png' = 'product-2.png'
  'hero-chanderi-1.png' = 'product-4.png'
  'hero-bandhani-1.png' = 'product-5.png'
  'hero-mysore-1.png' = 'product-6.png'
  'hero-ikat-1.png' = 'product-7.png'
  'hero-cotton-1.png' = 'product-8.png'
  'hero-silk-1.png' = 'hero-paithani-2.png'
  'hero-traditional-1.png' = 'hero-paithani-3.png'
  'hero-gadwal-banner.png' = 'hero-paithani-banner.png'
  'hero-banarasi-banner.png' = 'hero-designer-banner.png'
  'hero-kanjivaram-banner.png' = 'hero-paithani-banner.png'
  'hero-chanderi-banner.png' = 'hero-designer-banner.png'
  'hero-bandhani-banner.png' = 'hero-paithani-banner.png'
  'hero-mysore-banner.png' = 'hero-designer-banner.png'
  'hero-ikat-banner.png' = 'hero-paithani-banner.png'
  'hero-cotton-banner.png' = 'hero-designer-banner.png'
  'hero-silk-banner.png' = 'hero-paithani-banner.png'
  'hero-traditional-banner.png' = 'hero-paithani-banner.png'
}

foreach ($target in $map.Keys) {
  $sourceName = $map[$target]
  $srcPath = Join-Path $pub $sourceName
  $dstPub = Join-Path $pub $target
  $dstDist = Join-Path $dst $target
  Copy-Item -Path $srcPath -Destination $dstPub -Force
  Copy-Item -Path $srcPath -Destination $dstDist -Force
}

Write-Host "COPIED_SUCCESSFULLY"
