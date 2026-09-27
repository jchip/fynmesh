/**
 * Serve the built demo site with a fixed delay on every response.
 *
 * Measuring load performance on localhost hides every round trip: a request
 * costs about 0 ms, so a serial waterfall and a parallel fetch look the same.
 * The delay stands in for network latency, identically for every request, so
 * the Perf Lab's modes can be compared (notes/PERF-LAB-DESIGN.md).
 *
 * Responses are `no-store`, so every page load is cold. Clean urls resolve the
 * way Cloudflare Pages resolves them: `/shell` serves `shell.html`.
 *
 * Plain HTTP/1.1, so a browser opens at most 6 connections to it. The live
 * site's HTTP/2 has no such cap.
 *
 * usage: node scripts/serve-site-delayed.mts [port=4600] [delayMs=80] [root=../../.temp/docs]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";

const port = Number(process.argv[2] || 4600);
const delay = Number(process.argv[3] || 80);
const root = path.resolve(process.argv[4] || path.join(import.meta.dirname, "../../../.temp/docs"));

const TYPES: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".css": "text/css",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
};

/** the file a url path names, trying `<path>.html` for a clean url */
async function resolveFile(urlPath: string): Promise<string> {
    const file = path.join(root, urlPath.endsWith("/") ? `${urlPath}index.html` : urlPath);
    try {
        if ((await stat(file)).isFile()) return file;
    } catch {}
    return `${file}.html`;
}

createServer(async (req, res) => {
    const file = await resolveFile(decodeURIComponent(new URL(req.url || "/", "http://x").pathname));
    setTimeout(async () => {
        try {
            const body = await readFile(file);
            res.writeHead(200, {
                "content-type": TYPES[path.extname(file)] || "application/octet-stream",
                "cache-control": "no-store",
            });
            res.end(body);
        } catch {
            res.writeHead(404).end();
        }
    }, delay);
}).listen(port, () => {
    console.log(`serving ${root} at http://localhost:${port} with ${delay} ms per response`);
});
