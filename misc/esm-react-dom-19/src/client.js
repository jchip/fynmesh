import ReactDOMClient from "react-dom/client";
import ReactDOMServer from "react-dom";

const CombinedDOM = {
  ...ReactDOMServer,
  ...ReactDOMClient,
};

export { createPortal, flushSync } from "react-dom";

export default CombinedDOM;

console.log("ESM_REACT_DOM_VERSION 19.1.0");
