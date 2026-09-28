$node = "C:\Users\Administrator\AppData\Local\ms-playwright-go\1.57.0\node.exe"
$env:NODE_PATH = "node_modules\.pnpm\esbuild@0.27.3\node_modules;node_modules\.pnpm\node_modules;node_modules;artifacts\api-server\node_modules;lib\db\node_modules;scripts\node_modules"

& $node -e "const fs=require('fs'); fs.realpathSync=p=>p; fs.lstatSync=(...a)=>{try{return fs.statSync(...a)}catch(e){return {}}}; require('module').Module._initPaths(); require('./scripts/verify-demo-product-flow.cjs');"

