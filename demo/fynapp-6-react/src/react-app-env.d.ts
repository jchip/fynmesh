declare module 'react' {
    import * as React from 'react';
    export = React;
}

declare module 'react-dom' {
    import * as ReactDOM from 'react-dom';
    export = ReactDOM;
}

declare namespace JSX {
    interface IntrinsicElements {
        [elemName: string]: any;
    }
}