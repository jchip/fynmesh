
(function (Federation){
//
var _container = Federation._mfContainer(
  'fynapp-7-solid', // container name
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
        _container._S('solid-js', {"singleton":true,"requiredVersion":"^1.8.15"},
        [
        // solid-js
        [[_f('./dev-DC79LFD2.js'), "1.9.6"]]]);
        // container._E => addExpose
        // ./src/main.js
        _container._E("./main", _f('./main-y1pVxfkv.js'));

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
//# sourceMappingURL=__mf_container_fynapp-7-solid.js.map
