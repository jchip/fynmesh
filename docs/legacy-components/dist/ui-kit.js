define(["react"], (__WEBPACK_EXTERNAL_MODULE_esm_react__) => { return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "esm-react"
/*!************************!*\
  !*** external "react" ***!
  \************************/
(module) {

module.exports = __WEBPACK_EXTERNAL_MODULE_esm_react__;

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	const __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		const cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		const module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			const e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	// define getter/value functions for harmony exports
/******/ 	__webpack_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop));
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = (exports) => {
/******/ 		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/ 	
/************************************************************************/
let __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!*******************************************!*\
  !*** ./node_modules/ui-kit/dist/index.js ***!
  \*******************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Button: () => (/* binding */ Button),
/* harmony export */   Card: () => (/* binding */ Card),
/* harmony export */   UI_KIT_VERSION: () => (/* binding */ UI_KIT_VERSION)
/* harmony export */ });
/* harmony import */ var esm_react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! esm-react */ "esm-react");

const UI_KIT_VERSION = "1.4.0";
function Button({ onClick, children }) {
  return /* @__PURE__ */ esm_react__WEBPACK_IMPORTED_MODULE_0__.createElement(
    "button",
    {
      onClick,
      style: { padding: "6px 14px", border: "none", borderRadius: 4, background: "#2255cc", color: "#fff", cursor: "pointer" }
    },
    children
  );
}
function Card({ title, children }) {
  return /* @__PURE__ */ esm_react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", { style: { border: "1px solid #999", borderRadius: 6, padding: 12, margin: 8, maxWidth: 360 } }, /* @__PURE__ */ esm_react__WEBPACK_IMPORTED_MODULE_0__.createElement("h3", { style: { margin: "0 0 8px" } }, title), children);
}


})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});;