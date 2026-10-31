$node = "C:\Users\Administrator\AppData\Local\ms-playwright-go\1.57.0\node.exe"
$env:ESBUILD_BINARY_PATH = "C:\Users\Administrator\OneDrive\Desktop\VASHTRAA_1\node_modules\.pnpm\@esbuild+win32-x64@0.27.3\node_modules\@esbuild\win32-x64\esbuild.exe"
$env:NODE_PATH = "artifacts\api-server\node_modules;node_modules\.pnpm\node_modules;node_modules;lib\db\node_modules"

Set-Location "c:\Users\Administrator\OneDrive\Desktop\VASHTRAA_1"

& $node -e "const fs=require('fs'); fs.realpathSync=p=>p; fs.lstatSync=(...a)=>{try{return fs.statSync(...a)}catch(e){return {}}}; require('module').Module._initPaths(); import('./scripts/build-test.mjs');"

& $node -e "const fs=require('fs'); fs.realpathSync=p=>p; fs.lstatSync=(...a)=>{try{return fs.statSync(...a)}catch(e){return {}}}; require('module').Module._initPaths(); import('./scripts/dist/test-seller-isolation.js');"
