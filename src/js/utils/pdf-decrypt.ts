import type { CpdfInstance } from "@/types";
import { getCpdf, isCpdfAvailable } from "./cpdf-helper";
import { requestPdf } from "./pymupdf-api";

export type PdfDecryptEngine = "cpdf" | "mupdf";

export interface PdfDecryptResult {
    bytes: Uint8Array;
    engine: PdfDecryptEngine;
}

const DECRYPT_LOG_PREFIX = "[PDF Decrypt]";

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return String(error);
}

function normalizeErrorMessage(error: unknown): string {
    const message = getErrorMessage(error).trim();
    const cpdfReasonMatch = message.match(/Pdf\.PDFError\("([^"]+)"\)/);
    if (cpdfReasonMatch?.[1]) {
        return cpdfReasonMatch[1];
    }

    const trailingErrorMatch = message.match(/ERROR:\s*[^:]+:\s*(.+)$/);
    if (trailingErrorMatch?.[1]) {
        return trailingErrorMatch[1].trim();
    }

    return message;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
    return Uint8Array.from(bytes);
}

function cleanupCpdfDocument(cpdf: CpdfInstance, pdf: unknown): void {
    if (!cpdf || !pdf) {
        return;
    }

    try {
        cpdf.deletePdf(pdf);
    } catch (cleanupError) {
        console.warn(
            `${DECRYPT_LOG_PREFIX} Failed to cleanup CoherentPDF document: ${normalizeErrorMessage(cleanupError)}`,
        );
    }
}

async function decryptWithCpdf(inputBytes: Uint8Array, password: string): Promise<Uint8Array> {
    const cpdf = await getCpdf();
    cpdf.setSlow();

    let pdf: unknown | null = null;

    try {
        pdf = cpdf.fromMemory(new Uint8Array(inputBytes), password);

        if (cpdf.isEncrypted(pdf)) {
            try {
                cpdf.decryptPdf(pdf, password);
            } catch {
                cpdf.decryptPdfOwner(pdf, password);
            }
        }

        const outputBytes = cpdf.toMemory(pdf, false, false);
        pdf = null;

        if (!(outputBytes instanceof Uint8Array) || outputBytes.length === 0) {
            throw new Error("CoherentPDF produced an empty decrypted file.");
        }

        return copyBytes(outputBytes);
    } catch (error) {
        if (pdf) {
            cleanupCpdfDocument(cpdf, pdf);
        }

        throw new Error(normalizeErrorMessage(error), { cause: error });
    }
}

async function decryptWithMuPDF(inputBytes: Uint8Array, password: string): Promise<Uint8Array> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(inputBytes)], { type: "application/pdf" }), "document.pdf");
    form.append("password", password);
    const result = await requestPdf("/api/mupdf-decrypt-pdf", form);
    const bytes = new Uint8Array(await result.arrayBuffer());
    if (!bytes.length) throw new Error("MuPDF produced an empty decrypted file.");
    return bytes;
}

export async function decryptPdfBytes(inputBytes: Uint8Array, password: string): Promise<PdfDecryptResult> {
    const errors: string[] = [];

    if (isCpdfAvailable()) {
        console.info(`${DECRYPT_LOG_PREFIX} Trying CoherentPDF decryption`);
        try {
            const result: PdfDecryptResult = {
                bytes: await decryptWithCpdf(inputBytes, password),
                engine: "cpdf",
            };
            console.info(`${DECRYPT_LOG_PREFIX} Decryption succeeded with CoherentPDF`);
            return result;
        } catch (error) {
            const errorMessage = normalizeErrorMessage(error);
            console.warn(
                `${DECRYPT_LOG_PREFIX} Decryption with CoherentPDF failed. Falling back to MuPDF. Reason: ${errorMessage}`,
            );
            errors.push(`CoherentPDF: ${errorMessage}`);
        }
    } else {
        console.info(`${DECRYPT_LOG_PREFIX} CoherentPDF is not configured, skipping to PyMuPDF`);
        errors.push("CoherentPDF: not configured.");
    }

    console.info(`${DECRYPT_LOG_PREFIX} Trying MuPDF decryption`);
    try {
        const result: PdfDecryptResult = {
            bytes: await decryptWithMuPDF(inputBytes, password),
            engine: "mupdf",
        };
        console.info(`${DECRYPT_LOG_PREFIX} Decryption succeeded with MuPDF`);
        return result;
    } catch (error) {
        const errorMessage = normalizeErrorMessage(error);
        console.warn(`${DECRYPT_LOG_PREFIX} MuPDF decryption failed: ${errorMessage}`);
        errors.push(`MuPDF: ${errorMessage}`);
    }

    throw new Error(errors.join("\n"));
}
