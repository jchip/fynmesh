
(function (Federation){
//
var _container = Federation._mfContainer(
  'fynapp-react-lib', // container name
  'fynmesh', // share scope name
  '18.3.0' // container version
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
        _container._S('esm-react', {"singleton":true,"requiredVersion":"^18.0.0"}, [
          // importee: node_modules/esm-react/src/react-esm-18.development.js
          // from: src
        [[_f('./react-esm-18.development-BZXtcs1e.js'), "18.3.1"],
        ["src", "^18.3.0"]]]);
        _container._S('esm-react-dom', {"singleton":true,"requiredVersion":"^18.0.0"},
        [
        // esm-react-dom
        [[_f('./react-dom-esm-18-client.development-C25NYoBg.js'), "18.3.1"]]]);
        // container._E => addExpose


        return _ss;
      }

      function get(name, version, scope) {
        return _container._mfGet(name, version, scope);
      }
      const container = exports("container", _container);

    })
  };
}));

})(globalThis.Federation);
//# sourceMappingURL=__mf_container_fynapp-react-lib.js.map
