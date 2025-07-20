
/*
exports: container,get,init
facadeModuleId: \0_mf_container_fynapp-react-middleware
moduleIds: \0_mf_container_fynapp-react-middleware
dynamicImports: esm-react
  esm-react-dom
  main-c47p0ikH.js
  react-context-CVNge9KK.js
fileName: __mf_container_fynapp-react-middleware.js
imports: 
isEntry: true
*/
(function (Federation){
//
var _container = Federation._mfContainer(
  'fynapp-react-middleware', // container name
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

      console.log('fynapp-react-middleware entry header');

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
        _container._E("./main", _f('./main-c47p0ikH.js'));
        // ./src/middleware/react-context.tsx
        _container._E("./middleware/react-context", _f('./react-context-CVNge9KK.js'));

        return _ss;
      }

      function get(name, version, scope) {
        return _container._mfGet(name, version, scope);
      }
      const container = exports("container", _container);

      console.log('fynapp-react-middleware entry footer');

    })
  };
}));

})(globalThis.Federation);
//# sourceMappingURL=__mf_container_fynapp-react-middleware.js.map
