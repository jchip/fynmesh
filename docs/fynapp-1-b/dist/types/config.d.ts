/**
 * FynApp Configuration and Middleware Setup
 * This module exports configuration for middleware (automatically detected by kernel)
 */
declare const _default: {
    middlewareConfig: {
        "react-context": {
            contexts: {
                counter: {
                    shared: boolean;
                    initialState: {
                        count: number;
                    };
                    actions: {
                        increment: {
                            validator: () => boolean;
                            reducer: (state: any) => any;
                        };
                        reset: {
                            validator: () => boolean;
                            reducer: (state: any) => any;
                        };
                    };
                    persistence: {
                        type: string;
                        key: string;
                    };
                };
            };
        };
    };
};
export default _default;
/**
 * Optional configure function that the kernel can call during config phase
 */
export declare function configure(kernel: any, fynAppEntry: any): void;
