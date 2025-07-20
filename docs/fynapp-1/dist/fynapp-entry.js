
/*
exports: config,container,get,init
facadeModuleId: \0_mf_container_fynapp-1
moduleIds: /Users/jchen26/dev/fynmesh/demo/fynapp-1/src/config.ts
  \0_mf_container_fynapp-1
dynamicImports: esm-react
  esm-react-dom
  main-COGvL4BT.js
  hello-CvCGD_S0.js
  getInfo-2LmwbDQd.js
  App-D_vs7PXJ.js
fileName: __mf_container_fynapp-1.js
imports: 
isEntry: true
*/
(function (Federation){
//
var _container = Federation._mfContainer(
  'fynapp-1', // container name
  'fynmesh', // share scope name
  '1.0.0' // container version
);
//
var System = _container;

System.register([], (function (exports, module) {
    'use strict';
    return {
        execute: (function () {

            exports({
                get: get,
                init: init
            });

            /**
             * FynApp Configuration
             * This file can be used for any app-specific configuration
             * It's imported into the federation entry module and exported as `config`
             */
            var config = exports("config", {
                // App-specific configuration can go here
                // Middleware configuration has been moved to main.ts
                sample: "some config sample",
            });

            console.log('fynapp-1 entry header');

            function init(_shareScope) {
              // replaces dynamic import to get the import id
              var _f = function(_id) {
                return {
                  id: _id,
                  // in case dynamic import adds .then to get exports
                  then: function () {return this;}
                }
              };

              var _ss = _container._mfInit(_shareScope);
              if (!_ss) return _container.$SS;

              // container._S => addShare
              _container._S('esm-react', {"singleton":false,"requiredVersion":"^19.0.0","import":false},
              [
              // esm-react
              [[_f('esm-react'), ""]]]);
              _container._S('esm-react-dom', {"singleton":false,"requiredVersion":"^19.0.0","import":false},
              [
              // esm-react-dom
              [[_f('esm-react-dom'), ""]]]);
              // container._E => addExpose
              // ./src/main.ts
              _container._E("./main", _f('./main-COGvL4BT.js'));
              // ./src/hello.ts
              _container._E("./hello", _f('./hello-CvCGD_S0.js'));
              // ./src/getInfo.ts
              _container._E("./getInfo", _f('./getInfo-2LmwbDQd.js'));
              // ./src/App.tsx
              _container._E("./App", _f('./App-D_vs7PXJ.js'));

              return _ss;
            }

            function get(name, version, scope) {
              return _container._mfGet(name, version, scope);
            }
            const container = exports("container", _container);

            console.log('fynapp-1 entry footer');

        })
    };
}));

})(globalThis.Federation);
//# sourceMappingURL=__mf_container_fynapp-1.js.map
