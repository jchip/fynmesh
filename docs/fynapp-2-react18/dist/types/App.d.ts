import React from "react";
import type { ComponentLibrary } from "./components";
import type { FynModuleRuntime } from "@fynmesh/kernel";
interface AppProps {
    appName: string;
    components: ComponentLibrary;
    middlewareConfig?: any;
    runtime?: FynModuleRuntime;
}
declare const App: React.FC<AppProps>;
export default App;
