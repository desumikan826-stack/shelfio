import { supabase, escapeHTML, getAmazonSearchUrl } from './supabaseClient.js';
import {
    allSearchResults,
    currentSearchPage,
    RESULTS_PER_PAGE,
    setSearchResults,
    setCurrentSearchPage,
    removeFromSearchResults,
} from './state.js';
import { addRakutenBook, addRakutenBookAsPurchased, findDuplicateBook } from './library.js';

// 楽天ブックスAPIの結果を、共通の形（title, author, isbnなど）に揃えて返す
// 💡 genreId を指定すると、そのジャンル（例：漫画=001001、ライトノベル=001017）に絞り込んで検索する
// ※ Supabase Edge Function 側（rakuten-search）でも genreId を受け取って
//    楽天APIの booksGenreId パラメータに渡すよう対応している必要があります
export async function fetchRakutenResults(keyword, searchType, genreId = "") {
    const allItems = [];
    const MAX_PAGES = 10; // 30件 × 10ページ = 最大300件取得
    const MAX_RESULTS = 300;

    for (let page = 1; page <= MAX_PAGES; page++) {
        const { data, error } = await supabase.functions.invoke("rakuten-search", {
            body: { keyword, searchType, genreId, page },
        });

        if (error) {
            console.error(error);
            break;
        }

        const items = (data.Items || []).map((item) => {
            const info = item.Item;
            return {
                title: info.title,
                author: info.author,
                publisherName: info.publisherName || "",
                salesDate: info.salesDate || "",
                itemPrice: info.itemPrice || "",
                largeImageUrl: info.largeImageUrl || "",
                isbn: (info.isbn || "").replace(/-/g, ""),
                itemUrl: info.affiliateUrl || info.itemUrl || "",
                source: "rakuten"
            };
        });

        allItems.push(...items);

        // その回の結果が30件未満なら、もうページが無いので終了
        if (items.length < 30) break;

        // 上限まで集まったら十分なので終了
        if (allItems.length >= MAX_RESULTS) break;

        // 楽天APIのレート制限に配慮して少し間隔を空ける
        if (page < MAX_PAGES) {
            await new Promise((resolve) => setTimeout(resolve, 1100));
        }
    }

    return allItems.slice(0, MAX_RESULTS);
}

// 💡 ISBNで楽天ブックスAPIを1件だけ検索し、あらすじ(itemCaption)を取得する
// 💡 指定ジャンルの売れ筋ランキングを取得する（トップページの「今日のTOP10」用）
// 例：漫画（コミック）=001001、ライトノベル=001017
export async function fetchGenreRanking(genreId, limit = 10) {
    const { data, error } = await supabase.functions.invoke("rakuten-search", {
        body: { genreId, sort: "sales", page: 1 },
    });

    if (error) {
        console.error(error);
        return [];
    }

    const items = (data.Items || []).map((item) => {
        const info = item.Item;
        return {
            title: info.title,
            author: info.author,
            largeImageUrl: info.largeImageUrl || "",
            isbn: (info.isbn || "").replace(/-/g, ""),
            itemUrl: info.affiliateUrl || info.itemUrl || "",
        };
    });

    return items.slice(0, limit);
}

export async function fetchRakutenBookByIsbn(isbn) {
    const { data, error } = await supabase.functions.invoke("rakuten-search", {
        body: { keyword: isbn, searchType: "isbn", page: 1 },
    });

    if (error) {
        console.error(error);
        return null;
    }

    const item = (data.Items || [])[0]?.Item;
    if (!item) return null;

    return {
        itemCaption: item.itemCaption || "",
        itemPrice: item.itemPrice || "",
    };
}

