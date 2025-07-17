import React from "react";
import type { ComponentLibrary } from "./components";
interface AppProps {
    appName: string;
    components: ComponentLibrary;
    middlewareConfig?: {
        count: number;
    };
    runtime?: any;
}
declare const App: React.FC<AppProps>;
export default App;
