import cpdfAssetUrl from "coherentpdf/dist/coherentpdf.browser.min.js?url";
import type { CpdfInstance, WindowWithCoherentPdf } from "@/types";

let cpdfLoadPromise: Promise<void> | null = null;

// Workers need an absolute URL because their scripts live in a different directory.
export function getCpdfUrl(): string {
    return new URL(cpdfAssetUrl, document.baseURI).href;
}

export function isCpdfAvailable(): boolean {
    return true;
}

export async function isCpdfLoaded(): Promise<void> {
    if (typeof (window as WindowWithCoherentPdf).coherentpdf !== "undefined") return;
    if (cpdfLoadPromise) return cpdfLoadPromise;

    cpdfLoadPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = getCpdfUrl();
        script.onload = () => {
            if (typeof (window as WindowWithCoherentPdf).coherentpdf === "undefined") {
                reject(new Error("CoherentPDF did not initialize."));
                return;
            }
            resolve();
        };
        script.onerror = () => {
            script.remove();
            reject(new Error("Failed to load CoherentPDF from " + script.src));
        };
        document.head.appendChild(script);
    }).finally(() => {
        cpdfLoadPromise = null;
    });

    return cpdfLoadPromise;
}

export async function getCpdf(): Promise<CpdfInstance> {
    await isCpdfLoaded();
    return (window as WindowWithCoherentPdf).coherentpdf as CpdfInstance;
}
