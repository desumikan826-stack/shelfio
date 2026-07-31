// 💡 複数モジュール間で共有する状態。
// 他のモジュールから値を読むときは通常のimportで、
// 値を更新するときは必ずここにあるsetter関数経由で行う。

export let books = []; // 所有/購入済みの本（books テーブル）
export let wishlists = []; // ほしい本（wishlists テーブル）

// 検索結果のページング用
export let allSearchResults = [];
export let currentSearchPage = 1;
export const RESULTS_PER_PAGE = 10;

export let currentTab = 'all'; // 💡 今どのタブが選ばれているかを保存（all, want, read）
export let detailBookId = null; // 💡 タップして詳細表示している本のID（nullなら一覧表示）
export let detailWishlistId = null; // 💡 タップして詳細表示しているほしい本のID（nullなら一覧表示）

export let currentRating = 0;

export let currentCollectionFilter = null; // 💡 フォルダ絞り込み。null=すべて、"__uncategorized__"=未分類、それ以外はフォルダ名

export function setBooks(list) {
    books = list;
}

export function setWishlists(list) {
    wishlists = list;
    window.wishlists = wishlists; // wishlist.html などの別scriptから参照されるため
}

export function setCurrentTab(tab) {
    currentTab = tab;
}

export function setDetailBookId(id) {
    detailBookId = id;
}

export function setDetailWishlistId(id) {
    detailWishlistId = id;
}

export function setCurrentRating(rating) {
    currentRating = rating;
}

export function setCurrentCollectionFilter(value) {
    currentCollectionFilter = value;
}

export function setSearchResults(items) {
    allSearchResults = items;
    currentSearchPage = 1;
}

export function setCurrentSearchPage(page) {
    currentSearchPage = page;
}