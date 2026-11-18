import { createPyMuPDFQueue, type PyMuPDFQueue } from "./pymupdf-queue";

export interface ImagePdfEngine {
    imagesToPdf: (images: File[]) => Promise<Blob>;
}

// PyMuPDF's imagesToPdf uses shared paths and globals, so jobs must not overlap.
export function createImagesToPdfHandler(
    loadEngine: () => Promise<ImagePdfEngine>,
    enqueue: PyMuPDFQueue = createPyMuPDFQueue(),
) {
    return async (request: Request): Promise<Response> => {
        let form: FormData | undefined = undefined;
        try {
            form = await request.formData();
        } catch {
            return Response.json({ error: "Expected a multipart form upload." }, { status: 400 });
        }

        const images = form.getAll("images");
        if (images.length === 0 || images.some((image) => !(image instanceof File) || image.size === 0)) {
            return Response.json({ error: "Select at least one non-empty image." }, { status: 400 });
        }

        const conversion = enqueue(async () => {
            const engine = await loadEngine();
            return engine.imagesToPdf(images as File[]);
        });

        try {
            const pdf = await conversion;
            return new Response(pdf, {
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": 'attachment; filename="images_to_pdf.pdf"',
                    "Cache-Control": "no-store",
                },
            });
        } catch (error) {
            console.error("[Images to PDF] Conversion failed:", error);
            return Response.json({ error: "Failed to convert images to PDF." }, { status: 500 });
        }
    };
}
