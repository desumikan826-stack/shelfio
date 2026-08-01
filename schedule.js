import { escapeHTML, getCurrentUser } from './supabaseClient.js';
import { books, wishlists } from './state.js';

export const WEEKDAYS = [
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
                                        <strong>${item.link
                                            ? `<a href="${escapeHTML(item.link)}" target="_blank" rel="noopener">${escapeHTML(item.title)}</a>`
                                            : escapeHTML(item.title)}</strong>
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

export async function renderSchedulePage() {
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
            scheduleList.innerHTML = `<div class="empty-state">🗓 <p>まだ更新スケジュールが登録されていません。</p></div>`;
            return;
        }

        scheduleList.innerHTML = items.map((item) => `
            <div class="schedule-card">
                <div class="schedule-card-header">
                    <strong>${escapeHTML(item.title)}</strong>
                    <button class="btn btn-danger" onclick="deleteScheduleItem('${item.id}')">削除</button>
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

export async function addScheduleItem() {
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

export async function deleteScheduleItem(itemId) {
    const items = await getScheduleItems();
    const updated = items.filter((item) => item.id !== itemId);
    await saveScheduleItems(updated);
    renderSchedulePage();
}

export function handleExistingBookChange() {
    const bookId = document.getElementById("existingBook")?.value;
    const titleInput = document.getElementById("scheduleTitle");
    const authorInput = document.getElementById("scheduleAuthor");
    if (!titleInput || !authorInput) return;
    if (!bookId) {
        titleInput.value = "";
        authorInput.value = "";
        return;
    }
    const book = [...books, ...wishlists].find((item) => String(item.id) === String(bookId));
    if (book) {
        titleInput.value = book.title;
        authorInput.value = book.author;
    }
}

export function handleFrequencyChange() {
    const frequencySelect = document.getElementById("scheduleFrequency");
    const startDateLabel = document.getElementById("scheduleStartDate")?.closest("label");
    if (frequencySelect && startDateLabel) {
        startDateLabel.style.display = frequencySelect.value === "biweekly" ? "block" : "none";
    }
}