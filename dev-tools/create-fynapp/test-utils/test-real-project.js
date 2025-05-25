const fs = require("fs");
const path = require("path");
const { RollupConfigManager } = require("../dist/config-ast");

async function testRealProject() {
  console.log("🏗️  Testing Smart Detection with Real FynApp Project\n");

  // Test with actual fynapp-x1 project
  const fynappX1Path = path.resolve(__dirname, "../../../demo/fynapp-x1");

  if (!fs.existsSync(fynappX1Path)) {
    console.log("❌ fynapp-x1 project not found at:", fynappX1Path);
    console.log("This test requires the fynapp-x1 project to exist in the monorepo");
    return;
  }

  console.log("✅ Found fynapp-x1 project at:", fynappX1Path);

  // Check what files exist in the project
  console.log("\n=== Analyzing fynapp-x1 project structure ===");

  const srcDir = path.join(fynappX1Path, "src");
  if (fs.existsSync(srcDir)) {
    console.log("📁 src/ directory contents:");
    const srcFiles = fs.readdirSync(srcDir);
    srcFiles.forEach((file) => {
      const filePath = path.join(srcDir, file);
      const isDir = fs.statSync(filePath).isDirectory();
      console.log(`  ${isDir ? "📁" : "📄"} ${file}`);

      if (isDir) {
        const subFiles = fs.readdirSync(filePath);
        subFiles.slice(0, 3).forEach((subFile) => {
          console.log(`    📄 ${subFile}`);
        });
        if (subFiles.length > 3) {
          console.log(`    ... and ${subFiles.length - 3} more files`);
        }
      }
    });
  }

  // Check package.json
  const packageJsonPath = path.join(fynappX1Path, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    console.log("\n📦 package.json info:");
    console.log(`  Name: ${packageJson.name}`);
    console.log(`  Version: ${packageJson.version}`);

    if (packageJson.dependencies) {
      console.log("  Dependencies:");
      Object.keys(packageJson.dependencies).forEach((dep) => {
        if (dep.includes("react") || dep.includes("vue") || dep.includes("solid")) {
          console.log(`    ${dep}: ${packageJson.dependencies[dep]}`);
        }
      });
    }

    if (packageJson.devDependencies) {
      console.log("  Dev Dependencies:");
      Object.keys(packageJson.devDependencies).forEach((dep) => {
        if (dep.includes("react") || dep.includes("vue") || dep.includes("solid")) {
          console.log(`    ${dep}: ${packageJson.devDependencies[dep]}`);
        }
      });
    }
  }

  // Generate config with smart detection
  console.log("\n=== Generating config with smart detection ===");

  try {
    const smartConfig = RollupConfigManager.generateFynAppConfig({
      appName: "fynapp-x1-smart",
      framework: "react",
      projectDir: fynappX1Path,
    });

    console.log("🎯 Generated smart config:");
    console.log(smartConfig);

    // Save to a test file
    const testConfigPath = path.join(__dirname, "generated-smart-config.mjs");
    fs.writeFileSync(testConfigPath, smartConfig);
    console.log(`\n💾 Saved generated config to: ${testConfigPath}`);
  } catch (error) {
    console.error("❌ Error generating config:", error.message);
  }

  console.log("\n✅ Real project test completed!");
}

testRealProject().catch(console.error);
