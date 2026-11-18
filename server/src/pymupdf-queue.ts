export function createPyMuPDFQueue() {
    let pending: Promise<void> = Promise.resolve();
    return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = pending.then(operation);
        pending = result.then(() => undefined, () => undefined);
        return result;
    };
}

export type PyMuPDFQueue = ReturnType<typeof createPyMuPDFQueue>;
