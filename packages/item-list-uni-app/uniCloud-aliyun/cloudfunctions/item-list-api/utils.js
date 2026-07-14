// 纯工具函数, 从原 worker/index.ts 迁移, 不依赖运行时环境

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayDate() {
	return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
	const date = new Date(`${dateString}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function roundQuantity(value) {
	return Number.parseFloat(value.toFixed(3));
}

function normalizeTagNames(values) {
	const normalized = values
		.map((v) => (typeof v === "string" ? v.trim() : ""))
		.filter((v) => v.length > 0);
	return Array.from(new Set(normalized)).sort((a, b) =>
		a.localeCompare(b, "zh-Hans-CN")
	);
}

function parseTagNames(value) {
	if (!value) return [];
	return normalizeTagNames(value.split("\n"));
}

module.exports = {
	ISO_DATE_PATTERN,
	todayDate,
	addDays,
	roundQuantity,
	normalizeTagNames,
	parseTagNames,
};