// 💡 openBD(https://openbd.jp)からISBNで書誌情報を取得する。
//    楽天ブックスAPIにキーワード検索の代わりにはならない（ISBN指定専用）が、
//    APIキー不要・CORS対応で直接ブラウザから呼べるため、
//    楽天で見つからなかったISBN検索のフォールバックとして使う
export async function fetchOpenBDByIsbn(isbn) {
    try {
        const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`);
        if (!res.ok) return null;

        const data = await res.json();
        const entry = data && data[0];
        if (!entry) return null;

        const summary = entry.summary || {};
        if (!summary.title) return null;

        return {
            title: summary.title || "",
            author: summary.author || "",
            publisherName: summary.publisher || "",
            salesDate: summary.pubdate || "",
            itemPrice: "",
            largeImageUrl: summary.cover || "",
            isbn: (summary.isbn || isbn).replace(/-/g, ""),
            itemUrl: "",
            source: "openbd",
        };
    } catch (e) {
        console.error("openBDの取得に失敗しました:", e);
        return null;
    }
}

export async function searchBook() {
    const input = document.getElementById("bookSearch");
    if (!input) return;

    let keyword = input.value;
    const searchType = document.getElementById("searchType").value;
    const genreId = document.getElementById("genreFilter")?.value || "";

    // ISBN検索の場合、ハイフンや空白が入っていると楽天API側で見つからないことがあるので取り除く
    if (searchType === "isbn") {
        keyword = keyword.replace(/[^0-9Xx]/g, "");
    }

    // キーワードが空でも、ジャンルが指定されていれば検索できるようにする
    if (keyword === "" && genreId === "") return;

    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) searchBtn.disabled = true;

    try {
        let items = await fetchRakutenResults(keyword, searchType, genreId);

        // 💡 ISBN検索で楽天ブックスに無かった場合、openBDでも探してみる
        if (searchType === "isbn" && items.length === 0 && keyword) {
            const openBdItem = await fetchOpenBDByIsbn(keyword);
            if (openBdItem) items = [openBdItem];
        }

        const newItems = items.filter((item) => !findDuplicateBook({
            isbn: item.isbn,
            title: item.title,
            author: item.author,
        }));
        displaySearchResult(newItems);

    } catch (e) {
        console.error(e);
        alert("検索に失敗しました。少し時間を置いてもう一度お試しください。");
    } finally {
        if (searchBtn) searchBtn.disabled = false;
    }
}

function displaySearchResult(items) {
    setSearchResults(items);
    renderSearchPage();
}

// 💡 検索結果から登録した本をその場で取り除く（再検索しなくても消える）
function dropFromSearchResults(info) {
    const remaining = allSearchResults.filter((item) => !(
        (info.isbn && item.isbn === info.isbn) ||
        (!info.isbn && item.title === info.title && item.author === info.author)
    ));

    const totalPages = Math.max(1, Math.ceil(remaining.length / RESULTS_PER_PAGE));
    if (currentSearchPage > totalPages) {
        setCurrentSearchPage(totalPages);
    }

    removeFromSearchResults(remaining);
    renderSearchPage();
}

export function renderSearchPage() {
    const result = document.getElementById("searchResult");
    if (!result) return;

    result.innerHTML = "";

    if (!allSearchResults.length) {
        result.innerHTML = `<div class="empty-state">🔍 <p>登録済みの本を除いて、該当する本が見つかりませんでした。</p></div>`;
        return;
    }

    const start = (currentSearchPage - 1) * RESULTS_PER_PAGE;
    const pageItems = allSearchResults.slice(start, start + RESULTS_PER_PAGE);

    pageItems.forEach((info) => {
        const div = document.createElement("div");
        div.className = "book";
        div.innerHTML = `
            <img src="${escapeHTML(info.largeImageUrl || "")}" onerror="this.style.display='none'">
            <h3>${escapeHTML(info.title)}</h3>
            <p>著者：${escapeHTML(info.author)}</p>
            ${info.salesDate ? `<p>発売日：${escapeHTML(info.salesDate)}</p>` : ""}
            ${info.itemPrice ? `<p>価格：${escapeHTML(info.itemPrice)}円</p>` : ""}
            ${info.itemUrl ? `<p><a class="btn btn-secondary rakuten-link" href="${escapeHTML(info.itemUrl)}" target="_blank" rel="noopener noreferrer">🛒 楽天ブックスで購入</a></p>` : ""}
            <p><a class="btn btn-secondary rakuten-link" href="${escapeHTML(getAmazonSearchUrl(info))}" target="_blank" rel="noopener noreferrer">🛒 Amazonで買う</a></p>
            ${info.source === "openbd" ? `<p class="no-rating">📖 openBDから取得（価格・購入リンクなし）</p>` : ""}
        `;

        const registerRow = document.createElement("p");

        const wishlistButton = document.createElement("button");
        wishlistButton.className = "btn btn-primary";
        wishlistButton.textContent = "💖 ほしい本として登録";
        wishlistButton.onclick = async () => {
            const success = await addRakutenBook(info);
            if (success) dropFromSearchResults(info);
        };

        const purchasedButton = document.createElement("button");
        purchasedButton.className = "btn btn-success";
        purchasedButton.textContent = "✅ 購入済みとして登録";
        purchasedButton.onclick = async () => {
            const success = await addRakutenBookAsPurchased(info);
            if (success) dropFromSearchResults(info);
        };

        registerRow.appendChild(wishlistButton);
        registerRow.appendChild(purchasedButton);

        div.appendChild(registerRow);
        result.appendChild(div);
    });

    renderPagination();
}

function renderPagination() {
    const result = document.getElementById("searchResult");
    const totalPages = Math.max(1, Math.ceil(allSearchResults.length / RESULTS_PER_PAGE));

    const pagerDiv = document.createElement("div");
    pagerDiv.className = "pagination";

    const prevBtn = document.createElement("button");
    prevBtn.className = "btn btn-secondary";
    prevBtn.textContent = "← 前へ";
    prevBtn.disabled = currentSearchPage === 1;
    prevBtn.onclick = () => {
        setCurrentSearchPage(currentSearchPage - 1);
        renderSearchPage();
    };

    const pageLabel = document.createElement("span");
    pageLabel.textContent = `${currentSearchPage} / ${totalPages} ページ`;

    const nextBtn = document.createElement("button");
    nextBtn.className = "btn btn-secondary";
    nextBtn.textContent = "次へ →";
    nextBtn.disabled = currentSearchPage === totalPages;
    nextBtn.onclick = () => {
        setCurrentSearchPage(currentSearchPage + 1);
        renderSearchPage();
    };

    pagerDiv.appendChild(prevBtn);
    pagerDiv.appendChild(pageLabel);
    pagerDiv.appendChild(nextBtn);

    result.appendChild(pagerDiv);
}

// 💡 search.html の検索ボタンにイベントを紐づける
export function initSearchPage() {
    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) searchBtn.addEventListener("click", searchBook);
}

// 💡 指定した要素に「今日のTOP10」ランキングを描画する（index.html の #lightNovelRanking / #mangaRanking 用）
async function renderRankingInto(elementId, genreId) {
    const container = document.getElementById(elementId);
    if (!container) return; // その要素が無いページでは何もしない

    container.innerHTML = `<p class="no-rating">読み込み中...</p>`;

    try {
        const items = await fetchGenreRanking(genreId, 10);

        if (!items.length) {
            container.innerHTML = `<div class="empty-state">📚 <p>ランキングを取得できませんでした。</p></div>`;
            return;
        }

        container.innerHTML = `
            <ol class="ranking-list">
                ${items.map((info, i) => `
                    <li class="ranking-item">
                        <span class="ranking-rank">${i + 1}</span>
                        <img src="${escapeHTML(info.largeImageUrl || "")}" alt="表紙" class="ranking-image" onerror="this.style.display='none'">
                        <div class="ranking-info">
                            <p class="ranking-title">${info.itemUrl
                                ? `<a href="${escapeHTML(info.itemUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(info.title)}</a>`
                                : escapeHTML(info.title)}</p>
                            <p class="ranking-author">${escapeHTML(info.author || "")}</p>
                        </div>
                    </li>
                `).join("")}
            </ol>
        `;
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="empty-state">📚 <p>ランキングの取得に失敗しました。</p></div>`;
    }
}

// 💡 トップページの「今日のライトノベルTOP10」「今日の漫画TOP10」を描画する
export function renderTopRankings() {
    renderRankingInto("lightNovelRanking", "001017"); // ライトノベル
    renderRankingInto("mangaRanking", "001001"); // 漫画（コミック）
}