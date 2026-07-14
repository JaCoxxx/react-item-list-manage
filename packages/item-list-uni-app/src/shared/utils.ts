import type {
	AiCommandParseResult,
	BaseOption,
	BaseOptionGroups,
	InventoryItem,
	MenuEntry,
	OcrItemLine,
	PageLayoutMode,
} from "./types";

export const EMPTY_OPTIONS: BaseOption[] = [];

export const MENU_ENTRIES: MenuEntry[] = [
	{ title: "首页统计", copy: "概览库存、基础数据与快捷入口。", url: "/pages/overview/index" },
	{ title: "库存列表", copy: "筛选库存、查看详情并处理入库出库。", url: "/pages/inventory/index" },
	{ title: "快速操作", copy: "对常用物品直接 +1 / -1。", url: "/pages/quick-stock/index" },
	{ title: "物品维护", copy: "新增、编辑、禁用和删除物品档案。", url: "/pages/items/index" },
	{ title: "标签维护", copy: "维护标签目录并查看关联物品数。", url: "/pages/tags/index" },
	{ title: "基础数据", copy: "维护分类、位置、单位和出库原因。", url: "/pages/base-options/index" },
	{ title: "OCR 上传", copy: "调用百度 OCR 识别购物小票。", url: "/pages/ocr-upload/index" },
	{ title: "AI 小票", copy: "调用 AI 识别小票并结构化导入。", url: "/pages/ai-receipt/index" },
	{ title: "对话操作", copy: "用自然语言解析库存指令并执行。", url: "/pages/ai-chat-ops/index" },
	{ title: "工具页", copy: "查看数据概况与调整页面设置。", url: "/pages/tools/index" },
];

export function findOptionName(options: BaseOption[], code: string | null) {
	if (!code) {
		return "未设置";
	}
	return options.find((option) => option.code === code)?.name ?? code;
}

export function displayTypeName(type: string) {
	switch (type) {
		case "category":
			return "分类";
		case "location":
			return "位置";
		case "unit":
			return "单位";
		case "outbound_reason":
			return "出库原因";
		default:
			return type;
	}
}

export function normalizeOptionalText(value: string) {
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

export function todayDate() {
	return new Date().toISOString().slice(0, 10);
}

export function getLayoutClass(mode: PageLayoutMode) {
	if (mode === "two-column") {
		return "layout-two";
	}
	if (mode === "three-column") {
		return "layout-three";
	}
	return "";
}

export function parseTagInput(value: string) {
	return value
		.split(/[\n,，]/)
		.map((item) => item.trim())
		.filter(Boolean);
}

export function formatTags(tags: string[]) {
	return tags.length > 0 ? tags.join(" / ") : "暂无标签";
}

export function baseOptionCount(baseOptions: BaseOptionGroups) {
	return Object.values(baseOptions).reduce((sum, options) => sum + options.length, 0);
}

export function extractTagOptions(items: InventoryItem[]) {
	return Array.from(
		new Set(
			items.flatMap((item) => item.tagNames),
		),
	).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

export function getDefaultCategory(baseOptions: BaseOptionGroups) {
	return (baseOptions.category ?? EMPTY_OPTIONS)[0]?.code ?? "";
}

export function getDefaultUnit(baseOptions: BaseOptionGroups) {
	return (baseOptions.unit ?? EMPTY_OPTIONS)[0]?.code ?? "";
}

export function getDefaultLocation(baseOptions: BaseOptionGroups) {
	return (baseOptions.location ?? EMPTY_OPTIONS)[0]?.code ?? "";
}

export function getDefaultOutboundReason(baseOptions: BaseOptionGroups) {
	const reasons = baseOptions.outbound_reason ?? EMPTY_OPTIONS;
	return reasons.find((option) => option.code === "consume")?.code ?? reasons[0]?.code ?? "";
}

export function parseReceiptQuantity(line: OcrItemLine) {
	const parsed = Number.parseFloat(line.quantity);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function buildQueryString(
	params: Record<string, string | number | boolean | undefined>,
) {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === "") {
			continue;
		}
		parts.push(`${key}=${encodeURIComponent(String(value))}`);
	}
	return parts.join("&");
}

export function buildInventorySearchQuery(params: {
	search?: string;
	categoryCode?: string;
	locationCode?: string;
	tagNames?: string[];
	isActive?: boolean;
	page?: number;
	pageSize?: number;
}) {
	return buildQueryString({
		page: params.page ?? 1,
		pageSize: params.pageSize ?? 15,
		search: params.search,
		categoryCode: params.categoryCode,
		locationCode: params.locationCode,
		tagNames:
			params.tagNames && params.tagNames.length > 0
				? params.tagNames.join(",")
				: undefined,
		isActive:
			typeof params.isActive === "boolean" ? String(params.isActive) : undefined,
	});
}

export function normalizeParsedCommand(
	input: AiCommandParseResult,
	baseOptions: BaseOptionGroups,
) {
	return {
		...input,
		params: {
			...input.params,
			categoryCode: input.params.categoryCode || getDefaultCategory(baseOptions),
			unitCode: input.params.unitCode || getDefaultUnit(baseOptions),
			locationCode: input.params.locationCode || getDefaultLocation(baseOptions) || undefined,
		},
	};
}

export function showToast(title: string, icon: "none" | "success" = "none") {
	uni.showToast({
		title,
		icon,
		duration: 2000,
	});
}

export function showSuccess(title: string) {
	showToast(title, "success");
}

export function navigateTo(url: string) {
	uni.navigateTo({ url });
}

export function previewImage(filePath: string) {
	uni.previewImage({
		current: filePath,
		urls: [filePath],
	});
}

export function confirmAction(content: string) {
	return new Promise<boolean>((resolve) => {
		uni.showModal({
			title: "请确认",
			content,
			success: (result) => {
				resolve(result.confirm);
			},
			fail: () => resolve(false),
		});
	});
}
