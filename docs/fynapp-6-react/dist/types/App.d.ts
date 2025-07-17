import React from 'react';
import './styles.css';
interface AppProps {
    appName: string;
    useCounterContext?: () => any;
}
declare const App: React.FC<AppProps>;
export default App;
