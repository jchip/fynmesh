const fs = require("fs");
const path = require("path");
const { RollupConfigManager } = require("../dist/config-ast");

// Test configs
const configWithoutFederation = `import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "system",
  },
  plugins: [
    resolve(),
    typescript(),
  ],
};`;

const configWithFederation = `import federation from "rollup-plugin-federation";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "system",
  },
  plugins: [
    federation({
      name: "old-name",
      shareScope: "old-scope",
      shared: {
        "esm-react": {
          singleton: false,
          semver: "^19.0.0",
        },
      },
    }),
    typescript(),
  ],
};`;

const testPackageJson = {
  name: "my-awesome-fynapp",
  version: "1.0.0",
  devDependencies: {
    "rollup-plugin-federation": "^1.0.0",
    typescript: "^5.0.0",
  },
  fyn: {
    devDependencies: {
      "rollup-plugin-federation": "../../rollup-federation/rollup-plugin-federation",
    },
  },
};

async function testFederationManagement() {
  console.log("🧪 Testing Federation Plugin Management\n");

  // Test 1: Adding federation to config without it
  console.log("=== Test 1: Adding Federation Plugin ===");
  const configPath1 = path.join(__dirname, "test-config-1.mjs");
  const packageJsonPath = path.join(__dirname, "test-package.json");

  fs.writeFileSync(configPath1, configWithoutFederation);
  fs.writeFileSync(packageJsonPath, JSON.stringify(testPackageJson, null, 2));

  const manager1 = new RollupConfigManager(configPath1);

  console.log("Original config (no federation):");
  console.log(configWithoutFederation);

  // Check federation dependency
  const depCheck = manager1.checkFederationDependency(packageJsonPath);
  console.log("\nDependency check:", {
    hasDevDep: depCheck.hasDevDep,
    hasFynDep: depCheck.hasFynDep,
    appName: depCheck.packageJson?.name,
  });

  // Ensure federation import and plugin
  manager1.ensureFederationImport();
  manager1.ensureFederationPlugin(packageJsonPath);

  console.log("\nModified config (with federation):");
  const result1 = manager1.generate();
  console.log(result1);

  // Test 2: Updating existing federation config
  console.log("\n" + "=".repeat(50));
  console.log("=== Test 2: Updating Existing Federation Plugin ===");

  const configPath2 = path.join(__dirname, "test-config-2.mjs");
  fs.writeFileSync(configPath2, configWithFederation);

  const manager2 = new RollupConfigManager(configPath2);

  console.log("Original config (with old federation):");
  console.log(configWithFederation);

  // Update federation config
  manager2.ensureFederationPlugin(packageJsonPath);

  // Also update shared dependencies
  manager2.updateSharedDependency("esm-react", {
    singleton: true,
    semver: "^18.3.0",
  });

  manager2.updateSharedDependency("esm-react-dom", {
    singleton: true,
    semver: "^18.3.0",
  });

  console.log("\nUpdated config:");
  const result2 = manager2.generate();
  console.log(result2);

  // Test 3: Complete federation setup
  console.log("\n" + "=".repeat(50));
  console.log("=== Test 3: Complete Federation Setup ===");

  const configPath3 = path.join(__dirname, "test-config-3.mjs");
  fs.writeFileSync(configPath3, configWithoutFederation);

  const manager3 = new RollupConfigManager(configPath3);

  // Complete setup
  manager3.ensureFederationImport();
  manager3.ensureFederationPlugin(packageJsonPath);
  manager3.updateSharedDependency("esm-react", {
    singleton: true,
    semver: "^18.3.0",
  });
  manager3.updateSharedDependency("esm-react-dom", {
    singleton: true,
    semver: "^18.3.0",
  });

  console.log("Complete federation setup:");
  const result3 = manager3.generate();
  console.log(result3);

  // Save example
  manager3.save();
  console.log("\n✅ Complete setup saved to test-config-3.mjs");

  // Clean up
  setTimeout(() => {
    [configPath1, configPath2, configPath3, packageJsonPath].forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
    console.log("🧹 Cleaned up test files");
  }, 2000);
}

testFederationManagement().catch(console.error);
