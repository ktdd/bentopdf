import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export function wheelPath(path: string, separator = sep): string {
    // Pyodide extracts wheel names using forward slashes, including on Windows.
    return separator === "\\" ? path.replaceAll("\\", "/") : path;
}

export function pyodideAssetPath(directory: string, name: string): string {
    const path = resolve(directory, name);
    return name === "pyodide.js" ? pathToFileURL(path).href : wheelPath(path);
}
