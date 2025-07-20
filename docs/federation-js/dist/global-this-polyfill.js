// globalThis polyfill
(function ($Object) {
    typeof globalThis !== "object" &&
        (this
            ? get()
            : ($Object.defineProperty($Object.prototype, "_T_", {
                configurable: true,
                get: get,
            }),
                // @ts-ignore
                _T_));
    function get() {
        var global = this || self;
        global.globalThis = global;
        // @ts-ignore
        delete $Object.prototype._T_;
    }
})(Object);
