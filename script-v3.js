// latest version script.js loaded successfully
console.log("最新版(Auth)script.js 読み込み成功");

// ==========================================
// 1. 初期化とグローバル変数
// ==========================================

// 💡 認証オプション付きで初期化
const supabaseUrl = "https://eqgyfkxiecozflnbypkl.supabase.co";
const supabaseKey = "sb_publishable_3MQXaPuO9U3O_zub0LPoGg_N2pIYkIJ"; 

const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true, // セッションをブラウザに保存する
    autoRefreshToken: true, // トークンを自動更新する
  }
});

// アプリケーションの状態を保持する変数
let books = []; // 書籍リスト
let currentTab = 'all'; // 現在選択されているタブ（all, want, read）
let currentUser = null; // 現在ログインしているユーザーの情報
let currentRating = 0; // 新規追加フォームでの星評価

// ==========================================
// 2. 認証 (Supabase Auth) 関連の関数
// ==========================================

// 2-1. サインアップ (新規登録)
async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });
  if (error) throw error;
  return data;
}

// 2-2. サインイン (ログイン)
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });
  if (error) throw error;
  return data;
}

// 2-3. サインアウト (ログアウト)
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// 💡 ログイン状態を監視するリスナー
// ログイン/ログアウトのたびに、自動的にUI切り替えとデータ読み込みを行う
supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth State Changed:", event, session);
  
  if (session) {
    // 💡 ログインしている状態
    currentUser = session.user;
    console.log("Logged in as:", currentUser.email);
    updateUIForLoggedIn(currentUser); // ヘッダーなどのUIを切り替え
    loadBooks(); // 💡 ログイン後に、そのユーザーの本を読み込む
  } else {
    // 💡 ログアウトしている状態
    currentUser = null;
    console.log("Logged out");
    updateUIForLoggedOut(); // ヘッダーなどのUIを戻す
    books = []; // リストを空にする
    // トップページ (index.html) 以外なら、ログイン画面へ強制移動
    if (window.location.pathname.includes('list.html') || window.location.pathname.includes('search.html')) {
        window.location.href = "login.html";
    }
  }
});


// ==========================================
// 3. UI切り替え用の関数 (ログイン/ログアウト時)
// ==========================================

// 3-1. ログイン後のUI調整
function updateUIForLoggedIn(user) {
    const nav = document.querySelector("header nav");
    if (nav) {
        nav.style.display = "flex"; // ナビゲーションを表示
        // ナビゲーションの最後にログアウトリンクを追加（重複防止付き）
        if (!document.getElementById("signoutNav")) {
            const signoutNav = document.createElement("a");
            signoutNav.id = "signoutNav";
            signoutNav.href = "#";
            signoutNav.textContent = `👋 ${user.email} (ログアウト)`;
            signoutNav.onclick = signOut; // クリックでsignOut関数を実行
            nav.appendChild(signoutNav);
        }
    }

    // トップページ (index.html) のウェルカムメッセージ
    const welcomeMsg = document.getElementById("welcome-message");
    if (welcomeMsg) {
      welcomeMsg.innerHTML = `ようこそ、${user.email}さん！<br>上のメニューから機能を選択してください。`;
    }
}

// 3-2. ログアウト後のUI調整
function updateUIForLoggedOut() {
    const nav = document.querySelector("header nav");
    if (nav) {
        nav.style.display = "none"; // ナビゲーションを非表示
        // ログアウトリンクがあれば削除
        const signoutNav = document.getElementById("signoutNav");
        if (signoutNav) signoutNav.remove();
    }
    // トップページ (index.html) のウェルカムメッセージ
    const welcomeMsg = document.getElementById("welcome-message");
    if (welcomeMsg) {
        welcomeMsg.innerHTML = `最初に <a href="login.html">ログイン / 新規登録</a> してください。<br>ログインすると、プライベートなリストを管理できます。`;
    }
}


// ==========================================
// 4. データ操作 (Supabase DB) 関連の関数
// ==========================================

// ✅ loadBooks: ログインユーザーの本だけを読み込む
async function loadBooks() {
    // displayBooks() 内でのチェック重複を避けるため、ここでもチェック
    if (!currentUser) {
        books = [];
        displayBooks();
        return;
    }

    // 💡 ログインユーザーのIDでデータをフィルター
    const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq('user_id', currentUser.id); 

    if (error) {
        console.error("データ読み込みエラー:", error.message);
        return;
    }

    books = data; // 取得したデータをグローバル変数に保存
    displayBooks(); // 画面を再表示
}

// ✅ saveBooks: localStorageへの保存は削除 (DBに直接保存するため不要)
function saveBooks() {
    // localStorage.setItem("books", JSON.stringify(books));
}


// ==========================================
// 5. 書籍管理用の関数 (追加、削除、変更)
// ==========================================

// 5-1. setRating: 追加フォームでの星評価の設定
function setRating(rating) {
    currentRating = rating;
    const stars = document.querySelectorAll("#rating span");
    stars.forEach((star, index) => {
        star.textContent = index < rating ? "★" : "☆"; // 選択された星までを塗る
    });
}

