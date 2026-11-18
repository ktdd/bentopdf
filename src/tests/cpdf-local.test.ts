import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('coherentpdf/dist/coherentpdf.browser.min.js?url', () => ({
  default: '/assets/coherentpdf.browser.min.js',
}));

import { getCpdf, getCpdfUrl } from '../js/utils/cpdf-helper';

afterEach(() => {
  delete (window as Window & { coherentpdf?: unknown }).coherentpdf;
  document.querySelectorAll('script[src*="coherentpdf.browser.min.js"]').forEach((script) => script.remove());
  vi.restoreAllMocks();
});

describe('local CoherentPDF', () => {
  it('allows retrying after a failed script load', async () => {
    const append = vi.spyOn(document.head, 'appendChild');
    const failed = getCpdf();
    (append.mock.calls[0][0] as HTMLScriptElement).dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow('Failed to load CoherentPDF');

    const retry = getCpdf();
    expect(append).toHaveBeenCalledTimes(2);
    (window as Window & { coherentpdf?: unknown }).coherentpdf = { ready: true };
    (append.mock.calls[1][0] as HTMLScriptElement).dispatchEvent(new Event('load'));
    await expect(retry).resolves.toEqual({ ready: true });
  });

  it('loads the same-origin script lazily and shares concurrent loads', async () => {
    const append = vi.spyOn(document.head, 'appendChild');
    expect(new URL(getCpdfUrl()).origin).toBe(location.origin);
    expect(append).not.toHaveBeenCalled();

    const first = getCpdf();
    const second = getCpdf();
    expect(append).toHaveBeenCalledTimes(1);
    const script = append.mock.calls[0][0] as HTMLScriptElement;
    const engine = { ready: true };
    (window as Window & { coherentpdf?: unknown }).coherentpdf = engine;
    script.dispatchEvent(new Event('load'));
    expect(await first).toBe(engine);
    expect(await second).toBe(engine);
  });

  it('loads the installed browser build in the merge worker and merges PDFs', async () => {
    const library = readFileSync('node_modules/coherentpdf/dist/coherentpdf.browser.min.js', 'utf8');
    const worker = readFileSync('public/workers/merge.worker.js', 'utf8');
    const results: Array<{ status: string; pdfBytes?: ArrayBuffer; message?: string }> = [];
    const context = createContext({ console, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder });
    context.self = context;
    context.postMessage = (result: (typeof results)[number]) => results.push(result);
    context.importScripts = (url: string) => {
      expect(url).toBe('https://example.test/assets/coherentpdf.browser.min.js');
      runInContext(library, context);
    };
    runInContext(worker, context);

    const document = await PDFDocument.create();
    document.addPage();
    const bytes = await document.save();
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await context.onmessage({ data: {
      command: 'merge',
      cpdfUrl: 'https://example.test/assets/coherentpdf.browser.min.js',
      files: [{ name: 'test.pdf', data }],
      jobs: [{ fileName: 'test.pdf', rangeType: 'all' }],
    } });

    expect(results[0].status, results[0].message).toBe('success');
    expect((await PDFDocument.load(results[0].pdfBytes!)).getPageCount()).toBe(1);

  });
});
