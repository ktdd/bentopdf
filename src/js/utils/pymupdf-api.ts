export async function requestPdf(path: string, body: FormData | object): Promise<Blob> {
    const isForm = body instanceof FormData;
    const response = await fetch(path, {
        method: 'POST',
        body: isForm ? body : JSON.stringify(body),
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        const result = await response.json().catch((): null => null);
        throw new Error(typeof result?.error === 'string' ? result.error : `PDF processing failed (HTTP ${response.status}).`);
    }
    return response.blob();
}
