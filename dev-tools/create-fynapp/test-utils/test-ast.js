// Simple test for our AST config manager
const { RollupConfigManager } = require("../dist/config-ast.js");
const fs = require("fs");
const path = require("path");

// Sample rollup config for testing
const sampleConfig = `import federation from "rollup-plugin-federation";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "system",
  },
  plugins: [
    federation({
      name: "test-app",
      shared: {
        "esm-react": {
          singleton: false,
          requiredVersion: "^19.0.0",
        },
        "esm-react-dom": {
          singleton: false,
          requiredVersion: "^19.0.0",
        },
      },
    }),
  ],
};`;

async function testAST() {
  console.log("Testing AST-based config modification...\n");

  const configPath = path.join(__dirname, "test-config.mjs");

  // Create test config file
  fs.writeFileSync(configPath, sampleConfig);

  console.log("Original config:");
  console.log(sampleConfig);
  console.log("\n" + "=".repeat(50) + "\n");

  try {
    // Create manager and modify config
    const manager = new RollupConfigManager(configPath);

    // Update React to use singleton and React 18
    manager.updateSharedDependency("esm-react", {
      singleton: true,
      requiredVersion: "^18.3.0",
    });

    // Update React DOM as well
    manager.updateSharedDependency("esm-react-dom", {
      singleton: true,
      requiredVersion: "^18.3.0",
    });

    // Add a new dependency
    manager.updateSharedDependency("lodash", {
      singleton: false,
      requiredVersion: "^4.17.21",
    });

    // Generate modified config
    const modifiedConfig = manager.generate();
    console.log("Modified config:");
    console.log(modifiedConfig);

    // Save to a new file for comparison
    const modifiedPath = path.join(__dirname, "test-config-modified.mjs");
    fs.writeFileSync(modifiedPath, modifiedConfig);
    console.log("\nModified config saved to test-config-modified.mjs");

    // Clean up
    setTimeout(() => {
      fs.unlinkSync(configPath);
      fs.unlinkSync(modifiedPath);
      console.log("🧹 Cleaned up test files");
    }, 2000);
  } catch (error) {
    console.error("Error:", error.message);
    // Clean up on error
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  }
}

testAST();
