
/*
exports: getInfo
facadeModuleId: /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/getInfo.ts
moduleIds: /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/getInfo.ts
dynamicImports: 
fileName: getInfo-2LmwbDQd.js
imports: 
isEntry: false
*/
(function (Federation){
//
var System = Federation._mfBind(
  {
    n: 'getInfo', // chunk name
    f: 'getInfo-2LmwbDQd.js', // chunk fileName
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

            exports("getInfo", getInfo);

            function getInfo() {
                return {
                    name: 'fynapp-1',
                    version: '1.0.0',
                    timestamp: new Date().toISOString()
                };
            }

        })
    };
}));

})(globalThis.Federation);
//# sourceMappingURL=getInfo-2LmwbDQd.js.map
