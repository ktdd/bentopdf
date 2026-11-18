import { resolve, sep } from "node:path";
import { PyMuPDF } from "../pymupdf/dist/index.js";
import { pyodideAssetPath } from "./pymupdf-paths";

const assetDirectory = resolve(import.meta.dir, "../pymupdf/assets");

const BasePyMuPDF = PyMuPDF as typeof import("../pymupdf/types/index").PyMuPDF;

class ServerPyMuPDF extends BasePyMuPDF {
    getAssetPath(name: string): string {
        return pyodideAssetPath(assetDirectory, name);
    }
}

let enginePromise: Promise<ServerPyMuPDF> | null = null;

export function loadImagePdfEngine(): Promise<ServerPyMuPDF> {
    if (!enginePromise) {
        const engine = new ServerPyMuPDF({ assetPath: assetDirectory + sep });
        enginePromise = engine
            .load()
            .then(() => engine)
            .catch((error: unknown) => {
                enginePromise = null;
                throw error;
            });
    }
    return enginePromise;
}
