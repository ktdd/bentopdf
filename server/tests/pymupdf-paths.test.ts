import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pyodideAssetPath, wheelPath } from "../src/pymupdf-paths";

test("normalizes Windows wheel paths for Pyodide's package loader", () => {
    const path = "K:\\skip\\bentopdf\\server\\pymupdf\\assets\\pymupdf-1.26.3.whl";
    expect(wheelPath(path, "\\")).toBe("K:/skip/bentopdf/server/pymupdf/assets/pymupdf-1.26.3.whl");
    expect(wheelPath("/opt/app/assets/pymupdf-1.26.3.whl", "/")).toBe("/opt/app/assets/pymupdf-1.26.3.whl");
});

test("uses a file URL for the JavaScript module", () => {
    const directory = resolve("server/pymupdf/assets");
    expect(fileURLToPath(pyodideAssetPath(directory, "pyodide.js"))).toBe(resolve(directory, "pyodide.js"));
    expect(pyodideAssetPath(directory, "pymupdf-1.26.3.whl")).not.toContain("\\");
});
