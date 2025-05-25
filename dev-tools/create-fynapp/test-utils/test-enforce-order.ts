import fs from 'fs';
import path from 'path';
import { RollupConfigManager } from '../src/config-ast';

function testEnforcePluginOrder(): void {
  console.log('🔧 Testing Plugin Order Enforcement\n');

  const testConfigPath = path.join(__dirname, 'test-wrong-order.mjs');

  // Create a config with WRONG plugin order
  const wrongOrderConfig = `import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";

export default [
  {
    input: ["src/main.ts", "fynapp-entry.js"],
    output: [{ dir: "dist", format: "system", sourcemap: true }],
    plugins: [
      // WRONG ORDER: typescript → alias → resolve → terser → federation
      typescript({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
      }),
      alias({
        entries: {
          react: "esm-react",
          "react-dom": "esm-react-dom",
        },
      }),
      resolve({
        exportConditions: ["development"],
      }),
      terser(),
      federation({
        name: "test-app",
        shareScope: "fynmesh",
        filename: "fynapp-entry.js",
        exposes: {},
        remotes: {},
        shared: {},
      }),
    ],
  },
];`;

  // Write the wrong order config
  fs.writeFileSync(testConfigPath, wrongOrderConfig);
  console.log('📝 Created config with WRONG plugin order:');
  console.log('   typescript → alias → resolve → terser → federation');

  // Load and analyze the config
  const manager = new RollupConfigManager(testConfigPath);

  console.log('\n🔍 Analyzing current plugin order...');

  // Show current order before enforcement
  const beforeContent = fs.readFileSync(testConfigPath, 'utf8');
  const beforeOrder = extractPluginOrder(beforeContent);
  console.log('❌ Current order:', beforeOrder.join(' → '));

  // Enforce correct plugin order
  console.log('\n🔧 Enforcing correct plugin order...');
  const orderChanged = manager.enforcePluginOrder();

  if (orderChanged) {
    // Save the corrected config
    manager.save();

    // Show the corrected order
    const afterContent = fs.readFileSync(testConfigPath, 'utf8');
    const afterOrder = extractPluginOrder(afterContent);
    console.log('✅ Corrected order:', afterOrder.join(' → '));

    // Verify it matches expected order
    const expectedOrder = ['resolve', 'federation', 'alias', 'typescript', 'terser'];
    const isCorrect = afterOrder.every((plugin, index) => plugin === expectedOrder[index]);

    if (isCorrect) {
      console.log('🎯 Perfect! Plugin order is now correct.');
    } else {
      console.log('❌ Something went wrong with the ordering.');
    }
  }

  // Test with already correct order
  console.log('\n🔄 Testing with already correct order...');
  const alreadyCorrectManager = new RollupConfigManager(testConfigPath);
  const noChangeNeeded = alreadyCorrectManager.enforcePluginOrder();

  if (!noChangeNeeded) {
    console.log('✅ No changes needed - order was already correct');
  }

  // Show the final corrected config
  console.log('\n📋 Final corrected config:');
  const finalConfig = fs.readFileSync(testConfigPath, 'utf8');
  console.log(finalConfig);

  // Clean up
  setTimeout(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
      console.log('\n🧹 Cleaned up test file');
    }
  }, 1000);
}

function extractPluginOrder(config: string): string[] {
  const plugins: string[] = [];

  // Extract plugin calls in the order they appear
  const lines = config.split('\n');
  for (const line of lines) {
    if (line.includes('resolve(')) plugins.push('resolve');
    else if (line.includes('federation(')) plugins.push('federation');
    else if (line.includes('alias(')) plugins.push('alias');
    else if (line.includes('typescript(')) plugins.push('typescript');
    else if (line.includes('terser(')) plugins.push('terser');
  }

  return plugins;
}

testEnforcePluginOrder();
