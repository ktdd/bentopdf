import mupdf from "mupdf";

function pdfResponse(buffer: InstanceType<typeof mupdf.Buffer>): Response {
    try {
        const bytes = new Uint8Array(buffer.asUint8Array());
        return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
    } finally {
        buffer.destroy();
    }
}

function failure(error: unknown): Response {
    console.error("[MuPDF API] Processing failed:", error);
    return Response.json({ error: "PDF processing failed." }, { status: 500 });
}

export async function rasterizeWithMuPDF(request: Request): Promise<Response> {
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
    if (!(file instanceof File) || !file.size || ![72, 150, 200, 300, 600].includes(dpi) ||
        (format !== "png" && format !== "jpeg") || (grayscale !== "true" && grayscale !== "false")) {
        return Response.json({ error: "Invalid PDF or rasterization options." }, { status: 400 });
    }

    try {
        const source = mupdf.Document.openDocument(new Uint8Array(await file.arrayBuffer()), "application/pdf");
        try {
            if (!source.isPDF()) throw new Error("Input is not a PDF");
            if (source.needsPassword()) throw new Error("PDF requires a password");
            const output = new mupdf.PDFDocument();
            try {
                const count = source.countPages();
                for (let i = 0; i < count; i++) {
                    const page = source.loadPage(i);
                    try {
                        const bounds = page.getBounds();
                        const width = bounds[2] - bounds[0];
                        const height = bounds[3] - bounds[1];
                        const scale = dpi / 72;
                        const colorspace = grayscale === "true" ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB;
                        const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), colorspace, false);
                        try {
                            const imageBytes = format === "jpeg" ? pixmap.asJPEG(95) : pixmap.asPNG();
                            const image = new mupdf.Image(imageBytes);
                            try {
                                const imageRef = output.addImage(image);
                                try {
                                    const newPage = output.addPage(
                                        [0, 0, width, height], 0, { XObject: { Image: imageRef } },
                                        `q ${width} 0 0 ${height} 0 0 cm /Image Do Q`,
                                    );
                                    try { output.insertPage(-1, newPage); } finally { newPage.destroy(); }
                                } finally { imageRef.destroy(); }
                            } finally { image.destroy(); }
                        } finally { pixmap.destroy(); }
                    } finally { page.destroy(); }
                }
                return pdfResponse(output.saveToBuffer("compress"));
            } finally { output.destroy(); }
        } finally { source.destroy(); }
    } catch (error) { return failure(error); }
}

export async function decryptWithMuPDF(request: Request): Promise<Response> {
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
        const document = mupdf.Document.openDocument(new Uint8Array(await file.arrayBuffer()), "application/pdf");
        try {
            const pdf = document.asPDF();
            if (!pdf) throw new Error("Input is not a PDF");
            if (pdf.needsPassword() && !pdf.authenticatePassword(password)) {
                return Response.json({ error: "Invalid PDF password." }, { status: 401 });
            }
            return pdfResponse(pdf.saveToBuffer("encrypt=none"));
        } finally { document.destroy(); }
    } catch (error) { return failure(error); }
}