// ✅ 5-2. addBook: user_idを追加して新規登録
async function addBook() {
    if (!currentUser) {
        alert("ログインしてください。");
        return;
    }

    const titleInput = document.getElementById("title");
    const authorInput = document.getElementById("author");
    const purchasedInput = document.getElementById("purchased");
    const readInput = document.getElementById("read");

    const title = titleInput.value;
    const author = authorInput.value;
    const purchased = purchasedInput.checked;
    const read = readInput.checked;

    if (title === "") {
        alert("タイトルを入力してください。");
        return;
    }

    // SupabaseのDBにデータを挿入
    const { error } = await supabase
    .from("books")
    .insert({
        title: title,
        author: author,
        image: "", // 手動追加時は空
        rating: currentRating,
        purchased: purchased,
        read: read,
        user_id: currentUser.id // 💡 ログインユーザーのIDを追加
    });

    if (error) {
        console.error("追加エラー:", error.message);
        alert("追加に失敗しました。");
        return;
    }

    await loadBooks(); // リストを再読み込みして画面を更新

    // フォームをクリア
    titleInput.value = "";
    authorInput.value = "";
    purchasedInput.checked = false;
    readInput.checked = false;
    currentRating = 0;
    setRating(0);
}

// ✅ 5-3. addRakutenBook: 楽天API検索結果からuser_idを追加して登録
async function addRakutenBook(info) {
    if (!currentUser) {
        alert("ログインしてください。");
        return;
    }

    const { error } = await supabase
    .from("books")
    .insert({
        title: info.title,
        author: info.author,
        image: info.largeImageUrl,
        rating: 0, // 検索結果からは評価なし
        purchased: false,
        read: false,
        user_id: currentUser.id // 💡 user_idを追加
    });

    if (error) {
        console.error("追加エラー:", error.message);
        alert("追加に失敗しました。");
        return;
    }

    await loadBooks(); // 画面を更新
}

// ✅ 5-4. changeRating: 星評価を変更
async function changeRating(index, rating) {
    if (!currentUser) return;

    const book = books[index];
    if (book.rating === rating) {
        book.rating = 0; // 同じ星をクリックしたら未評価にする
    } else {
        book.rating = rating;
    }

    // DBを更新
    const { error } = await supabase
    .from("books")
    .update({ rating: book.rating })
    .eq('id', book.id); // 💡 id でフィルター

    if (error) {
        console.error("更新エラー:", error.message);
        return;
    }

    displayBooks(); // 画面を更新
}

// ✅ 5-5. deleteBook: 本を削除
async function deleteBook(index) {
    if (!currentUser) return;

    const book = books[index];
    
    if (!confirm(`本当に「${book.title}」を削除しますか？`)) {
        return;
    }

    // DBから削除
    const { error } = await supabase
    .from("books")
    .delete()
    .eq('id', book.id); // 💡 id でフィルター

    if (error) {
        console.error("削除エラー:", error.message);
        alert("削除に失敗しました。");
        return;
    }

    // グローバル配列からも削除
    books.splice(index, 1);
    displayBooks(); // 画面を更新
}

// ✅ 5-6. togglePurchased: 購入状態を切り替え
async function togglePurchased(index) {
    if (!currentUser) return;

    const book = books[index];
    book.purchased = !book.purchased;

    // DBを更新
    const { error } = await supabase
    .from("books")
    .update({ purchased: book.purchased })
    .eq('id', book.id); // id でフィルター

    if (error) {
        console.error("更新エラー:", error.message);
        return;
    }

    displayBooks(); // 画面を更新
}

// ✅ 5-7. toggleRead: 読書状態を切り替え
async function toggleRead(index) {
    if (!currentUser) return;

    const book = books[index];
    book.read = !book.read;

    // DBを更新
    const { error } = await supabase
    .from("books")
    .update({ read: book.read })
    .eq('id', book.id); // id でフィルター

    if (error) {
        console.error("更新エラー:", error.message);
        return;
    }

    displayBooks(); // 画面を更新
}


// ==========================================
// 6. UI表示 (本の一覧、検索結果、モーダル)
// ==========================================

// 6-1. displayBooks: 本の一覧を画面に表示 (フィルター付き)
function displayBooks() {
    const list = document.getElementById("bookList");
    const search = document.getElementById("search");

    if (!list || !search) return; // 画面に要素がなければ処理しない

    if (!currentUser) {
        list.innerHTML = "<p>ログインして本の一覧を表示してください。</p>";
        return;
    }

    const keyword = search.value.toLowerCase(); // 検索キーワード
    list.innerHTML = ""; // 一旦リストを空にする

    books.forEach((book, index) => {
        // 💡 1. まずキーワード検索にヒットするかチェック
        const matchesKeyword = book.title.toLowerCase().includes(keyword) || 
                             book.author.toLowerCase().includes(keyword);

        // 💡 2. 次に、現在のタブの条件に一致するかチェック
        let matchesTab = false;
        if (currentTab === 'all') {
            matchesTab = true; // 「すべて」なら無条件でOK
        } else if (currentTab === 'want') {
            matchesTab = !book.read; // 「欲しい本」なら、未読のものだけ
        } else if (currentTab === 'read') {
            matchesTab = book.read; // 「読んだ本」なら、読了のものだけ
        }

        // 💡 両方の条件をクリアした本だけを表示する
        if (matchesKeyword && matchesTab) {
            list.innerHTML += `
            <div class="book">
                <img src="${book.image || "noimage.png"}" alt="表紙" class="book-image">
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
                    p>
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
                    <button onclick="deleteBook(${index})" class="delete-btn">削除</button>
                </div>
            </div>
            `;
        }
    });
}

