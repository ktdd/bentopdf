import { decryptWithMuPDF, imagesToPdf, rasterizeWithMuPDF } from "./src/mupdf-routes";

Bun.serve({
    port: 6999,
    routes: {
        "/api/images-to-pdf": { POST: imagesToPdf },
        "/api/rasterize-pdf": { POST: rasterizeWithMuPDF },
        "/api/decrypt-pdf": { POST: decryptWithMuPDF },
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
