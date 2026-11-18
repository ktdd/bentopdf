import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import mupdf from "mupdf";
import { decryptWithMuPDF } from "../src/mupdf-routes";
import { createPyMuPDFHandlers } from "../src/pymupdf-routes";
import { createPyMuPDFQueue } from "../src/pymupdf-queue";

const USER_PASSWORD = "test-user-password";
const OWNER_PASSWORD = "test-owner-password";

type Handler = (request: Request) => Promise<Response>;

function makeEncryptedPdf(): Uint8Array {
    const doc = new mupdf.PDFDocument();
    try {
        const page = doc.addPage([0, 0, 240, 320], 0, {}, "1 0 0 rg 20 30 120 160 re f");
        try { doc.insertPage(-1, page); } finally { page.destroy(); }
        const buffer = doc.saveToBuffer(`encrypt=aes-256,user-password=${USER_PASSWORD},owner-password=${OWNER_PASSWORD}`);
        try { return new Uint8Array(buffer.asUint8Array()); } finally { buffer.destroy(); }
    } finally { doc.destroy(); }
}

function requestFor(bytes: Uint8Array, password: string): Request {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(bytes)], "protected.pdf", { type: "application/pdf" }));
    form.append("password", password);
    return new Request("http://localhost/api/decrypt", { method: "POST", body: form });
}

function inspect(bytes: Uint8Array, password?: string) {
    const document = mupdf.Document.openDocument(bytes, "application/pdf");
    try {
        const pdf = document.asPDF();
        if (!pdf) throw new Error("Result is not a PDF");
        const encrypted = !pdf.getTrailer().get("Encrypt").isNull();
        if (pdf.needsPassword() && (!password || !pdf.authenticatePassword(password))) {
            throw new Error("Could not open PDF");
        }
        const pages = [];
        for (let i = 0; i < pdf.countPages(); i++) {
            const page = pdf.loadPage(i);
            try {
                const pixmap = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
                try {
                    pages.push({
                        bounds: page.getBounds(),
                        width: pixmap.getWidth(),
                        height: pixmap.getHeight(),
                        digest: createHash("sha256").update(pixmap.getPixels()).digest("hex"),
                    });
                } finally { pixmap.destroy(); }
            } finally { page.destroy(); }
        }
        return { encrypted, pages };
    } finally { document.destroy(); }
}

async function decrypt(handler: Handler, bytes: Uint8Array, password: string): Promise<Uint8Array> {
    const response = await handler(requestFor(bytes, password));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    return new Uint8Array(await response.arrayBuffer());
}

describe("PDF decryption", () => {
    test("MuPDF.js decrypts with user and owner passwords and rejects incorrect passwords", async () => {
        const encrypted = makeEncryptedPdf();
        const original = inspect(encrypted, USER_PASSWORD);
        expect(original.encrypted).toBe(true);
        expect(original.pages.length).toBe(1);
        for (const password of [USER_PASSWORD, OWNER_PASSWORD]) {
            const result = inspect(await decrypt(decryptWithMuPDF, encrypted, password));
            expect(result.encrypted).toBe(false);
            expect(result.pages).toEqual(original.pages);
        }
        const invalid = await decryptWithMuPDF(requestFor(encrypted, "incorrect"));
        expect(invalid.status).toBe(401);
    });

    test("PyMuPDF and MuPDF.js decrypt the same PDF equivalently", async () => {
        // Import lazily so the MuPDF.js-only test does not initialize Pyodide.
        const { loadImagePdfEngine } = await import("../src/pymupdf-engine");
        const pymupdf = createPyMuPDFHandlers(loadImagePdfEngine, createPyMuPDFQueue());
        const encrypted = makeEncryptedPdf();
        const original = inspect(encrypted, USER_PASSWORD);
        for (const password of [USER_PASSWORD, OWNER_PASSWORD]) {
            const pyResult = inspect(await decrypt(pymupdf.decrypt, encrypted, password));
            const jsResult = inspect(await decrypt(decryptWithMuPDF, encrypted, password));
            expect(pyResult.encrypted).toBe(false);
            expect(jsResult.encrypted).toBe(false);
            expect(pyResult.pages).toEqual(original.pages);
            expect(jsResult.pages).toEqual(original.pages);
            expect(pyResult.pages).toEqual(jsResult.pages);
        }
        const invalid = await pymupdf.decrypt(requestFor(encrypted, "incorrect"));
        expect(invalid.status).toBe(401);
    }, 120_000);
});
