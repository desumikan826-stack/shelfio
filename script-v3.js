// 💡 一番安全な初期化方法（これなら絶対に二重宣言エラーになりません）
if (!window.globalSupabase) {
    const supabaseUrl = "https://eqgyfkxiecozflnbypkl.supabase.co";
    const supabaseKey = "sb_publishable_3MQXaPuO9U3O_zub0LPoGg_N2pIYkIJ";
    window.globalSupabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}

const supabase = window.globalSupabase;
let currentUser = null;


// 💡 XSS対策：ユーザー入力や外部APIの値をinnerHTMLに入れる前に必ず通す
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char]));
}

async function signUp(email,password){

    const {error} = await supabase.auth.signUp({
        email,
        password
    });

    if(error) throw error;
}

async function signIn(email,password){

    const {error} = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if(error) throw error;
}

async function signOut(){

    const {error} = await supabase.auth.signOut();

    if(error) throw error;
}

supabase.auth.onAuthStateChange((event, session) => {

    currentUser = session?.user ?? null;

    console.log(event, currentUser);

    updateUI();

});

async function updateUI() {

    const {
        data: { session }
    } = await supabase.auth.getSession();

    currentUser = session?.user ?? null;

    const nav = document.querySelector("nav");
    const message = document.getElementById("welcome-message");

    if (currentUser) {

        if (nav) nav.style.display = "flex";

        const page = location.pathname.split("/").pop();
        if (message) {
            if (page === "index.html" || page === "") {
                message.innerHTML = "";
            } else {
                message.innerHTML = `
                ようこそ、${escapeHTML(currentUser.email)} さん！<br><br>
                上のメニューから機能を選択してください。
                `;
            }
        }

    } else {

        if (nav) nav.style.display = "none";

        if (message) {
            message.innerHTML = `
            ログインしてください。<br><br>
            <a href="login.html">ログイン / 新規登録</a>
            `;
        }

    }
}

updateUI();

let books = [];
// 検索結果のページング用
let allSearchResults = [];
let currentSearchPage = 1;
const RESULTS_PER_PAGE = 10;
let currentTab = 'all'; // 💡 今どのタブが選ばれているかを保存（all, want, read）

console.log("最新版script.js 読み込み成功");


