import { describe, expect, test } from "bun:test";
import { createImagesToPdfHandler } from "../src/images-to-pdf";

function upload(...names: string[]): Request {
    const form = new FormData();
    for (const name of names) form.append("images", new File([name], name, { type: "image/png" }));
    return new Request("http://localhost/api/images-to-pdf", { method: "POST", body: form });
}

describe("images-to-pdf route", () => {
    test("returns a PDF and preserves image order", async () => {
        let names: string[] = [];
        const handler = createImagesToPdfHandler(async () => ({
            async imagesToPdf(images) {
                names = images.map((image) => image.name);
                return new Blob(["%PDF-test"], { type: "application/pdf" });
            },
        }));
        const response = await handler(upload("first.png", "second.png"));
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/pdf");
        expect(await response.text()).toBe("%PDF-test");
        expect(names).toEqual(["first.png", "second.png"]);
    });

    test("rejects invalid or empty uploads without starting the engine", async () => {
        let loaded = false;
        const handler = createImagesToPdfHandler(async () => {
            loaded = true;
            throw new Error("must not load");
        });
        expect((await handler(upload())).status).toBe(400);
        expect((await handler(new Request("http://localhost", { method: "POST", body: "invalid" }))).status).toBe(400);
        expect(loaded).toBe(false);
    });

    test("serializes conversions and keeps working after a failure", async () => {
        const events: string[] = [];
        const handler = createImagesToPdfHandler(async () => ({
            async imagesToPdf(images) {
                const name = images[0].name;
                events.push(`start:${name}`);
                await Bun.sleep(10);
                events.push(`end:${name}`);
                if (name === "bad.png") throw new Error("test failure");
                return new Blob(["%PDF-test"], { type: "application/pdf" });
            },
        }));
        const originalError = console.error;
        console.error = () => {};
        try {
            const responses = await Promise.all([handler(upload("bad.png")), handler(upload("good.png"))]);
            expect(responses.map((response) => response.status)).toEqual([500, 200]);
            expect(events).toEqual(["start:bad.png", "end:bad.png", "start:good.png", "end:good.png"]);
        } finally {
            console.error = originalError;
        }
    });
});
