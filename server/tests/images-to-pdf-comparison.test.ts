import { describe, expect, test } from "bun:test";
import mupdf from "mupdf";
import { createImagesToPdfHandler } from "../src/images-to-pdf";
import { imagesToPdfWithMuPDF } from "../src/mupdf-images-to-pdf";
import { createPyMuPDFQueue } from "../src/pymupdf-queue";

type Handler = (request: Request) => Promise<Response>;
type ImageFixture = { name: string; type: string; bytes: Uint8Array; width: number; height: number };

function makeImage(name: string, width: number, height: number, format: "png" | "jpeg"): ImageFixture {
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
    try {
        pixmap.setResolution(96, 96);
        const pixels = pixmap.getPixels();
        const stride = pixmap.getStride();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const offset = y * stride + x * 3;
                // Distinct corners and gradients make orientation and page order visible.
                pixels[offset] = Math.round(255 * x / (width - 1));
                pixels[offset + 1] = Math.round(255 * y / (height - 1));
                pixels[offset + 2] = x < width / 2 ? 40 : 210;
            }
        }
        const data = format === "png" ? pixmap.asPNG() : pixmap.asJPEG(95);
        return { name, type: `image/${format}`, bytes: new Uint8Array(data), width, height };
    } finally {
        pixmap.destroy();
    }
}

function makeRequest(images: ImageFixture[]): Request {
    const form = new FormData();
    for (const image of images) {
        form.append("images", new File([new Uint8Array(image.bytes)], image.name, { type: image.type }));
    }
    return new Request("http://localhost/api/images-to-pdf", { method: "POST", body: form });
}

async function convert(handler: Handler, images: ImageFixture[]): Promise<Uint8Array> {
    const response = await handler(makeRequest(images));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    return new Uint8Array(await response.arrayBuffer());
}

function inspect(bytes: Uint8Array) {
    const document = mupdf.Document.openDocument(bytes, "application/pdf");
    try {
        const pdf = document.asPDF();
        if (!pdf) throw new Error("Output is not a PDF");
        const pages = [];
        for (let i = 0; i < pdf.countPages(); i++) {
            const page = pdf.loadPage(i);
            try {
                const pixmap = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
                try {
                    const images: Array<{ width: number; height: number }> = [];
                    const xobjects = pdf.findPage(i).get("Resources", "XObject");
                    xobjects.forEach((object) => {
                        if (object.get("Subtype").asName() === "Image") {
                            images.push({ width: object.get("Width").asNumber(), height: object.get("Height").asNumber() });
                        }
                    });
                    expect(images.length).toBe(1);
                    pages.push({
                        bounds: page.getBounds(),
                        width: pixmap.getWidth(),
                        height: pixmap.getHeight(),
                        pixels: new Uint8Array(pixmap.getPixels()),
                        embedded: images[0],
                    });
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

describe("Images to PDF", () => {
    test("PyMuPDF and MuPDF.js preserve page order, image dimensions and appearance", async () => {
        const { loadImagePdfEngine } = await import("../src/pymupdf-engine");
        const pyHandler = createImagesToPdfHandler(loadImagePdfEngine, createPyMuPDFQueue());
        const jsHandler = createImagesToPdfHandler(async () => ({ imagesToPdf: imagesToPdfWithMuPDF }));
        const png = makeImage("gradient.png", 40, 30, "png");
        const jpeg = makeImage("gradient.jpg", 24, 36, "jpeg");

        for (const images of [[png], [jpeg], [png, jpeg], [jpeg, png]]) {
            const pyPages = inspect(await convert(pyHandler, images));
            const jsPages = inspect(await convert(jsHandler, images));
            expect(pyPages.length).toBe(images.length);
            expect(jsPages.length).toBe(images.length);
            for (let i = 0; i < images.length; i++) {
                const pyPage = pyPages[i];
                const jsPage = jsPages[i];
                const image = images[i];
                expect(pyPage.embedded).toEqual({ width: image.width, height: image.height });
                expect(jsPage.embedded).toEqual({ width: image.width, height: image.height });
                for (let j = 0; j < pyPage.bounds.length; j++) {
                    expect(Math.abs(pyPage.bounds[j] - jsPage.bounds[j])).toBeLessThan(0.1);
                }
                expect([jsPage.width, jsPage.height]).toEqual([pyPage.width, pyPage.height]);
                expect(meanPixelDifference(pyPage.pixels, jsPage.pixels)).toBeLessThan(3);
            }
        }
    }, 120_000);
});
