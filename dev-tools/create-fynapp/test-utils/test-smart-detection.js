const fs = require("fs");
const path = require("path");
const { RollupConfigManager } = require("../dist/config-ast");

async function testSmartDetection() {
  console.log("🔍 Testing Smart Detection Features\n");

  const testDir = path.join(__dirname, "test-project");

  // Create test project structure
  console.log("=== Setting up test project structure ===");

  // Create directories
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(testDir, "src", "components"), { recursive: true });
  fs.mkdirSync(path.join(testDir, "src", "utils"), { recursive: true });

  // Create package.json with React 18
  const packageJson = {
    name: "test-smart-detection",
    version: "1.0.0",
    dependencies: {
      "esm-react": "^18.3.0",
      "esm-react-dom": "^18.3.0",
    },
    devDependencies: {
      typescript: "^5.0.0",
    },
  };
  fs.writeFileSync(path.join(testDir, "package.json"), JSON.stringify(packageJson, null, 2));

  // Create source files
  fs.writeFileSync(path.join(testDir, "src", "main.ts"), "// Main entry point");
  fs.writeFileSync(path.join(testDir, "src", "App.tsx"), "// React App component");
  fs.writeFileSync(path.join(testDir, "src", "config.ts"), "// App configuration");
  fs.writeFileSync(
    path.join(testDir, "src", "components", "index.ts"),
    "// Components barrel export",
  );
  fs.writeFileSync(path.join(testDir, "src", "utils", "index.ts"), "// Utils barrel export");

  console.log("Created test project structure:");
  console.log("├── package.json (React 18.3.0)");
  console.log("└── src/");
  console.log("    ├── main.ts");
  console.log("    ├── App.tsx");
  console.log("    ├── config.ts");
  console.log("    ├── components/index.ts");
  console.log("    └── utils/index.ts");

  // Test 1: Smart detection with React project
  console.log("\n=== Test 1: Smart Detection for React Project ===");

  const configContent = RollupConfigManager.generateFynAppConfig({
    appName: "smart-react-app",
    framework: "react",
    projectDir: testDir,
  });

  console.log("Generated config with smart detection:");
  console.log(configContent);

  // Test 2: Different React version
  console.log("\n" + "=".repeat(60));
  console.log("=== Test 2: Different React Version Detection ===");

  const packageJsonReact19 = {
    ...packageJson,
    dependencies: {
      "esm-react": "^19.1.0",
      "esm-react-dom": "^19.1.0",
    },
  };
  fs.writeFileSync(path.join(testDir, "package.json"), JSON.stringify(packageJsonReact19, null, 2));

  const configReact19 = RollupConfigManager.generateFynAppConfig({
    appName: "react19-app",
    framework: "react",
    projectDir: testDir,
  });

  console.log("Generated config with React 19:");
  console.log(configReact19);

  // Test 3: Vue project structure
  console.log("\n" + "=".repeat(60));
  console.log("=== Test 3: Vue Project Structure ===");

  // Add Vue-specific files
  fs.writeFileSync(path.join(testDir, "src", "App.vue"), "<!-- Vue App component -->");

  const vueConfig = RollupConfigManager.generateFynAppConfig({
    appName: "vue-app",
    framework: "vue",
    projectDir: testDir,
  });

  console.log("Generated Vue config:");
  console.log(vueConfig);

  // Test 4: Missing files (minimal structure)
  console.log("\n" + "=".repeat(60));
  console.log("=== Test 4: Minimal Project Structure ===");

  const minimalDir = path.join(__dirname, "minimal-project");
  fs.mkdirSync(minimalDir, { recursive: true });
  fs.mkdirSync(path.join(minimalDir, "src"), { recursive: true });

  // Only create main.ts
  fs.writeFileSync(path.join(minimalDir, "src", "main.ts"), "// Minimal main file");

  const minimalConfig = RollupConfigManager.generateFynAppConfig({
    appName: "minimal-app",
    framework: "react",
    projectDir: minimalDir,
  });

  console.log("Generated minimal config:");
  console.log(minimalConfig);

  console.log("\n✅ Smart detection tests completed!");

  // Clean up
  setTimeout(() => {
    const rmDir = (dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };

    rmDir(testDir);
    rmDir(minimalDir);
    console.log("🧹 Cleaned up test directories");
  }, 2000);
}

testSmartDetection().catch(console.error);
