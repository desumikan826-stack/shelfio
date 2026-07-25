import { getCurrentUser } from './supabaseClient.js';
import { updateUI, initAuthForm, initLogout, guardProtectedPages } from './auth.js';
import {
    loadBooks,
    setRating,
    addBook,
    addRakutenBook,
    addWishlistItem,
    deleteWishlistItem,
    purchaseWishlistItem,
    displayBooks,
    showBookDetail,
    backToList,
    changeRating,
    deleteBook,
    togglePurchased,
    changeStatus,
    toggleStatusMenu,
    switchTab,
} from './library.js';
import {
    renderSchedulePage,
    addScheduleItem,
    deleteScheduleItem,
    handleExistingBookChange,
    handleFrequencyChange,
} from './schedule.js';
import { renderStatsPage } from './stats.js';
import { searchBook, initSearchPage } from './rakutenSearch.js';

console.log("最新版script.js 読み込み成功");

// HTML の onclick 属性などから呼べるように window に公開
window.switchTab = switchTab;
window.searchBook = searchBook;
window.addBook = addBook;
window.deleteBook = deleteBook;
window.changeRating = changeRating;
window.togglePurchased = togglePurchased;
window.changeStatus = changeStatus;
window.displayBooks = displayBooks;
window.addScheduleItem = addScheduleItem;
window.deleteScheduleItem = deleteScheduleItem;
window.handleExistingBookChange = handleExistingBookChange;
window.handleFrequencyChange = handleFrequencyChange;
window.renderSchedulePage = renderSchedulePage;
window.renderStatsPage = renderStatsPage;
window.toggleStatusMenu = toggleStatusMenu;
window.showBookDetail = showBookDetail;
window.backToList = backToList;

// Wishlists 外部公開
window.purchaseWishlistItem = purchaseWishlistItem;
window.deleteWishlistItem = deleteWishlistItem;
window.addWishlistItem = addWishlistItem;

// 初期化処理
updateUI();
loadBooks();
initAuthForm();
initLogout();
initSearchPage();
guardProtectedPages(getCurrentUser);