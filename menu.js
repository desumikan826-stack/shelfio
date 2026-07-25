// 💡 ハンバーガーメニュー（その他）の開閉を制御する
export function initSideMenu() {
    const menuToggleBtn = document.getElementById("menuToggleBtn");
    const sideMenu = document.getElementById("sideMenu");
    const overlay = document.getElementById("sideMenuOverlay");
    const closeBtn = document.getElementById("sideMenuClose");

    if (!menuToggleBtn || !sideMenu || !overlay) return;

    function openMenu() {
        sideMenu.classList.add("open");
        overlay.classList.add("visible");
    }

    function closeMenu() {
        sideMenu.classList.remove("open");
        overlay.classList.remove("visible");
    }

    menuToggleBtn.addEventListener("click", openMenu);
    overlay.addEventListener("click", closeMenu);
    if (closeBtn) closeBtn.addEventListener("click", closeMenu);
}