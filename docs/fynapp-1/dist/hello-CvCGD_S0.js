
/*
exports: hello
facadeModuleId: /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/hello.ts
moduleIds: /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/hello.ts
dynamicImports: 
fileName: hello-CvCGD_S0.js
imports: 
isEntry: false
*/
(function (Federation){
//
var System = Federation._mfBind(
  {
    n: 'hello', // chunk name
    f: 'hello-CvCGD_S0.js', // chunk fileName
    c: 'fynapp-1', // federation container name
    s: 'fynmesh', // default scope name
    e: false, // chunk isEntry
    v: '1.0.0' // container version
  },
  // dirs from ids of modules included in the chunk
  // use these to match rvm in container to find required version
  // if this is empty, it means this chunk uses no shared module
  // %nm is token that replaced node_modules
  []
);

System.register([], (function (exports) {
    'use strict';
    return {
        execute: (function () {

            exports("hello", hello);

            function hello() {
                return 'Hello from FynApp 1!';
            }

        })
    };
}));

})(globalThis.Federation);
//# sourceMappingURL=hello-CvCGD_S0.js.map
