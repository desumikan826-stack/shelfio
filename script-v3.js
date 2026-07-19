// 💡 一番安全な初期化方法（これなら絶対に二重宣言エラーになりません）
if (!window.globalSupabase) {
    const supabaseUrl = "https://eqgyfkxiecozflnbypkl.supabase.co";
    const supabaseKey = "sb_publishable_3MQXaPuO9U3O_zub0LPoGg_N2pIYkIJ";
    window.globalSupabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}
const supabase = window.globalSupabase;

let books = [];
let currentTab = 'all'; // 💡 今どのタブが選ばれているかを保存（all, want, read）

console.log("最新版script.js 読み込み成功");

function saveBooks() {
    localStorage.setItem("books", JSON.stringify(books));
}

async function loadBooks() {
    const { data, error } = await supabase
        .from("books")
        .select("*");

    if (error) {
        console.error(error);
        return;
    }

    books = data;
    displayBooks();
}

loadBooks();

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
    const read = document.getElementById("read").checked;

    if (title === "") return;

    await supabase
    .from("books")
    .insert({
        title: title,
        author: author,
        image: "",
        rating: currentRating,
        purchased: purchased,
        read: read
    });

    await loadBooks();

    document.getElementById("title").value = "";
    document.getElementById("author").value = "";
    document.getElementById("purchased").checked = false;
    document.getElementById("read").checked = false;
    currentRating = 0;
    setRating(0);
}

function displayBooks() {
    const list = document.getElementById("bookList");
    const search = document.getElementById("search");

    if (!list || !search) return;

    const keyword = search.value.toLowerCase();
    list.innerHTML = "";

    books.forEach((book, index) => {
        // 💡 1. まずキーワード検索にヒットするかチェック
        const matchesKeyword = book.title.toLowerCase().includes(keyword) || 
                             book.author.toLowerCase().includes(keyword);

        // 💡 2. 次に、現在のタブの条件に一致するかチェック
        let matchesTab = false;
        if (currentTab === 'all') {
            matchesTab = true; // 「すべて」なら無条件でOK
        } else if (currentTab === 'want') {
            matchesTab = !book.read; // 「欲しい本」なら、readがfalse（未読）のものだけ
        } else if (currentTab === 'read') {
            matchesTab = book.read; // 「読んだ本」なら、readがtrue（読了）のものだけ
        }

        // 💡 両方の条件をクリアした本だけを表示する
        if (matchesKeyword && matchesTab) {
            list.innerHTML += `
            <div class="book">
                <img src="${book.image || ""}" alt="表紙" class="book-image">
                <div class="book-info">
                    <h3>${book.title}</h3>
                    <p>著者：${book.author}</p>
                    <p>
                        評価：
                        ${book.rating === 0 ? "<span class='no-rating'>未評価</span>" : ""}
                        ${[1,2,3,4,5].map(star => `
                            <span onclick="changeRating(${index}, ${star})" class="star">
                            ${star <= book.rating ? "★" : "☆"}
                            </span>
                        `).join("")}
                    </p>
                    <p>
                        購入：${book.purchased ? "購入済み" : "未購入"}
                        <button onclick="togglePurchased(${index})">
                            ${book.purchased ? "未購入に戻す" : "購入済みにする"}
                        </button>
                    </p>
                    <p>
                        読書：${book.read ? "読了済み" : "未読"}
                        <button onclick="toggleRead(${index})">
                            ${book.read ? "未読に戻す" : "読了済みにする"}
                        </button>
                    </p>
                    <button onclick="deleteBook(${index})">削除</button>
                </div>
            </div>
            `;
        }
    });
}

function changeRating(index, rating) {
    if (books[index].rating === rating) {
        books[index].rating = 0;
    } else {
        books[index].rating = rating;
    }
    saveBooks();
    displayBooks();
}

function deleteBook(index) {
    books.splice(index, 1);
    saveBooks();
    displayBooks();
}

function togglePurchased(index) {
    books[index].purchased = !books[index].purchased;
    saveBooks();
    displayBooks();
}

function toggleRead(index) {
    books[index].read = !books[index].read;
    saveBooks();
    displayBooks();
}

function openSettings() {
    document.getElementById("settingsModal").style.display = "block";
}

function closeSettings() {
    document.getElementById("settingsModal").style.display = "none";
}

displayBooks();

async function searchBook() {
    const input = document.getElementById("bookSearch");
    if (!input) return;

    const keyword = input.value;
    if (keyword === "") return;

    try {
        const APPLICATION_ID = "246b99d2-5d3f-4cf5-8b60-2ac664b77f76";
        const ACCESS_KEY = "pk_Wg4VWiSclMvhhFtEZ244i6Rg6xuZWGY1X0HoxQRKe7d";

        const url =
            "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404" +
            "?applicationId=" + encodeURIComponent(APPLICATION_ID) +
            "&accessKey=" + encodeURIComponent(ACCESS_KEY) +
            "&title=" + encodeURIComponent(keyword) +
            "&format=json";

        const response = await fetch(url, {
            headers: { "accessKey": ACCESS_KEY }
        });
        
        const data = await response.json();

        if (!response.ok) {
            return;
        }

        displaySearchResult(data.Items);
    } catch (e) {
        console.error(e);
    }
}

function displaySearchResult(items) {
    const result = document.getElementById("searchResult");
    if (!result) return;

    result.innerHTML = "";

    items.forEach((item) => {
        const info = item.Item;
        const div = document.createElement("div");
        div.className = "book";
        div.innerHTML = `
            <img src="${info.largeImageUrl || ""}">
            <h3>${info.title}</h3>
            <p>著者：${info.author}</p>
            <p>発売日：${info.salesDate}</p>
            <p>価格：${info.itemPrice}円</p>
        `;

        const button = document.createElement("button");
        button.textContent = "登録";
        button.onclick = () => addRakutenBook(info);

        div.appendChild(button);
        result.appendChild(div);
    });
}

async function addRakutenBook(info) {

    await supabase
        .from("books")
        .insert({
            title: info.title,
            author: info.author,
            image: info.largeImageUrl,
            rating: 0,
            purchased: false,
            read: false
        });

    await loadBooks();
}

async function testConnection(){
    const { data, error } = await supabase.from("books").select("*");
    console.log(data);
}


function switchTab(tabName) {
    currentTab = tabName; // タブの状態を更新

    // すべてのボタンから active クラスを一度消す
    document.getElementById("tab-all")?.classList.remove("active");
    document.getElementById("tab-want")?.classList.remove("active");
    document.getElementById("tab-read")?.classList.remove("active");

    // クリックされたボタンだけに active クラスをつける
    document.getElementById(`tab-${tabName}`)?.classList.add("active");

    // 画面を再表示してフィルターをかける
    displayBooks();
}

window.switchTab = switchTab; // HTMLから呼べるように公開

const searchBtn = document.getElementById("searchBtn");
if (searchBtn) searchBtn.addEventListener("click", searchBook);