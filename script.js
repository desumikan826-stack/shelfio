console.log("最新版script.js");
console.log("script.js 読み込み成功");

let books = [];

function saveBooks() {
    localStorage.setItem("books", JSON.stringify(books));
}

const savedBooks = localStorage.getItem("books");

if (savedBooks) {
    books = JSON.parse(savedBooks);
}

let currentRating = 0;

function setRating(rating) {
    currentRating = rating;

    const stars = document.querySelectorAll("#rating span");

    stars.forEach((star, index) => {
        star.textContent = index < rating ? "★" : "☆";
    });
}

function addBook() {

    const title = document.getElementById("title").value;
    const author = document.getElementById("author").value;
    const purchased = document.getElementById("purchased").checked;
    const read = document.getElementById("read").checked;

    if (title === "") return;

    books.push({
    title: title,
    author: author,
    rating: currentRating,
    purchased: purchased,
    read: read
    }); 

    displayBooks();
    saveBooks();

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

        if (
            book.title.toLowerCase().includes(keyword) ||
            book.author.toLowerCase().includes(keyword)
        ) {

            list.innerHTML += `
            <div class="book">
                <h3>${book.title}</h3>
                <p>著者：${book.author}</p>
                <p>評価：${"★".repeat(book.rating)}${"☆".repeat(5 - book.rating)}</p>
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
            `;
        }

    });

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
        const ACCESS_KEY = "pk_txpz7V5UM30meBVaFsCWQd3FbSH5zHFcB2XZ2whKdXt";


        console.log("APP_ID:", APP_ID);
        console.log("length:", APP_ID.length);

        
        
        
        const url =
            "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404" +
            "?applicationId=" + encodeURIComponent(APPLICATION_ID) +
            "&accessKey=" + encodeURIComponent(ACCESS_KEY) +
            "&title=" + encodeURIComponent(keyword) +
            "&format=json";


        
        
        console.log("APPLICATION_ID =", APPLICATION_ID);
        console.log("ACCESS_KEY =", ACCESS_KEY);

        console.log("URL =", url);



        console.log(url);

        const response = await fetch(url);

        
        console.log(response.status);


        
        const data = await response.json();

        if (!response.ok) {
            console.log(data);
            alert(JSON.stringify(data));
            return;
        }

        console.log(data);



        alert("検索件数: " + data.Items.length);

        displaySearchResult(data.Items);

    } catch (e) {
        console.error(e);
        alert("エラー: " + e.message);
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

function addRakutenBook(info) {

    books.push({

        title: info.title,
        author: info.author,
        rating: 0,
        purchased: false,
        read: false

    });

    saveBooks();
    displayBooks();
}
