export function onPageReady(callback: () => void | Promise<void>): void {
    if (document.readyState === "loading") {
        const preventDrop = (event: DragEvent) => event.preventDefault();
        window.addEventListener("dragover", preventDrop);
        window.addEventListener("drop", preventDrop);
        document.addEventListener("DOMContentLoaded", () => {
            window.removeEventListener("dragover", preventDrop);
            window.removeEventListener("drop", preventDrop);
            void callback();
        }, { once: true });
    } else {
        void callback();
    }
}
