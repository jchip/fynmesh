/**
 * Shared template data for FynMesh demo pages (demo.html, landing.html, shell.html).
 * Centralizes the list of demo FynApps, feature flags, and info cards
 * to keep local development (build-templates.mts) and production site builds
 * (build-demo-site.mts) in sync.
 */

export interface FynAppCard {
    id: string;
    name: string;
    framework: string;
    color: string;
    badge: string;
}

export interface InfoCard {
    icon: string;
    title: string;
    description: string;
    color: string;
}

export interface DemoTemplateDataOptions {
    title?: string;
    isProduction?: boolean;
    pathPrefix?: string;
}

export const DEMO_FYNAPPS: FynAppCard[] = [
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
    {
        id: "fynapp-8-svelte",
        name: "FynApp 8",
        framework: "Svelte",
        color: "fynapp-8",
        badge: "error",
    },
    {
        id: "fynapp-4-vue",
        name: "FynApp 4",
        framework: "Vue",
        color: "fynapp-4",
        badge: "success",
    },
    {
        id: "fynapp-3-marko",
        name: "FynApp 3",
        framework: "Marko",
        color: "fynapp-3",
        badge: "warning",
    },
    {
        id: "fynapp-notes",
        name: "FynApp Notes",
        framework: "React 19",
        color: "fynapp-notes",
        badge: "info",
    },
];

export const DEMO_INFO_CARDS: InfoCard[] = [
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
        description:
            "Support for React, Vue, Preact, Solid, Svelte, and Marko frameworks running together.",
        color: "success",
    },
];

export const DEMO_FEATURES: Record<string, boolean> = {
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
    "fynapp-8-svelte": true,
    "fynapp-notes": true,
    "design-tokens": true,
};

export function getDemoTemplateData(options: DemoTemplateDataOptions = {}) {
    const {
        title = "FynMesh Micro Frontend Demo",
        isProduction = false,
        pathPrefix = "/",
    } = options;

    return {
        title,
        isProduction,
        pathPrefix,
        features: { ...DEMO_FEATURES },
        fynApps: [...DEMO_FYNAPPS],
        infoCards: [...DEMO_INFO_CARDS],
    };
}
