import type { PyMuPDF } from "../pymupdf/types/index";
import type { PyMuPDFQueue } from "./pymupdf-queue";

type Engine = Pick<PyMuPDF, "rasterizePdf" | "open">;

class InvalidPassword extends Error {}

function pdfResponse(pdf: Blob): Response {
    return new Response(pdf, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
}

function failure(error: unknown): Response {
    if (error instanceof InvalidPassword) return Response.json({ error: "Invalid PDF password." }, { status: 401 });
    console.error("[PyMuPDF API] Processing failed:", error);
    return Response.json({ error: "PDF processing failed." }, { status: 500 });
}

export function createPyMuPDFHandlers(load: () => Promise<Engine>, enqueue: PyMuPDFQueue) {
    return {
        async rasterize(request: Request): Promise<Response> {
            let form: FormData;
            try {
                form = await request.formData();
            } catch {
                return Response.json({ error: "Expected a multipart form upload." }, { status: 400 });
            }
            const file = form.get("file");
            const dpi = Number(form.get("dpi"));
            const format = form.get("format");
            const grayscale = form.get("grayscale");
            if (
                !(file instanceof File) ||
                !file.size ||
                ![72, 150, 200, 300, 600].includes(dpi) ||
                (format !== "png" && format !== "jpeg") ||
                (grayscale !== "true" && grayscale !== "false")
            ) {
                return Response.json({ error: "Invalid PDF or rasterization options." }, { status: 400 });
            }
            try {
                return pdfResponse(
                    await enqueue(async () =>
                        (await load()).rasterizePdf(file, {
                            dpi,
                            format,
                            grayscale: grayscale === "true",
                            quality: 95,
                        }),
                    ),
                );
            } catch (error) {
                return failure(error);
            }
        },
        async decrypt(request: Request): Promise<Response> {
            let form: FormData;
            try {
                form = await request.formData();
            } catch {
                return Response.json({ error: "Expected a multipart form upload." }, { status: 400 });
            }
            const file = form.get("file");
            const password = form.get("password");
            if (!(file instanceof File) || !file.size || typeof password !== "string") {
                return Response.json({ error: "PDF and password are required." }, { status: 400 });
            }
            try {
                const pdf = await enqueue(async () => {
                    const document = await (await load()).open(file);
                    try {
                        // The bundled wrapper interpolates this value into a Python string literal.
                        // JSON string escaping prevents passwords from escaping that literal.
                        const escapedPassword = JSON.stringify(password).slice(1, -1);
                        if ((document.needsPass || document.isEncrypted) && !document.authenticate(escapedPassword)) {
                            throw new InvalidPassword();
                        }
                        const bytes = document.save();
                        if (!bytes.length) throw new Error("Empty decrypted file");
                        return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
                    } finally {
                        document.close();
                    }
                });
                return pdfResponse(pdf);
            } catch (error) {
                return failure(error);
            }
        },
    };
}
