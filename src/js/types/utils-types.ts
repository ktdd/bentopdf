import type { PDFName, PDFObject } from "pdf-lib";

export interface PDFDictLike {
    keys(): PDFName[];
    values(): PDFObject[];
    entries(): [PDFName, PDFObject][];
    set(key: PDFName, value: PDFObject): void;
    get(key: PDFName, preservePDFNull?: boolean): PDFObject | undefined;
    has(key: PDFName): boolean;
    delete(key: PDFName): boolean;
    lookup(key: PDFName): PDFObject | undefined;
    asArray?(): PDFObject[];
}

export interface WindowWithCoherentPdf {
    coherentpdf?: unknown;
}

export interface WindowWithLucide {
    lucide?: {
        createIcons(): void;
    };
}

export type { QpdfInstance as QpdfWasmInstance } from "@neslinesli93/qpdf-wasm";

export interface QpdfInstanceExtended {
    callMain: (args: string[]) => number;
    FS: EmscriptenFSExtended;
}

export interface EmscriptenFSExtended {
    mkdir: (path: string) => void;
    mount: (type: unknown, opts: { blobs: { name: string; data: Blob }[] }, mountPoint: string) => void;
    unmount: (mountPoint: string) => void;
    writeFile: (path: string, data: Uint8Array | string, opts?: { encoding?: string }) => void;
    readFile: (path: string, opts?: { encoding?: string }) => Uint8Array;
    unlink: (path: string) => void;
    analyzePath: (path: string) => { exists: boolean };
}

export interface CpdfInstance {
    setSlow: () => void;
    fromMemory: (data: Uint8Array, userpw: string) => unknown;
    isEncrypted: (pdf: unknown) => boolean;
    decryptPdf: (pdf: unknown, password: string) => void;
    decryptPdfOwner: (pdf: unknown, password: string) => void;
    toMemory: (pdf: unknown, linearize: boolean, makeId: boolean) => Uint8Array;
    deletePdf: (pdf: unknown) => void;
    startGetBookmarkInfo: (pdf: unknown) => void;
    numberBookmarks: () => number;
    getBookmarkLevel: (index: number) => number;
    getBookmarkPage: (pdf: unknown, index: number) => number;
    endGetBookmarkInfo: () => void;
    parsePagespec: (pdf: unknown, pagespec: string) => unknown;
    removePageLabels: (pdf: unknown) => void;
    all: (pdf: unknown) => unknown;
    addPageLabels: (
        pdf: unknown,
        style: unknown,
        prefix: string,
        offset: number,
        range: unknown,
        progress: boolean,
    ) => void;
    decimalArabic: number;
    lowercaseRoman: number;
    uppercaseRoman: number;
    lowercaseLetters: number;
    uppercaseLetters: number;
    noLabelPrefixOnly?: number;
}
