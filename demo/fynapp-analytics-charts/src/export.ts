/**
 * Export helpers for the chart grid. Loaded only when the user clicks
 * "Export" — never a federation expose, just a plain lazy chunk.
 */

export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;

/** Quotes a field only when it needs it: contains the separator, a quote, or a newline. */
function csvField(value: CsvValue, separator: string): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes(separator) || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Builds an RFC 4180-ish CSV from an array of row objects. Column order comes
 * from `columns` if given, otherwise from the keys of the first row.
 */
export function toCsv(rows: CsvRow[], columns?: string[], separator = ","): string {
  if (rows.length === 0 && !columns) return "";
  const cols = columns ?? Object.keys(rows[0] ?? {});
  const lines = [cols.map((c) => csvField(c, separator)).join(separator)];
  for (const row of rows) {
    lines.push(cols.map((c) => csvField(row[c], separator)).join(separator));
  }
  return lines.join("\r\n");
}

/**
 * Concatenates several named tables into one CSV, each under a `# label`
 * comment line and separated by a blank line — a single download that still
 * reads as more than one series.
 */
export function toMultiTableCsv(tables: Array<{ label: string; rows: CsvRow[]; columns?: string[] }>): string {
  const blocks = tables.map((table) => `# ${table.label}\r\n${toCsv(table.rows, table.columns)}`);
  return blocks.join("\r\n\r\n");
}

export function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Appends a `YYYY-MM-DD_HHmm` stamp to a filename base, before the extension. */
export function stampedFilename(base: string, extension: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${base}_${stamp}.${extension}`;
}

/** Triggers a browser download of `blob` under `filename`, without navigating away. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a tick to start the download before the URL is freed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}

export function downloadCsv(rows: CsvRow[], filename: string, columns?: string[]): void {
  downloadText(toCsv(rows, columns), filename, "text/csv;charset=utf-8");
}

/**
 * Serializes an inline SVG element to a PNG blob by drawing it into a canvas.
 * Used for "save chart as image" — the SVG's own namespace and viewBox travel
 * with it, so the rendered PNG matches what is on screen.
 */
export function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const width = svg.clientWidth || Number(svg.getAttribute("width")) || 300;
  const height = svg.clientHeight || Number(svg.getAttribute("height")) || 150;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const svgText = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error("canvas 2d context unavailable"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob produced no blob"));
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("failed to rasterize chart SVG"));
    };
    image.src = svgUrl;
  });
}

export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const blob = await svgToPngBlob(svg, scale);
  downloadBlob(blob, filename);
}
