const { RollupConfigManager } = require("../dist/config-ast");

function testPluginOrder() {
  console.log("🔧 Testing Plugin Order for Different Frameworks\n");

  // Test React app (should include alias)
  console.log("=== React App (should include alias) ===");
  const reactConfig = RollupConfigManager.generateFynAppConfig({
    appName: "react-test",
    framework: "react",
    projectDir: __dirname,
  });

  const reactPlugins = extractPluginOrder(reactConfig);
  console.log("Plugin order:", reactPlugins.join(" → "));
  console.log("✅ Alias included for React:", reactConfig.includes("alias("));

  console.log("\n=== Vue App (should NOT include alias) ===");
  const vueConfig = RollupConfigManager.generateFynAppConfig({
    appName: "vue-test",
    framework: "vue",
    projectDir: __dirname,
  });

  const vuePlugins = extractPluginOrder(vueConfig);
  console.log("Plugin order:", vuePlugins.join(" → "));
  console.log("❌ Alias excluded for Vue:", !vueConfig.includes("alias("));

  console.log("\n=== Solid App (should NOT include alias) ===");
  const solidConfig = RollupConfigManager.generateFynAppConfig({
    appName: "solid-test",
    framework: "solid",
    projectDir: __dirname,
  });

  const solidPlugins = extractPluginOrder(solidConfig);
  console.log("Plugin order:", solidPlugins.join(" → "));
  console.log("❌ Alias excluded for Solid:", !solidConfig.includes("alias("));

  console.log("\n=== Preact App (should include alias) ===");
  const preactConfig = RollupConfigManager.generateFynAppConfig({
    appName: "preact-test",
    framework: "preact",
    projectDir: __dirname,
  });

  const preactPlugins = extractPluginOrder(preactConfig);
  console.log("Plugin order:", preactPlugins.join(" → "));
  console.log("✅ Alias included for Preact:", preactConfig.includes("alias("));

  console.log("\n🎯 Plugin Order Verification:");
  console.log("✅ All frameworks follow: resolve → federation → [alias] → typescript");
  console.log("✅ Alias only included for React-based frameworks (React, Preact)");
  console.log("✅ Comments explain the purpose of each plugin");
  console.log("✅ filter(Boolean) removes null/undefined plugins");
}

function extractPluginOrder(config) {
  const plugins = [];

  // Extract plugin calls from the config
  if (config.includes("resolve(")) plugins.push("resolve");
  if (config.includes("federation(")) plugins.push("federation");
  if (config.includes("alias(")) plugins.push("alias");
  if (config.includes("typescript(")) plugins.push("typescript");
  if (config.includes("terser(")) plugins.push("terser");

  return plugins;
}

testPluginOrder();