// 💡 各所で繰り返されるユーザー取得処理をまとめたヘルパー
async function getCurrentUser() {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

async function loadBooks() {

    const user = await getCurrentUser();

    if (!user) return;

    const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    if (error) {
        console.error(error);
        alert("本の一覧の取得に失敗しました。もう一度お試しください。");
        return;
    }

    books = data || [];
    displayBooks();
    renderSchedulePage();
}

loadBooks();

const WEEKDAYS = [
    { value: "0", label: "日曜日" },
    { value: "1", label: "月曜日" },
    { value: "2", label: "火曜日" },
    { value: "3", label: "水曜日" },
    { value: "4", label: "木曜日" },
    { value: "5", label: "金曜日" },
    { value: "6", label: "土曜日" },
];

function getScheduleStorageKey(userId) {
    return `shelfio-schedule-${userId}`;
}

async function getScheduleItems() {
    const user = await getCurrentUser();
    if (!user) return [];
    const raw = window.localStorage.getItem(getScheduleStorageKey(user.id));
    try {
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function saveScheduleItems(items) {
    const user = await getCurrentUser();
    if (!user) return;
    window.localStorage.setItem(getScheduleStorageKey(user.id), JSON.stringify(items));
}

function getWeekdayLabel(weekday) {
    return WEEKDAYS.find((item) => item.value === String(weekday))?.label || "未設定";
}

function getDateOfWeekday(reference, weekday) {
    const date = new Date(reference);
    const diff = Number(weekday) - date.getDay();
    date.setDate(date.getDate() + diff);
    return date;
}

function getBiweeklyStartDate(item) {
    if (item.startDate) {
        const parsed = new Date(item.startDate);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    const today = new Date();
    const target = getDateOfWeekday(today, item.weekday);
    if (target > today) {
        target.setDate(target.getDate() - 7);
    }
    return target;
}

function isItemUpdatingToday(item) {
    const today = new Date();
    if (String(item.weekday) !== String(today.getDay())) return false;
    if (item.frequency === "weekly") return true;

    const startDate = getBiweeklyStartDate(item);
    const diffDays = Math.floor((today.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
    const weekDelta = Math.floor(diffDays / 7);
    return weekDelta % 2 === 0;
}

function getWeekStartDate(reference) {
    const date = new Date(reference);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay());
    return date;
}

function getBiweeklyStartDateForDate(item, referenceDate) {
    if (item.startDate) {
        const parsed = new Date(item.startDate);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    const date = new Date(referenceDate);
    const target = getDateOfWeekday(date, item.weekday);
    if (target > date) {
        target.setDate(target.getDate() - 7);
    }
    return target;
}

function isItemUpdatingOnDate(item, date) {
    if (String(item.weekday) !== String(date.getDay())) return false;
    if (item.frequency === "weekly") return true;

    const startDate = getBiweeklyStartDateForDate(item, date);
    const diffDays = Math.floor((date.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
    const weekDelta = Math.floor(diffDays / 7);
    return weekDelta % 2 === 0;
}

function renderReadingCalendar(items) {
    const calendarContainer = document.getElementById("readingCalendar");
    if (!calendarContainer) return;

    const weekStart = getWeekStartDate(new Date());
    const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + index);
        const dayItems = items.filter((item) => isItemUpdatingOnDate(item, new Date(date)));
        return {
            date,
            items: dayItems,
        };
    });

    calendarContainer.innerHTML = `
        <div class="calendar-grid">
            ${days
                .map((day) => {
                    const todayClass = day.date.toDateString() === new Date().toDateString() ? " today" : "";
                    return `
                        <div class="calendar-day${todayClass}">
                            <div class="calendar-day-label">
                                ${escapeHTML(getWeekdayLabel(day.date.getDay()))} ${escapeHTML(
                        `${day.date.getMonth() + 1}/${day.date.getDate()}`
                    )}
                            </div>
                            ${day.items.length
                                ? day.items
                                      .map(
                                          (item) => `
                                    <div class="calendar-item">
                                        <strong>${escapeHTML(item.title)}</strong>
                                        <div>${escapeHTML(item.frequency === "weekly" ? "週刊" : "隔週")}</div>
                                    </div>`
                                      )
                                      .join("")
                                : `<div class="calendar-item empty">更新なし</div>`}
                        </div>`;
                })
                .join("")}
        </div>`;
}

function formatDateToJp(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "未設定";
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function getNextUpdateLabel(item) {
    const today = new Date();
    if (isItemUpdatingToday(item)) {
        return "今日更新です";
    }

    let nextDate = getDateOfWeekday(today, item.weekday);
    if (nextDate < today) {
        nextDate.setDate(nextDate.getDate() + 7);
    }

    if (item.frequency === "biweekly") {
        const startDate = getBiweeklyStartDate(item);
        const diffDays = Math.floor((nextDate.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
        const weekDelta = Math.floor(diffDays / 7);
        if (weekDelta % 2 !== 0) {
            nextDate.setDate(nextDate.getDate() + 7);
        }
    }

    return formatDateToJp(nextDate);
}

async function renderSchedulePage() {
    const scheduleList = document.getElementById("scheduleList");
    const todayUpdates = document.getElementById("todayUpdates");
    const existingBookSelect = document.getElementById("existingBook");
    const startDateInput = document.getElementById("scheduleStartDate");
    const frequencySelect = document.getElementById("scheduleFrequency");

    if (!scheduleList && !todayUpdates && !existingBookSelect) return;

    if (existingBookSelect) {
        existingBookSelect.innerHTML = "<option value=''>手動で入力</option>";
        books.forEach((book) => {
            const option = document.createElement("option");
            option.value = book.id;
            option.textContent = `${book.title} / ${book.author}`;
            existingBookSelect.appendChild(option);
        });
    }

    if (frequencySelect && startDateInput) {
        startDateInput.closest("label").style.display = frequencySelect.value === "biweekly" ? "block" : "none";
    }

    const items = await getScheduleItems();
    const todayItems = items.filter(isItemUpdatingToday);

    renderReadingCalendar(items);

    if (todayUpdates) {
        todayUpdates.innerHTML = todayItems.length
            ? todayItems.map((item) => `
                <div class="schedule-card">
                    <strong>${escapeHTML(item.title)}</strong>
                    <p>${escapeHTML(item.author)}</p>
                    <p>${getWeekdayLabel(item.weekday)}・${item.frequency === "weekly" ? "週刊" : "隔週"}</p>
                    ${item.link ? `<p><a href="${escapeHTML(item.link)}" target="_blank" rel="noopener">作品ページに移動</a></p>` : ""}
                </div>
            `).join("")
            : "<p>今日更新の作品はまだありません。</p>";
    }

    if (scheduleList) {
        if (!items.length) {
            scheduleList.innerHTML = "<p>まだ更新スケジュールが登録されていません。</p>";
            return;
        }

        scheduleList.innerHTML = items.map((item) => `
            <div class="schedule-card">
                <div class="schedule-card-header">
                    <strong>${escapeHTML(item.title)}</strong>
                    <button class="small-button" onclick="deleteScheduleItem('${item.id}')">削除</button>
                </div>
                <p>${escapeHTML(item.author)}</p>
                <p>更新頻度：${item.frequency === "weekly" ? "週刊" : "隔週"}</p>
                <p>更新曜日：${getWeekdayLabel(item.weekday)}</p>
                ${item.frequency === "biweekly" ? `<p>隔週スタート：${formatDateToJp(item.startDate)}</p>` : ""}
                <p>次回更新：${getNextUpdateLabel(item)}</p>
                ${item.link ? `<p><a href="${escapeHTML(item.link)}" target="_blank" rel="noopener">作品ページへ</a></p>` : ""}
            </div>
        `).join("");
    }
}

async function addScheduleItem() {
    const title = document.getElementById("scheduleTitle")?.value.trim();
    const author = document.getElementById("scheduleAuthor")?.value.trim();
    const link = document.getElementById("scheduleLink")?.value.trim();
    const frequency = document.getElementById("scheduleFrequency")?.value;
    const weekday = document.getElementById("scheduleWeekday")?.value;
    const startDate = document.getElementById("scheduleStartDate")?.value;
    const existingBook = document.getElementById("existingBook")?.value;

    if (!title || !weekday) {
        alert("タイトルと更新曜日を設定してください。");
        return;
    }

    const item = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        author,
        link,
        frequency,
        weekday,
        startDate: frequency === "biweekly" ? (startDate || getDateOfWeekday(new Date(), weekday).toISOString().slice(0, 10)) : "",
        bookId: existingBook || null,
    };

    const items = await getScheduleItems();
    items.push(item);
    await saveScheduleItems(items);
    renderSchedulePage();
    alert("更新スケジュールを登録しました。");
}

async function deleteScheduleItem(itemId) {
    const items = await getScheduleItems();
    const updated = items.filter((item) => item.id !== itemId);
    await saveScheduleItems(updated);
    renderSchedulePage();
}

function handleExistingBookChange() {
    const bookId = document.getElementById("existingBook")?.value;
    const titleInput = document.getElementById("scheduleTitle");
    const authorInput = document.getElementById("scheduleAuthor");
    if (!titleInput || !authorInput) return;
    if (!bookId) {
        titleInput.value = "";
        authorInput.value = "";
        return;
    }
    const book = books.find((item) => String(item.id) === String(bookId));
    if (book) {
        titleInput.value = book.title;
        authorInput.value = book.author;
    }
}

function handleFrequencyChange() {
    const frequencySelect = document.getElementById("scheduleFrequency");
    const startDateLabel = document.getElementById("scheduleStartDate")?.closest("label");
    if (frequencySelect && startDateLabel) {
        startDateLabel.style.display = frequencySelect.value === "biweekly" ? "block" : "none";
    }
}

let currentRating = 0;

function setRating(rating) {
    currentRating = rating;
    const stars = document.querySelectorAll("#rating span");
    stars.forEach((star, index) => {
        star.textContent = index < rating ? "★" : "☆";
    });
}

async function addBook() {
    const title = document.getElementById("title").value;
    const author = document.getElementById("author").value;
    const purchased = document.getElementById("purchased").checked;
    const status = document.getElementById("status").value;

    if (title === "") return;

    const user = await getCurrentUser();

    const { error } = await supabase
        .from("books")
        .insert({
        user_id: user.id,
        title: title,
        author: author,
        image: "",
        isbn: "",
        publisher: "publisher",
        publish_date: "",
        pages: 0,
        rating: currentRating,
        purchased: purchased,
        status: status
    });

    if (error) {
        console.error(error);
        alert("本の登録に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();

    alert("登録しました");

    document.getElementById("title").value = "";
    document.getElementById("author").value = "";
    document.getElementById("purchased").checked = false;
    document.getElementById("status").value = "unread";

    currentRating = 0;
    setRating(0);
}

async function addRakutenBook(info) {

    const user = await getCurrentUser();

    const { data, error } = await supabase
        .from("books")
        .insert({
        user_id: user.id,
        title: info.title,
        author: info.author,
        image: info.largeImageUrl || "",
        isbn: info.isbn || "",
        publisher: info.publisherName || "",
        publish_date: info.salesDate || "",
        pages: 0,
        rating: 0,
        purchased: false,
        status: "unread"
    });

    if (error) {
        console.error(error);
        alert("本の登録に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();

    alert("登録しました");
}

function displayBooks() {
    const list = document.getElementById("bookList");
    const search = document.getElementById("search");
    const stats = document.getElementById("bookStats");

    if (!list || !search) return;

    const keyword = search.value.toLowerCase();
    const sortType = document.getElementById("sortType")?.value || "none";

    // 本の統計を表示
    if (stats) {
        const total = books.length;
        const unread = books.filter(book => book.status === "unread").length;
        const reading = books.filter(book => book.status === "reading").length;
        const finished = books.filter(book => book.status === "finished").length;

        const rate = total === 0 ? 0 : Math.round(finished / total * 100);

        stats.innerHTML = `
        📚 総数：${total}冊　
        📖 未読：${unread}冊　
        📘 読書中：${reading}冊　
        ✅ 読了：${finished}冊　
        📊 読了率：${rate}%
        `;
    }

    list.innerHTML = "";

    let sortedBooks = [...books];

    if (sortType === "rating") {
        sortedBooks.sort((a, b) => b.rating - a.rating);
    }

    if (sortType === "title") {
        sortedBooks.sort((a, b) => a.title.localeCompare(b.title, "ja"));
    }

    // 💡 ループ中に何度もinnerHTML+=すると描画のたびに再計算が走るため、
    // 一旦配列にHTML文字列をためて最後にまとめて書き込む
    const htmlParts = [];

    sortedBooks.forEach((book) => {

    const matchesKeyword =
        book.title.toLowerCase().includes(keyword) ||
        book.author.toLowerCase().includes(keyword);

    const matchesTab =
        currentTab === "all" || book.status === currentTab;

    if (matchesKeyword && matchesTab) {

        htmlParts.push(`
            <div class="book">
                <img src="${escapeHTML(book.image || "")}" alt="表紙" class="book-image">

                <div class="book-info">
                    <h3>${escapeHTML(book.title)}</h3>
                    <p>著者：${escapeHTML(book.author)}</p>
                    <p>出版社：${escapeHTML(book.publisher || "不明")}</p>
                    <p>ISBN：${escapeHTML(book.isbn || "なし")}</p>

                    <p>
                        評価：
                        ${book.rating === 0 ? "<span class='no-rating'>未評価</span>" : ""}
                        ${[1,2,3,4,5].map(star => `
                            <span onclick="changeRating('${book.id}', ${star})" class="star">
                                ${star <= book.rating ? "★" : "☆"}
                            </span>
                        `).join("")}
                    </p>

                    <p>
                        購入：${book.purchased ? "購入済み" : "未購入"}
                        <button onclick="togglePurchased('${book.id}')">
                            ${book.purchased ? "未購入に戻す" : "購入済みにする"}
                        </button>
                    </p>

                    <p class="status-wrap">
                        読書状況：
                        <button class="status-current" onclick="toggleStatusMenu('${book.id}')">
                            ${book.status === "unread" ? "未読" : book.status === "reading" ? "読書中" : "読了済み"} ▾
                        </button>

                        <span id="statusMenu-${book.id}" class="status-menu" style="display:none;">
                            <button onclick="changeStatus('${book.id}', 'unread')">未読</button>
                            <button onclick="changeStatus('${book.id}', 'reading')">読書中</button>
                            <button onclick="changeStatus('${book.id}', 'finished')">読了済み</button>
                        </span>
                    </p>

                    <button onclick="deleteBook('${book.id}')">削除</button>
                </div>
            </div>
        `);

    }

});

    list.innerHTML = htmlParts.join("");
}

async function changeRating(bookId, rating) {
    const book = books.find(b => String(b.id) === String(bookId));
    if (!book) return;

    const newRating = (book.rating === rating) ? 0 : rating;

    const { error } = await supabase
        .from("books")
        .update({ rating: newRating })
        .eq("id", book.id);

    if (error) {
        console.error(error);
        alert("評価の更新に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
}

async function deleteBook(bookId) {
    const book = books.find(b => String(b.id) === String(bookId));
    if (!book) return;

    const { error } = await supabase
        .from("books")
        .delete()
        .eq("id", book.id);

    if (error) {
        console.error(error);
        alert("本の削除に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
}

async function togglePurchased(bookId) {
    const book = books.find(b => String(b.id) === String(bookId));
    if (!book) return;

    const { error } = await supabase
        .from("books")
        .update({
            purchased: !book.purchased
        })
        .eq("id", book.id);

    if (error) {
        console.error(error);
        alert("購入状態の更新に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
}


async function changeStatus(bookId, status) {
    const { error } = await supabase
        .from("books")
        .update({ status })
        .eq("id", bookId);

    if (error) {
        console.error(error);
        alert("読書状態の更新に失敗しました");
        return;
    }

    await loadBooks();
    document.getElementById(`statusMenu-${bookId}`)?.style.setProperty("display", "none");
}

function toggleStatusMenu(bookId) {
    const menu = document.getElementById(`statusMenu-${bookId}`);
    if (!menu) return;
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
}
window.toggleStatusMenu = toggleStatusMenu;

async function searchBook() {
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

// 楽天ブックスAPIの結果を、共通の形（title, author, isbnなど）に揃えて返す
async function fetchRakutenResults(keyword, searchType) {
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

function displaySearchResult(items) {
    allSearchResults = items;
    currentSearchPage = 1;
    renderSearchPage();
}

function renderSearchPage() {
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
        `;

        const button = document.createElement("button");
        button.textContent = "登録";
        button.onclick = () => addRakutenBook(info);

        div.appendChild(button);
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
    prevBtn.textContent = "← 前へ";
    prevBtn.disabled = currentSearchPage === 1;
    prevBtn.onclick = () => {
        currentSearchPage--;
        renderSearchPage();
    };

    const pageLabel = document.createElement("span");
    pageLabel.textContent = `${currentSearchPage} / ${totalPages} ページ`;

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "次へ →";
    nextBtn.disabled = currentSearchPage === totalPages;
    nextBtn.onclick = () => {
        currentSearchPage++;
        renderSearchPage();
    };

    pagerDiv.appendChild(prevBtn);
    pagerDiv.appendChild(pageLabel);
    pagerDiv.appendChild(nextBtn);

    result.appendChild(pagerDiv);
}

function switchTab(tabName) {
    currentTab = tabName; // タブの状態を更新

    // すべてのタブボタンから active クラスを一度消す
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    // クリックされたボタンだけに active クラスをつける
    document.getElementById(`tab-${tabName}`)?.classList.add("active");

    // 画面を再表示してフィルターをかける
    displayBooks();
}

const signinBtn=document.getElementById("signinBtn");

if(signinBtn){

    signinBtn.addEventListener("click",async()=>{

        const email=document.getElementById("email").value;
        const password=document.getElementById("password").value;
        try{

            await signIn(email,password);

            location.href="index.html";

        }
        catch(e){
            console.error(e);
            alert(e.message);
            document.getElementById("auth-message").textContent = e.message;
        }

    });

}

const signupBtn=document.getElementById("signupBtn");

if(signupBtn){

    signupBtn.addEventListener("click",async()=>{

        const email=document.getElementById("email").value;
        const password=document.getElementById("password").value;
        try{

            await signUp(email,password);

            document.getElementById("auth-message").textContent=
            "確認メールを送信しました。";
        }catch(e){

            document.getElementById("auth-message").textContent=e.message;

        }

    });

}

(async () => {
    const user = await getCurrentUser();

    const page = location.pathname.split("/").pop();

    if (
        !user &&
        (
            page === "list.html" ||
            page === "search.html" ||
            page === "settings.html" ||
            page === "updates.html"
        )
    ) {
        location.href = "login.html";
    }
})();

const searchBtn = document.getElementById("searchBtn");
if (searchBtn) searchBtn.addEventListener("click", searchBook);

window.switchTab = switchTab; // HTMLから呼べるように公開
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

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        await signOut();
        location.href = "login.html";
    });
}
