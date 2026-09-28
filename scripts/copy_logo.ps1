$src = "C:\Users\Administrator\.gemini\antigravity-ide\brain\c54813af-09aa-4eb1-a0fa-60b43df7755c\media__1790271940737.png"
$dst1 = "c:\Users\Administrator\OneDrive\Desktop\TwirlDrape - Copy\artifacts\twirldrape\public\logo.png"
$dst2 = "c:\Users\Administrator\OneDrive\Desktop\TwirlDrape - Copy\artifacts\twirldrape\public\images\logo.png"
$dst3 = "c:\Users\Administrator\OneDrive\Desktop\TwirlDrape - Copy\artifacts\twirldrape-mobile\assets\images\logo.png"

if (Test-Path $src) {
    Copy-Item -Path $src -Destination $dst1 -Force
    Copy-Item -Path $src -Destination $dst2 -Force
    Copy-Item -Path $src -Destination $dst3 -Force
    Write-Host "Logo successfully copied to all public locations."
} else {
    Write-Host "Source file not found: $src"
}
