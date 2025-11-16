import { load, exec } from "@xarc/run";
import * as fs from "node:fs";

load({
    "clone-fed": {
        desc: "Clone the federation repository",
        task: async () => {
            return fs.existsSync("rollup-federation") ||
                exec("git clone https://github.com/jchip/rollup-federation.git");
        }
    }
});

