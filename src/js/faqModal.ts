document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("faq-modal");
    const openBtn = document.getElementById("faq-open-btn");
    if (!modal || !openBtn) return;

    openBtn.classList.add("hidden");
    modal.remove();
});
