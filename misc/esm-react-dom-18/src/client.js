import ReactDOMClient from "react-dom/client";
import ReactDOMServer from "react-dom";

const CombinedDOM = {
  ...ReactDOMServer,
  ...ReactDOMClient,
};

export default CombinedDOM;

console.log("ESM_REACT_DOM_VERSION 18.3.1");

export { createPortal, flushSync } from "react-dom";
