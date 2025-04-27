import ReactDOM from "react-dom/client";

const keys = Object.keys(ReactDOM);
console.log("{\n  " + keys.join(",\n  ") + "\n}");
