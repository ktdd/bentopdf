import { createImagesToPdfHandler } from "./src/images-to-pdf";
import { imagesToPdfWithMuPDF } from "./src/mupdf-images-to-pdf";
import { decryptWithMuPDF, rasterizeWithMuPDF } from "./src/mupdf-routes";
import { loadImagePdfEngine } from "./src/pymupdf-engine";
import { createPyMuPDFQueue } from "./src/pymupdf-queue";
import { createPyMuPDFHandlers } from "./src/pymupdf-routes";

console.log("Loading PyMuPDF...");
await loadImagePdfEngine();
const queue = createPyMuPDFQueue();
const imagesToPdf = createImagesToPdfHandler(loadImagePdfEngine, queue);
const mupdfImagesToPdf = createImagesToPdfHandler(async () => ({ imagesToPdf: imagesToPdfWithMuPDF }));
const pymupdf = createPyMuPDFHandlers(loadImagePdfEngine, queue);

Bun.serve({
    port: 6999,
    routes: {
        "/api/images-to-pdf": { POST: imagesToPdf },
        "/api/mupdf-images-to-pdf": { POST: mupdfImagesToPdf },
        "/api/rasterize-pdf": { POST: pymupdf.rasterize },
        "/api/decrypt-pdf": { POST: pymupdf.decrypt },
        "/api/mupdf-rasterize-pdf": { POST: rasterizeWithMuPDF },
        "/api/mupdf-decrypt-pdf": { POST: decryptWithMuPDF },
    },
    fetch(req) {
        if (req.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                },
            });
        }
        return new Response("Not Found", { status: 404 });
    },
    /*
    websocket: {
        idleTimeout: 120,
        sendPings: true,
    },
    */
});

console.log("Server running");
