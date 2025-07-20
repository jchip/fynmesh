
(function (Federation){
//
var System = Federation._mfBind(
  {
    n: 'index', // chunk name
    f: 'index.js', // chunk fileName
    c: 'fynapp-react-lib', // federation container name
    s: 'fynmesh', // default scope name
    e: true, // chunk isEntry
    v: '19.1.0' // container version
  },
  // dirs from ids of modules included in the chunk
  // use these to match rvm in container to find required version
  // if this is empty, it means this chunk uses no shared module
  // %nm is token that replaced node_modules
  ["src"]
);

System.register(['./react-esm-19.development-BgERzBs9.js'], (function (exports) {
	'use strict';
	return {
		setters: [function (module) {
			exports("React", module.default);
		}],
		execute: (function () {



		})
	};
}));

})(globalThis.Federation);
//# sourceMappingURL=index.js.map
