// oxlint-disable max-depth
import mupdf from "mupdf";

/** Create one PDF page per image, preserving its intrinsic dimensions and resolution. */
export async function imagesToPdfWithMuPDF(images: File[]): Promise<Blob> {
    const document = new mupdf.PDFDocument();
    try {
        for (const file of images) {
            const image = new mupdf.Image(new Uint8Array(await file.arrayBuffer()));
            try {
                // Image resolution is in pixels per inch; PDF page dimensions are points.
                const width = (image.getWidth() * 72) / (image.getXResolution() || 96);
                const height = (image.getHeight() * 72) / (image.getYResolution() || 96);
                const imageRef = document.addImage(image);
                try {
                    const page = document.addPage(
                        [0, 0, width, height],
                        0,
                        { XObject: { Image: imageRef } },
                        `q ${width} 0 0 ${height} 0 0 cm /Image Do Q`,
                    );
                    try {
                        document.insertPage(-1, page);
                    } finally {
                        page.destroy();
                    }
                } finally {
                    imageRef.destroy();
                }
            } finally {
                image.destroy();
            }
        }

        const buffer = document.saveToBuffer("compress");
        try {
            // Copy before releasing MuPDF's WASM-backed buffer.
            return new Blob([new Uint8Array(buffer.asUint8Array())], { type: "application/pdf" });
        } finally {
            buffer.destroy();
        }
    } finally {
        document.destroy();
    }
}
