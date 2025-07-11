#!/usr/bin/env node

const nunjucks = require("nunjucks");
const fs = require("fs");
const path = require("path");

// Configure Nunjucks
const env = nunjucks.configure("templates", {
  autoescape: true,
  noCache: process.env.NODE_ENV !== "production",
});

// Template data
const templateData = {
  title: "FynMesh Micro Frontend Demo",
  isProduction: process.env.NODE_ENV === "production",
  features: {
    "react-18": true,
    "react-19": true,
    "fynapp-1": true,
    "fynapp-1-b": true,
    "fynapp-2-react18": true,
    "fynapp-3-marko": true,
    "fynapp-4-vue": true,
    "fynapp-5-preact": true,
    "fynapp-6-react": true,
    "fynapp-7-solid": true,
    "design-tokens": true,
  },
  fynApps: [
    {
      id: "fynapp-1",
      name: "FynApp 1 (React 19)",
      framework: "React 19",
      color: "fynapp-1",
      badge: "primary",
    },
    {
      id: "fynapp-1-b",
      name: "FynApp 1-B (React 19)",
      framework: "React 19",
      color: "fynapp-1-b",
      badge: "success",
    },
    {
      id: "fynapp-2-react18",
      name: "FynApp 2",
      framework: "React 18",
      color: "fynapp-2",
      badge: "secondary",
    },
    {
      id: "fynapp-6-react",
      name: "FynApp 6",
      framework: "React",
      color: "fynapp-6",
      badge: "info",
    },
    {
      id: "fynapp-5-preact",
      name: "FynApp 5",
      framework: "Preact",
      color: "fynapp-5",
      badge: "warning",
    },
    {
      id: "fynapp-7-solid",
      name: "FynApp 7",
      framework: "Solid",
      color: "fynapp-7",
      badge: "primary",
    },
    { id: "fynapp-4-vue", name: "FynApp 4", framework: "Vue", color: "fynapp-4", badge: "success" },
    {
      id: "fynapp-3-marko",
      name: "FynApp 3",
      framework: "Marko",
      color: "fynapp-3",
      badge: "warning",
    },
  ],
  infoCards: [
    {
      icon: "bi-boxes",
      title: "Independent Deployment",
      description:
        "Each micro-frontend can be developed and deployed independently by different teams.",
      color: "primary",
    },
    {
      icon: "bi-code-square",
      title: "Module Federation",
      description:
        "Share code and dependencies between applications at runtime using Module Federation.",
      color: "secondary",
    },
    {
      icon: "bi-lightning-charge",
      title: "Multi-Framework",
      description: "Support for React, Vue, Preact, Solid, and Marko frameworks running together.",
      color: "success",
    },
  ],
};

// Build the main page
try {
  const html = env.render("pages/index.html", templateData);
  const outputPath = path.join(__dirname, "../public/index.html");
  fs.writeFileSync(outputPath, html);
  console.log("✅ Templates compiled successfully!");
  console.log(`📄 Generated: ${outputPath}`);
} catch (error) {
  console.error("❌ Template compilation failed:", error.message);
  process.exit(1);
}
