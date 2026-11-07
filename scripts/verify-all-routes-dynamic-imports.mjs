import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const appPath = path.join(rootDir, "artifacts/vastraa/src/App.tsx");
const pagesDir = path.join(rootDir, "artifacts/vastraa/src/pages");

console.log("=== VASTRAA Dynamic Import & Route Integrity Audit ===");

const appContent = fs.readFileSync(appPath, "utf-8");

// Extract all safeLazy calls
const safeLazyRegex = /const\s+([A-Za-z0-9_]+)\s*=\s*safeLazy\(\s*\(\)\s*=>\s*import\(["']@\/pages\/([^"']+)["']\)(?:,\s*["']([^"']+)["'])?\);/g;

let matches = [...appContent.matchAll(safeLazyRegex)];
console.log(`Found ${matches.length} safeLazy route declarations in App.tsx\n`);

let passed = 0;
let failed = 0;

for (const match of matches) {
  const [, varName, importPath, explicitExport] = match;
  
  // Resolve actual file
  const possiblePaths = [
    path.join(pagesDir, `${importPath}.tsx`),
    path.join(pagesDir, `${importPath}/index.tsx`),
    path.join(pagesDir, `${importPath}.ts`),
  ];

  let resolvedFile = possiblePaths.find((p) => fs.existsSync(p));

  if (!resolvedFile) {
    console.error(`❌ [FAIL] Missing file for ${varName}: @/pages/${importPath}`);
    failed++;
    continue;
  }

  const content = fs.readFileSync(resolvedFile, "utf-8");
  const hasDefaultExport = /export\s+default\s+/.test(content);
  const namedExports = [...content.matchAll(/export\s+(?:function|const|class)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);

  // Check if resolution will succeed
  let canResolve = false;
  let resolutionReason = "";

  if (explicitExport && namedExports.includes(explicitExport)) {
    canResolve = true;
    resolutionReason = `explicit named export "${explicitExport}"`;
  } else if (hasDefaultExport) {
    canResolve = true;
    resolutionReason = "default export";
  } else if (namedExports.includes(varName)) {
    canResolve = true;
    resolutionReason = `matching named export "${varName}"`;
  } else if (namedExports.length > 0) {
    canResolve = true;
    resolutionReason = `available named export(s) [${namedExports.join(", ")}]`;
  }

  if (canResolve) {
    console.log(`✅ [OK] ${varName.padEnd(28)} -> @/pages/${importPath.padEnd(30)} via ${resolutionReason}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${varName} -> @/pages/${importPath} has no default or named exports!`);
    failed++;
  }
}

console.log("\n=======================================================");
console.log(`Audit Summary: ${passed} PASSED, ${failed} FAILED`);
console.log("=======================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL ROUTES RESOLVE TO EXISTING COMPONENTS WITH VALID EXPORTS!");
  process.exit(0);
}
