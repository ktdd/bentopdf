import { describe, expect, test } from "bun:test";
import mupdf from "mupdf";
import { imagesToPdf } from "../src/mupdf-routes";

function image(name: string, width: number, height: number): File {
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
    try {
        pixmap.clear(255);
        return new File([new Uint8Array(pixmap.asPNG())], name, { type: "image/png" });
    } finally {
        pixmap.destroy();
    }
}

function upload(...images: File[]): Request {
    const form = new FormData();
    for (const file of images) form.append("images", file);
    return new Request("http://localhost/api/images-to-pdf", { method: "POST", body: form });
}

describe("images-to-pdf route", () => {
    test("returns a PDF with pages in image order", async () => {
        const response = await imagesToPdf(upload(image("wide.png", 40, 20), image("tall.png", 20, 40)));
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/pdf");
        const document = mupdf.Document.openDocument(new Uint8Array(await response.arrayBuffer()), "application/pdf");
        try {
            expect(document.countPages()).toBe(2);
            const first = document.loadPage(0);
            const second = document.loadPage(1);
            try {
                const [x0, y0, x1, y1] = first.getBounds();
                expect(x1 - x0).toBeGreaterThan(y1 - y0);
                const [a0, b0, a1, b1] = second.getBounds();
                expect(a1 - a0).toBeLessThan(b1 - b0);
            } finally {
                first.destroy();
                second.destroy();
            }
        } finally {
            document.destroy();
        }
    });

    test("rejects invalid or empty uploads", async () => {
        expect((await imagesToPdf(upload())).status).toBe(400);
        expect((await imagesToPdf(new Request("http://localhost", { method: "POST", body: "invalid" }))).status).toBe(400);
    });
});