// 6-2. switchTab: タブを切り替える
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

// 6-3. openSettings: 設定モーダルを開く
function openSettings() {
    const modal = document.getElementById("settingsModal");
    if (modal) modal.style.display = "block";
}

// 6-4. closeSettings: 設定モーダルを閉じる
function closeSettings() {
    const modal = document.getElementById("settingsModal");
    if (modal) modal.style.display = "none";
}


// ==========================================
// 7. 外部サービス連携 (楽天 Books API)
// ==========================================

// ✅ 7-1. searchBook: 楽天 Books 検索
async function searchBook() {
    const input = document.getElementById("bookSearch");
    const result = document.getElementById("searchResult");
    if (!input || !result) return;

    if (!currentUser) {
        alert("ログインしてください。");
        return;
    }

    const keyword = input.value;
    if (keyword === "") return;

    result.innerHTML = "検索中...";

    try {
        // 💡 あなたの楽天APIのアプリケーションIDを設定してください
        const APPLICATION_ID = "246b99d2-5d3f-4cf5-8b60-2ac664b77f76"; 

        // APIへのリクエストURLを作成
        const url =
            "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404" +
            "?applicationId=" + encodeURIComponent(APPLICATION_ID) +
            "&title=" + encodeURIComponent(keyword) +
            "&format=json";

        // APIを実行
        const response = await fetch(url);
        
        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || "検索エラー");
        }

        // 検索結果を画面に表示
        displaySearchResult(data.Items);
    } catch (e) {
        console.error("楽天APIエラー:", e);
        result.innerHTML = "検索に失敗しました。: " + e.message;
    }
}

// ✅ 7-2. displaySearchResult: 楽天APIの検索結果を画面に表示
function displaySearchResult(items) {
    const result = document.getElementById("searchResult");

    if (!result) return;

    result.innerHTML = ""; // 検索結果エリアをクリア

    if (items.length === 0) {
        result.innerHTML = "該当する本が見つかりませんでした。";
        return;
    }

    items.forEach((item) => {
        const info = item.Item;
        
        result.innerHTML += `
            <div class="book">
                <img src="${info.largeImageUrl || info.mediumImageUrl || "noimage.png"}" class="book-image">
                <div class="book-info">
                    <h3>${info.title}</h3>
                    <p>著者：${info.author}</p>
                    <p>価格：${info.itemPrice}円</p>
                    <button onclick="addRakutenBook({title: '${info.title.replace(/'/g, "\\'")}', author: '${info.author.replace(/'/g, "\\'")}', largeImageUrl: '${info.largeImageUrl}'})" class="add-btn">リストに追加</button>
                </div>
            </div>
        `;
    });
}


// ==========================================
// 8. イベントリスナーとwindowへの公開
// ==========================================

// index.htmlのログイン/登録ページへの遷移
if (window.location.pathname.includes('index.html')) {
    updateUIForLoggedOut(); // 💡 初期状態は未ログインのUIを表示
}

// login.htmlのイベントリスナー
if (document.getElementById("signinBtn")) {
    document.getElementById("signinBtn").addEventListener("click", async () => {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const msg = document.getElementById("auth-message");
        try {
            await signIn(email, password);
            window.location.href = "index.html"; // サインイン成功でトップへリダイレクト
        } catch (e) {
            msg.textContent = "ログインに失敗しました。: " + e.message;
        }
    });
}

if (document.getElementById("signupBtn")) {
    document.getElementById("signupBtn").addEventListener("click", async () => {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const msg = document.getElementById("auth-message");
        try {
            await signUp(email, password);
            msg.textContent = "確認メールを送信しました。メールを確認してください。";
            msg.style.color = "green";
        } catch (e) {
            msg.textContent = "新規登録に失敗しました。: " + e.message;
            msg.style.color = "red";
        }
    });
}

// 💡 HTMLの onclick などから呼び出せるように、関数を window オブジェクトに公開する
window.searchBook = searchBook;
window.addBook = addBook;
window.addRakutenBook = addRakutenBook; // 👈 忘れずに！
window.deleteBook = deleteBook;
window.changeRating = changeRating;
window.setRating = setRating; // 👈 星設定も公開
window.togglePurchased = togglePurchased;
window.toggleRead = toggleRead;
window.switchTab = switchTab; 
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.displayBooks = displayBooks;
window.signOut = signOut; // 💡 ログアウト関数も公開