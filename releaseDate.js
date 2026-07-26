function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function parsePublishDate(value) {
    if (!value) return null;

    const trimmed = String(value).trim();
    if (!trimmed) return null;

    const jpMatch = trimmed.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (jpMatch) {
        const [, year, month, day] = jpMatch;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
    }

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

export function formatPublishDate(date) {
    if (!date) return "";
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function getReleaseInfo(publishDateValue) {
    const releaseDate = parsePublishDate(publishDateValue);
    if (!releaseDate) return null;

    const today = startOfDay(new Date());
    const diffDays = Math.round((releaseDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays < 0) return null;

    return {
        releaseDate,
        daysUntil: diffDays,
        isToday: diffDays === 0,
        formattedDate: formatPublishDate(releaseDate),
    };
}

export function formatReleaseDateHtml(publishDateValue) {
    const info = getReleaseInfo(publishDateValue);
    if (!info) return "";

    if (info.isToday) {
        return `<p class="release-badge today">今日発売!!</p>`;
    }

    return `<p class="release-badge upcoming">あと${info.daysUntil}日で発売（${info.formattedDate}）</p>`;
}

export function getReleaseCalendarLabel(publishDateValue) {
    const info = getReleaseInfo(publishDateValue);
    if (!info) return null;
    return info.isToday ? "今日発売!!" : `${info.formattedDate}発売`;
}

export function isReleasingOnDate(publishDateValue, date) {
    const info = getReleaseInfo(publishDateValue);
    if (!info) return false;
    return info.releaseDate.toDateString() === startOfDay(date).toDateString();
}

export function collectUpcomingReleases(items) {
    return items
        .map((item) => {
            const info = getReleaseInfo(item.publish_date);
            if (!info) return null;
            return { item, info };
        })
        .filter(Boolean);
}
