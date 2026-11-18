import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import mupdf from "mupdf";
import { rasterizeWithMuPDF } from "../src/mupdf-routes";
import { createPyMuPDFHandlers } from "../src/pymupdf-routes";
import { createPyMuPDFQueue } from "../src/pymupdf-queue";

type Handler = (request: Request) => Promise<Response>;
type Format = "png" | "jpeg";

async function makeSourcePdf(): Promise<Uint8Array> {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const first = document.addPage([240, 320]);
    first.drawRectangle({ x: 20, y: 30, width: 120, height: 160, color: rgb(0.9, 0.2, 0.1) });
    first.drawText("Rasterization test", { x: 25, y: 250, size: 16, font });
    const second = document.addPage([180, 260]);
    second.setRotation(degrees(90));
    second.drawRectangle({ x: 15, y: 25, width: 100, height: 80, color: rgb(0.1, 0.4, 0.9) });
    second.drawText("Rotated page", { x: 20, y: 180, size: 14, font });
    return document.save();
}

function makeRequest(bytes: Uint8Array, dpi: number, format: Format, grayscale: boolean): Request {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(bytes)], "source.pdf", { type: "application/pdf" }));
    form.append("dpi", String(dpi));
    form.append("format", format);
    form.append("grayscale", String(grayscale));
    return new Request("http://localhost/api/rasterize", { method: "POST", body: form });
}

async function rasterize(handler: Handler, source: Uint8Array, dpi: number, format: Format, grayscale: boolean) {
    const response = await handler(makeRequest(source, dpi, format, grayscale));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    return new Uint8Array(await response.arrayBuffer());
}

function inspect(bytes: Uint8Array, dpi: number, expectRasterized: boolean) {
    const document = mupdf.Document.openDocument(bytes, "application/pdf");
    try {
        const pdf = document.asPDF();
        if (!pdf) throw new Error("Result is not a PDF");
        const pages = [];
        for (let i = 0; i < pdf.countPages(); i++) {
            const page = pdf.loadPage(i);
            try {
                const bounds = page.getBounds();
                const scale = expectRasterized ? 1 : dpi / 72;
                const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
                try {
                    const info: {
                        bounds: number[];
                        width: number;
                        height: number;
                        pixels: Uint8Array;
                        embeddedWidth?: number;
                        embeddedHeight?: number;
                    } = {
                        bounds,
                        width: pixmap.getWidth(),
                        height: pixmap.getHeight(),
                        pixels: new Uint8Array(pixmap.getPixels()),
                    };
                    if (expectRasterized) {
                        const text = page.toStructuredText("");
                        try { expect(text.asText().trim()).toBe(""); } finally { text.destroy(); }
                        const pageObject = pdf.findPage(i);
                        const xobjects = pageObject.get("Resources", "XObject");
                        const images: Array<{ width: number; height: number }> = [];
                        xobjects.forEach((object) => {
                            if (object.get("Subtype").asName() === "Image") {
                                images.push({ width: object.get("Width").asNumber(), height: object.get("Height").asNumber() });
                            }
                        });
                        expect(images.length).toBe(1);
                        info.embeddedWidth = images[0].width;
                        info.embeddedHeight = images[0].height;
                    }
                    pages.push(info);
                } finally { pixmap.destroy(); }
            } finally { page.destroy(); }
        }
        return pages;
    } finally { document.destroy(); }
}

function meanPixelDifference(a: Uint8Array, b: Uint8Array): number {
    expect(a.length).toBe(b.length);
    let total = 0;
    for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
    return total / a.length;
}

describe("PDF rasterization", () => {
    test("PyMuPDF and MuPDF.js preserve page sizes and produce similar raster pages", async () => {
        const { loadImagePdfEngine } = await import("../src/pymupdf-engine");
        const pymupdf = createPyMuPDFHandlers(loadImagePdfEngine, createPyMuPDFQueue());
        const source = await makeSourcePdf();
        for (const dpi of [72, 150]) {
            const sourcePages = inspect(source, dpi, false);
            expect(sourcePages.length).toBe(2);
            for (const format of ["png", "jpeg"] as const) {
                for (const grayscale of [false, true]) {
                    const pyPages = inspect(await rasterize(pymupdf.rasterize, source, dpi, format, grayscale), dpi, true);
                    const jsPages = inspect(await rasterize(rasterizeWithMuPDF, source, dpi, format, grayscale), dpi, true);
                    expect(pyPages.length).toBe(sourcePages.length);
                    expect(jsPages.length).toBe(sourcePages.length);
                    for (let i = 0; i < sourcePages.length; i++) {
                        const original = sourcePages[i];
                        const pyPage = pyPages[i];
                        const jsPage = jsPages[i];
                        expect(pyPage.bounds).toEqual(original.bounds);
                        expect(jsPage.bounds).toEqual(original.bounds);
                        expect([pyPage.embeddedWidth, pyPage.embeddedHeight]).toEqual([original.width, original.height]);
                        expect([jsPage.embeddedWidth, jsPage.embeddedHeight]).toEqual([original.width, original.height]);
                        expect([jsPage.width, jsPage.height]).toEqual([pyPage.width, pyPage.height]);
                        // JPEG is lossy, and the two paths convert grayscale in different steps.
                        expect(meanPixelDifference(pyPage.pixels, jsPage.pixels)).toBeLessThan(8);
                        if (grayscale) {
                            let isGray = true;
                            for (let p = 0; p < jsPage.pixels.length; p += 3) {
                                if (jsPage.pixels[p] !== jsPage.pixels[p + 1] || jsPage.pixels[p] !== jsPage.pixels[p + 2]) {
                                    isGray = false;
                                    break;
                                }
                            }
                            expect(isGray).toBe(true);
                        }
                    }
                }
            }
        }
    }, 120_000);
});
