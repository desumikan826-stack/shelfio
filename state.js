import { books } from './state.js';
import { escapeHTML } from './supabaseClient.js';

// 💡 今月の積読増減：
// 増加＝今月登録されて今も未読のままの本
// 減少＝先月以前から未読だったが、今月中に未読以外へ変わった本
export function getMonthlyTsundokuChange(bookList) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const addedThisMonth = bookList.filter((book) => {
        if (book.status !== "unread" || !book.created_at) return false;
        return new Date(book.created_at) >= startOfMonth;
    }).length;

    const resolvedThisMonth = bookList.filter((book) => {
        if (book.status === "unread" || !book.created_at || !book.updated_at) return false;
        const created = new Date(book.created_at);
        const updated = new Date(book.updated_at);
        return created < startOfMonth && updated >= startOfMonth;
    }).length;

    return addedThisMonth - resolvedThisMonth;
}

// 💡 統計ページ用：直近数か月分の「積読増減」を月ごとに集計（getMonthlyTsundokuChangeの複数月版）
export function getMonthlyTsundokuSeries(bookList, monthsBack = 6) {
    const now = new Date();
    const months = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        months.push({ start, end, label: `${start.getFullYear()}/${start.getMonth() + 1}` });
    }

    return months.map(({ start, end, label }) => {
        const added = bookList.filter((book) => {
            if (book.status !== "unread" || !book.created_at) return false;
            const created = new Date(book.created_at);
            return created >= start && created < end;
        }).length;

        const resolved = bookList.filter((book) => {
            if (book.status === "unread" || !book.created_at || !book.updated_at) return false;
            const created = new Date(book.created_at);
            const updated = new Date(book.updated_at);
            return created < start && updated >= start && updated < end;
        }).length;

        return { label, net: added - resolved };
    });
}

// 💡 統計ページ用：読書状況（未読/読書中/読了）の内訳
export function getStatusBreakdown(bookList) {
    return {
        unread: bookList.filter((book) => book.status === "unread").length,
        reading: bookList.filter((book) => book.status === "reading").length,
        finished: bookList.filter((book) => book.status === "finished").length,
    };
}

let statusPieChartInstance = null;
let tsundokuLineChartInstance = null;

function formatTimelineDate(dateStr) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 💡 統計ページ用：本ごとの「読み始めた日(started_at)」「読了した日(finished_at)」を
// 時系列（新しい順）に並べたタイムラインを #readingTimeline に描画する
function renderReadingTimeline() {
    const container = document.getElementById("readingTimeline");
    if (!container) return; // stats.html以外では何もしない

    const events = [];

    books.forEach((book) => {
        if (book.started_at) {
            events.push({
                date: book.started_at,
                type: "start",
                title: book.title,
                author: book.author,
            });
        }
        if (book.finished_at) {
            events.push({
                date: book.finished_at,
                type: "finish",
                title: book.title,
                author: book.author,
            });
        }
    });

    if (!events.length) {
        container.innerHTML = `<div class="empty-state">🗓 <p>読み始め・読了の記録はまだありません。本棚で「読書中」「読了済み」に変更すると記録されます。</p></div>`;
        return;
    }

    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = `
        <div class="timeline">
            ${events.map((ev) => `
                <div class="timeline-item timeline-${ev.type}">
                    <div class="timeline-marker">${ev.type === "start" ? "📖" : "✅"}</div>
                    <div class="timeline-content">
                        <p class="timeline-date">${formatTimelineDate(ev.date)}</p>
                        <p class="timeline-title">${ev.type === "start" ? "読み始めた" : "読了した"}：${escapeHTML(ev.title)}</p>
                        <p class="timeline-author">${escapeHTML(ev.author || "")}</p>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

// 💡 stats.html にある2つのcanvasにChart.jsでグラフを描画する
// （stats.html以外のページにはcanvasが無いので何もしない）
export function renderStatsPage() {
    renderReadingTimeline();

    const pieCanvas = document.getElementById("statusPieChart");
    const lineCanvas = document.getElementById("tsundokuLineChart");
    if (!pieCanvas && !lineCanvas) return;

    if (typeof Chart === "undefined") {
        console.warn("Chart.js が読み込まれていません。stats.html に <script> タグがあるか確認してください。");
        return;
    }

    if (pieCanvas) {
        const breakdown = getStatusBreakdown(books);
        if (statusPieChartInstance) statusPieChartInstance.destroy();
        statusPieChartInstance = new Chart(pieCanvas, {
            type: "pie",
            data: {
                labels: ["未読", "読書中", "読了"],
                datasets: [{
                    data: [breakdown.unread, breakdown.reading, breakdown.finished],
                    backgroundColor: ["#ff3b30", "#ffcc00", "#34c759"],
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { position: "bottom" } },
            },
        });
    }

    if (lineCanvas) {
        const series = getMonthlyTsundokuSeries(books, 6);
        if (tsundokuLineChartInstance) tsundokuLineChartInstance.destroy();
        tsundokuLineChartInstance = new Chart(lineCanvas, {
            type: "line",
            data: {
                labels: series.map((item) => item.label),
                datasets: [{
                    label: "積読増減（冊）",
                    data: series.map((item) => item.net),
                    borderColor: "#4A90E2",
                    backgroundColor: "rgba(74, 144, 226, .15)",
                    tension: 0.3,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            },
        });
    }
}