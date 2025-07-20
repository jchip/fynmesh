
/*
exports: default
facadeModuleId: /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/App.tsx
moduleIds: /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/App.tsx
dynamicImports: 
fileName: App-D_vs7PXJ.js
imports: esm-react
isEntry: false
*/
(function (Federation){
//
var System = Federation._mfBind(
  {
    n: 'App', // chunk name
    f: 'App-D_vs7PXJ.js', // chunk fileName
    c: 'fynapp-1', // federation container name
    s: 'fynmesh', // default scope name
    e: false, // chunk isEntry
    v: '1.0.0' // container version
  },
  // dirs from ids of modules included in the chunk
  // use these to match rvm in container to find required version
  // if this is empty, it means this chunk uses no shared module
  // %nm is token that replaced node_modules
  ["src"]
);

System.register(['esm-react'], (function (exports) {
    'use strict';
    var useState, useEffect, React;
    return {
        setters: [function (module) {
            useState = module.useState;
            useEffect = module.useEffect;
            React = module.default;
        }],
        execute: (function () {

            const App = exports("default", ({ appName, components, middlewareConfig, runtime, }) => {
                // Use local state for reactivity, but sync with middleware context
                const [counter, setCounter] = useState({
                    count: middlewareConfig?.count || 0,
                });
                // Theme state management
                const [currentTheme, setCurrentTheme] = useState("fynmesh-default");
                const [availableThemes, setAvailableThemes] = useState([]);
                const [applyGlobally, setApplyGlobally] = useState(false);
                const [acceptGlobally, setAcceptGlobally] = useState(false);
                // Available themes
                const themeOptions = [
                    { value: "fynmesh-default", label: "Default" },
                    { value: "fynmesh-dark", label: "Dark" },
                    { value: "fynmesh-blue", label: "Blue" },
                    { value: "fynmesh-green", label: "Green" },
                    { value: "fynmesh-purple", label: "Purple" },
                    { value: "fynmesh-sunset", label: "Sunset" },
                    { value: "fynmesh-cyberpunk", label: "Cyberpunk" },
                ];
                // Function to get the shared data object from middleware context
                const getSharedDataObject = () => {
                    if (runtime?.middlewareContext) {
                        const basicCounterData = runtime.middlewareContext.get("basic-counter");
                        return basicCounterData; // Return the actual object, not a copy
                    }
                    return null;
                };
                // Function to read current count from the shared data object
                const readCountFromSharedData = () => {
                    const sharedData = getSharedDataObject();
                    return sharedData?.config?.count || middlewareConfig?.count || 0;
                };
                // Set up event listener for counter changes from other apps
                useEffect(() => {
                    const syncWithSharedData = () => {
                        const sharedCount = readCountFromSharedData();
                        setCounter({ count: sharedCount });
                    };
                    // Initial sync
                    syncWithSharedData();
                    // Set up event listener for changes from other apps
                    const handleCounterChange = (event) => {
                        const { count, source } = event.detail;
                        if (source !== runtime?.fynApp?.name) {
                            // Only update if the change came from a different app
                            setCounter({ count });
                            console.debug(`🔄 fynapp-1: Received counter update from ${source}:`, count);
                        }
                    };
                    const sharedData = getSharedDataObject();
                    if (sharedData?.eventTarget) {
                        sharedData.eventTarget.addEventListener("counterChanged", handleCounterChange);
                        return () => {
                            sharedData.eventTarget.removeEventListener("counterChanged", handleCounterChange);
                        };
                    }
                }, [runtime, middlewareConfig]);
                // Set up design tokens and theme management
                useEffect(() => {
                    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
                    if (designTokensData?.api) {
                        const api = designTokensData.api;
                        // Initialize current theme
                        const currentTheme = api.getTheme();
                        setCurrentTheme(currentTheme);
                        // Initialize accept globally from API (this is shared state)
                        const globalOptIn = api.getGlobalOptIn();
                        setAcceptGlobally(globalOptIn);
                        // Initialize apply globally from localStorage (this is local state)
                        const applyGloballyKey = `fynapp-${runtime?.fynApp?.name}-apply-globally`;
                        const savedApplyGlobally = localStorage.getItem(applyGloballyKey);
                        setApplyGlobally(savedApplyGlobally === 'true');
                        // Subscribe to theme changes
                        const unsubscribe = api.subscribeToThemeChanges((theme, tokens, fynAppName) => {
                            // Only update if:
                            // 1. The change is specifically for this app, OR
                            // 2. The change is global AND this app accepts global changes
                            if (fynAppName === runtime?.fynApp?.name || (!fynAppName && api.getGlobalOptIn())) {
                                setCurrentTheme(theme);
                                console.debug(`🎨 fynapp-1: Theme changed to ${theme}${fynAppName ? ` for ${fynAppName}` : ' globally'}`);
                            }
                        });
                        return unsubscribe;
                    }
                }, [runtime]);
                // Destructure the components
                const { Button, Card, Input, Badge, Spinner } = components;
                const handleIncrement = () => {
                    const sharedData = getSharedDataObject();
                    if (sharedData?.increment) {
                        const newCount = sharedData.increment(runtime?.fynApp?.name);
                        // Update local state for immediate UI response
                        setCounter({ count: newCount });
                    }
                };
                const handleReset = () => {
                    const sharedData = getSharedDataObject();
                    if (sharedData?.reset) {
                        const newCount = sharedData.reset(runtime?.fynApp?.name);
                        // Update local state for immediate UI response
                        setCounter({ count: newCount });
                    }
                };
                // Theme switching function
                const handleThemeChange = (theme) => {
                    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
                    if (designTokensData?.api) {
                        const api = designTokensData.api;
                        if (applyGlobally) {
                            // Apply globally
                            api.setTheme(theme, true);
                            console.debug(`🎨 fynapp-1: Switching to theme ${theme} globally`);
                            // If we're applying globally but not accepting globally (G/L scenario),
                            // we need to apply the theme to ourselves locally as well
                            if (!acceptGlobally) {
                                api.setTheme(theme, false);
                                console.debug(`🎨 fynapp-1: Also applying theme ${theme} locally (G/L scenario)`);
                            }
                        }
                        else {
                            // Apply locally only
                            api.setTheme(theme, false);
                            console.debug(`🎨 fynapp-1: Switching to theme ${theme} locally`);
                        }
                    }
                };
                // Handle apply globally toggle
                const handleApplyGloballyChange = (apply) => {
                    setApplyGlobally(apply);
                    // Persist to localStorage (this is local state per app)
                    const applyGloballyKey = `fynapp-${runtime?.fynApp?.name}-apply-globally`;
                    localStorage.setItem(applyGloballyKey, apply.toString());
                    console.debug(`🎨 fynapp-1: ${apply ? 'Enabled' : 'Disabled'} apply globally`);
                };
                // Handle accept globally toggle
                const handleAcceptGloballyChange = (accept) => {
                    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
                    if (designTokensData?.api) {
                        designTokensData.api.setGlobalOptIn(accept);
                        setAcceptGlobally(accept);
                        console.debug(`🎨 fynapp-1: ${accept ? 'Enabled' : 'Disabled'} accept global changes`);
                    }
                };
                // Demo state
                const [inputValue, setInputValue] = useState("");
                const [inputError, setInputError] = useState("");
                const handleInputSubmit = () => {
                    if (!inputValue.trim()) {
                        setInputError("Please enter some text");
                        return;
                    }
                    setInputError("");
                    alert(`You entered: ${inputValue}`);
                    setInputValue("");
                };
                return (React.createElement("div", { style: { padding: "20px", fontFamily: "Arial, sans-serif" } },
                    React.createElement("h2", null,
                        appName,
                        ": React ",
                        React.version),
                    React.createElement(Card, { title: "\uD83C\uDFA8 Design Tokens Theme Selection", className: "mb-6" },
                        React.createElement("div", { className: "mb-4 space-y-2" },
                            React.createElement("label", { className: "flex items-center gap-2 text-sm" },
                                React.createElement("input", { type: "checkbox", checked: applyGlobally, onChange: (e) => handleApplyGloballyChange(e.target.checked), className: "w-4 h-4" }),
                                React.createElement("span", null, "Apply globally (affects all fynapp instances)")),
                            React.createElement("label", { className: "flex items-center gap-2 text-sm" },
                                React.createElement("input", { type: "checkbox", checked: acceptGlobally, onChange: (e) => handleAcceptGloballyChange(e.target.checked), className: "w-4 h-4" }),
                                React.createElement("span", null, "Accept changes globally (from other apps)"))),
                        React.createElement("div", { className: "flex flex-wrap gap-2 mb-4" }, themeOptions.map((theme) => (React.createElement(Button, { key: theme.value, variant: currentTheme === theme.value ? "primary" : "outline", size: "small", onClick: () => handleThemeChange(theme.value) }, theme.label)))),
                        React.createElement("div", { className: "text-sm text-gray-600" },
                            "Current theme: ",
                            React.createElement("strong", null, currentTheme),
                            React.createElement("br", null),
                            "Apply scope: ",
                            React.createElement("strong", null, applyGlobally ? "Global" : "Local"),
                            React.createElement("br", null),
                            "Accept scope: ",
                            React.createElement("strong", null, acceptGlobally ? "Global" : "Local"))),
                    React.createElement(Card, { title: "\uD83C\uDFA8 fynapp-x1 Components Demo", className: "mb-6" },
                        React.createElement("div", { className: "mb-6" },
                            React.createElement("h3", { className: "text-lg font-semibold mb-3" }, "Buttons"),
                            React.createElement("div", { className: "flex flex-wrap gap-2 mb-3" },
                                React.createElement(Button, { variant: "primary", size: "small" }, "Primary Small"),
                                React.createElement(Button, { variant: "secondary", size: "medium" }, "Secondary Medium"),
                                React.createElement(Button, { variant: "outline", size: "large" }, "Outline Large"),
                                React.createElement(Button, { variant: "danger", size: "medium" }, "Danger"),
                                React.createElement(Button, { variant: "primary", size: "medium", isLoading: true }, "Loading..."))),
                        React.createElement("div", { className: "mb-6" },
                            React.createElement("h3", { className: "text-lg font-semibold mb-3" }, "Badges"),
                            React.createElement("div", { className: "flex flex-wrap gap-2 mb-3" },
                                React.createElement(Badge, { variant: "default" }, "Default"),
                                React.createElement(Badge, { variant: "primary" }, "Primary"),
                                React.createElement(Badge, { variant: "success" }, "Success"),
                                React.createElement(Badge, { variant: "warning" }, "Warning"),
                                React.createElement(Badge, { variant: "danger" }, "Danger"))),
                        React.createElement("div", { className: "mb-6" },
                            React.createElement("h3", { className: "text-lg font-semibold mb-3" }, "Spinners"),
                            React.createElement("div", { className: "flex items-center gap-4 mb-3" },
                                React.createElement("div", { className: "flex items-center gap-2" },
                                    React.createElement(Spinner, { size: "small", color: "primary" }),
                                    React.createElement("span", null, "Small")),
                                React.createElement("div", { className: "flex items-center gap-2" },
                                    React.createElement(Spinner, { size: "medium", color: "gray" }),
                                    React.createElement("span", null, "Medium")),
                                React.createElement("div", { className: "flex items-center gap-2" },
                                    React.createElement(Spinner, { size: "large", color: "primary" }),
                                    React.createElement("span", null, "Large")))),
                        React.createElement("div", { className: "mb-6" },
                            React.createElement("h3", { className: "text-lg font-semibold mb-3" }, "Input"),
                            React.createElement("div", { className: "max-w-md" },
                                React.createElement(Input, { label: "Demo Input", placeholder: "Type something...", value: inputValue, onChange: (e) => setInputValue(e.target.value), error: inputError, helperText: "This is a helper text" }),
                                React.createElement(Button, { onClick: handleInputSubmit, variant: "primary", size: "medium" }, "Submit Input")))),
                    React.createElement(Card, { className: "mb-6" },
                        React.createElement("h2", { className: "text-xl font-bold mb-4 text-center" }, "Shared Counter (Provider)"),
                        React.createElement("div", { className: "flex items-center justify-center gap-4" },
                            React.createElement("div", { className: "text-3xl font-bold text-blue-600 min-w-16 text-center" }, counter.count),
                            React.createElement(Button, { onClick: handleIncrement, variant: "primary", size: "medium" }, "Increment"),
                            React.createElement(Button, { onClick: handleReset, variant: "danger", size: "medium" }, "Reset")))));
            });

        })
    };
}));

})(globalThis.Federation);
//# sourceMappingURL=App-D_vs7PXJ.js.map
