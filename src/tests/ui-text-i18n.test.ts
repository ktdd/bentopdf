// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scanRawUiText } from "../../scripts/raw-ui-text-scan.mjs";

interface RawUiSite {
    file: string;
    line: number;
    kind: string;
    text: string;
}

describe("UI text goes through i18n", () => {
    it("has no raw English in UI sinks", () => {
        const sites = scanRawUiText() as RawUiSite[];
        const report = sites.map((site) => `${site.file}:${site.line} [${site.kind}] ${site.text}`).join("\n");
        expect(report).toBe("");
    });
});
