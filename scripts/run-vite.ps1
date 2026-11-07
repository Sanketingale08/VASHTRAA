$env:PATH = "C:\Users\Administrator\AppData\Local\ms-playwright-go\1.57.0;C:\Users\Administrator\AppData\Roaming\npm;$env:PATH"
$env:PORT = "3000"
$env:API_PORT = "5000"
$env:NODE_OPTIONS = "-r C:\Users\Administrator\OneDrive\Desktop\VASHTRAA_1\patch-fs.js"

Set-Location "c:\Users\Administrator\OneDrive\Desktop\VASHTRAA_1"
& "C:\Users\Administrator\AppData\Roaming\npm\pnpm.cmd" --filter @workspace/twirldrape dev
