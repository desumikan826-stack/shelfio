import { supabase, escapeHTML } from './supabaseClient.js';
import {
    allSearchResults,
    currentSearchPage,
    RESULTS_PER_PAGE,
    setSearchResults,
    setCurrentSearchPage,
} from './state.js';
import { addRakutenBook, addRakutenBookAsPurchased } from './library.js';

// 楽天ブックスAPIの結果を、共通の形（title, author, isbnなど）に揃えて返す
export async function fetchRakutenResults(keyword, searchType) {
    const allItems = [];
    const MAX_PAGES = 4; // 30件 × 4ページ = 最大120件取得(100件で切る)

    for (let page = 1; page <= MAX_PAGES; page++) {
        const { data, error } = await supabase.functions.invoke("rakuten-search", {
            body: { keyword, searchType, page },
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

        // 100件集まったら十分なので終了
        if (allItems.length >= 100) break;

        // 楽天APIのレート制限に配慮して少し間隔を空ける
        if (page < MAX_PAGES) {
            await new Promise((resolve) => setTimeout(resolve, 1100));
        }
    }

    return allItems.slice(0, 100);
}

// 💡 ISBNで楽天ブックスAPIを1件だけ検索し、あらすじ(itemCaption)を取得する
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

// 💡 タイトルの数字部分を巻数として取り出す（例:「〇〇 3」「〇〇(3)」「〇〇 第3巻」）
function extractVolumeNumber(title, seriesName) {
    let rest = title;
    if (seriesName && rest.startsWith(seriesName)) {
        rest = rest.slice(seriesName.length);
    }

    const match = rest.match(/(\d+)/);
    if (!match) return null;

    const volume = Number(match[1]);
    return Number.isInteger(volume) && volume > 0 ? volume : null;
}

// 💡 シリーズ名で楽天ブックスAPIを検索し、巻数ごとの本情報をMapで返す（巻数 → {isbn, title, ...}）
export async function fetchSeriesVolumes(seriesName) {
    const items = await fetchRakutenResults(seriesName, "title");
    const volumeMap = new Map();

    items.forEach((item) => {
        // シリーズ名そのものを含まないタイトルは別作品の可能性が高いので除外
        if (!item.title || !item.title.includes(seriesName)) return;

        const volume = extractVolumeNumber(item.title, seriesName);
        if (volume === null) return;

        // 同じ巻数が複数回ヒットした場合は最初に見つかったものを優先
        if (!volumeMap.has(volume)) {
            volumeMap.set(volume, item);
        }
    });

    return volumeMap;
}

export async function searchBook() {
    const input = document.getElementById("bookSearch");
    if (!input) return;

    const keyword = input.value;
    const searchType = document.getElementById("searchType").value;
    if (keyword === "") return;

    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) searchBtn.disabled = true;

    try {
        const items = await fetchRakutenResults(keyword, searchType);
        displaySearchResult(items);

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

export function renderSearchPage() {
    const result = document.getElementById("searchResult");
    if (!result) return;

    result.innerHTML = "";

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
        `;

        const registerRow = document.createElement("p");

        const wishlistButton = document.createElement("button");
        wishlistButton.className = "btn btn-primary";
        wishlistButton.textContent = "💖 ほしい本として登録";
        wishlistButton.onclick = () => addRakutenBook(info);

        const purchasedButton = document.createElement("button");
        purchasedButton.className = "btn btn-success";
        purchasedButton.textContent = "✅ 購入済みとして登録";
        purchasedButton.onclick = () => addRakutenBookAsPurchased(info);

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