// This file centralizes the definition of all available tools, organized by category.
const baseCategories = [
    {
        name: "Edit & Annotate",
        tools: [
            {
                href: import.meta.env.BASE_URL + "edit-pdf-text.html",
                name: "Edit PDF Text",
                icon: "ph-cursor-text",
                subtitle: "Click any paragraph and edit it in place with live reflow, fonts, and styling.",
            },
            {
                href: import.meta.env.BASE_URL + "page-numbers.html",
                name: "Page Numbers",
                icon: "ph-list-numbers",
                subtitle: "Insert page numbers into your document.",
            },
            {
                href: import.meta.env.BASE_URL + "header-footer.html",
                name: "Header & Footer",
                icon: "ph-paragraph",
                subtitle: "Add text to the top and bottom of pages.",
            },
            {
                href: import.meta.env.BASE_URL + "crop-pdf.html",
                name: "Crop PDF",
                icon: "ph-crop",
                subtitle: "Trim the margins of every page in your PDF.",
            },
        ],
    },
    {
        name: "Convert to PDF",
        tools: [
            {
                href: import.meta.env.BASE_URL + "image-to-pdf.html",
                name: "Images to PDF",
                icon: "ph-images",
                subtitle:
                    "Convert JPG, PNG, BMP, GIF, TIFF, PNM, PGM, PBM, PPM, PAM, JXR, JPX, JP2, PSD, SVG, HEIC, WebP to PDF.",
            },
            {
                href: import.meta.env.BASE_URL + "txt-to-pdf.html",
                name: "Text to PDF",
                icon: "ph-text-t",
                subtitle: "Convert a plain text file into a PDF.",
            },
            {
                href: import.meta.env.BASE_URL + "markdown-to-pdf.html",
                name: "Markdown to PDF",
                icon: "ph-markdown-logo",
                subtitle: "Convert Markdown to PDF with live preview and syntax highlighting.",
            },
            {
                href: import.meta.env.BASE_URL + "json-to-pdf.html",
                name: "JSON to PDF",
                icon: "ph-file-code",
                subtitle: "Convert JSON files to PDF format.",
            },
            {
                href: import.meta.env.BASE_URL + "csv-to-pdf.html",
                name: "CSV to PDF",
                icon: "ph-file-csv",
                subtitle: "Convert CSV (Comma-Separated Values) spreadsheets to PDF.",
            },
        ],
    },
    {
        name: "Organize & Manage",
        tools: [
            {
                href: import.meta.env.BASE_URL + "merge-pdf.html",
                name: "Merge PDF",
                icon: "ph-browsers",
                subtitle: "Combine multiple PDFs into one file.",
            },
            {
                href: import.meta.env.BASE_URL + "split-pdf.html",
                name: "Split PDF",
                icon: "ph-scissors",
                subtitle: "Extract a range of pages into a new PDF.",
            },
            {
                href: import.meta.env.BASE_URL + "extract-pages.html",
                name: "Extract Pages",
                icon: "ph-squares-four",
                subtitle: "Save a selection of pages as new files.",
            },
            {
                href: import.meta.env.BASE_URL + "delete-pages.html",
                name: "Delete Pages",
                icon: "ph-trash",
                subtitle: "Remove specific pages from your document.",
            },
            {
                href: import.meta.env.BASE_URL + "rotate-pdf.html",
                name: "Rotate PDF",
                icon: "ph-arrow-clockwise",
                subtitle: "Turn pages in 90-degree increments.",
            },
            {
                href: import.meta.env.BASE_URL + "n-up-pdf.html",
                name: "N-Up PDF",
                icon: "ph-squares-four",
                subtitle: "Arrange multiple pages onto a single sheet.",
            },
            {
                href: import.meta.env.BASE_URL + "pdf-booklet.html",
                name: "PDF Booklet",
                icon: "ph-book-open",
                subtitle: "Rearrange pages for double-sided booklet printing.",
            },
            {
                href: import.meta.env.BASE_URL + "combine-single-page.html",
                name: "Combine to Single Page",
                icon: "ph-arrows-out-line-vertical",
                subtitle: "Stitch all pages into one continuous scroll.",
            },
            {
                href: import.meta.env.BASE_URL + "edit-metadata.html",
                name: "Edit Metadata",
                icon: "ph-file-code",
                subtitle: "Change the author, title, and other properties.",
            },
        ],
    },
    {
        name: "Optimize & Repair",
        tools: [
            {
                href: import.meta.env.BASE_URL + "compress-pdf.html",
                name: "Compress PDF",
                icon: "ph-lightning",
                subtitle: "Reduce the file size of your PDF.",
            },
            {
                href: import.meta.env.BASE_URL + "repair-pdf.html",
                name: "Repair PDF",
                icon: "ph-wrench",
                subtitle: "Recover data from corrupted or damaged PDF files.",
            },
            {
                href: import.meta.env.BASE_URL + "rasterize-pdf.html",
                name: "Rasterize PDF",
                icon: "ph-image",
                subtitle: "Convert PDF to image-based PDF. Flatten layers and remove selectable text.",
            },
        ],
    },
    {
        name: "Secure PDF",
        tools: [
            {
                href: import.meta.env.BASE_URL + "protect-pdf.html",
                name: "Protect PDF",
                icon: "ph-lock",
                subtitle: "Password protect a PDF with strong AES encryption.",
            },
            {
                href: import.meta.env.BASE_URL + "sanitize-pdf.html",
                name: "Sanitize PDF",
                icon: "ph-broom",
                subtitle: "Remove metadata, annotations, scripts, and more.",
            },
            {
                href: import.meta.env.BASE_URL + "unlock-pdf.html",
                name: "Unlock PDF",
                icon: "ph-lock-open",
                subtitle: "Remove the password from a PDF so it opens freely.",
            },
            {
                href: import.meta.env.BASE_URL + "flatten-pdf.html",
                name: "Flatten PDF",
                icon: "ph-stack",
                subtitle: "Make form fields and annotations non-editable.",
            },
        ],
    },
];

const getToolIdFromHref = (href: string): string => {
    const match = href.match(/\/([^/]+)\.html$/);
    return match?.[1] ?? href;
};

export const categories = baseCategories.map((category) => ({
    ...category,
    tools: category.tools.map((tool) => ({
        ...tool,
        id: getToolIdFromHref(tool.href),
    })),
}));
