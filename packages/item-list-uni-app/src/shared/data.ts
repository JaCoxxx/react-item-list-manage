import { requestJson } from "./api";
import type {
	ApiResponse,
	PagedResponse,
	BaseOptionGroups,
	DashboardData,
	InventoryItem,
	ItemDetailResponse,
	SetupStatus,
	TagSummary,
} from "./types";
import { buildInventorySearchQuery, buildQueryString } from "./utils";

// 缓存: baseOptions 几乎不变, 全局共享; items 全量缓存供 AI/OCR 匹配; dashboard/detail 短期 TTL
const DASHBOARD_TTL = 30_000;
const DETAIL_TTL = 10_000;
const BASE_OPTIONS_STORAGE_KEY = "item-list-base-options";

let baseOptionsCache: BaseOptionGroups | null = null;
let itemsCache: InventoryItem[] | null = null;
let dashboardCache: { data: DashboardData; ts: number } | null = null;
const itemDetailCache = new Map<string, { data: ItemDetailResponse; ts: number }>();

// ---------- 失效 ----------
export function invalidateBaseOptions() {
	baseOptionsCache = null;
	uni.removeStorageSync(BASE_OPTIONS_STORAGE_KEY);
}

export function invalidateItems() {
	itemsCache = null;
}

export function invalidateItemDetail(itemId?: string) {
	if (itemId) {
		itemDetailCache.delete(itemId);
	} else {
		itemDetailCache.clear();
	}
}

export function invalidateDashboard() {
	dashboardCache = null;
}

export function invalidateAll() {
	invalidateBaseOptions();
	invalidateItems();
	invalidateItemDetail();
	invalidateDashboard();
}

// ---------- baseOptions (内存 + storage 持久化) ----------
export async function loadBaseOptions(includeInactive = false) {
	if (!includeInactive && baseOptionsCache) {
		return { data: baseOptionsCache };
	}
	if (!includeInactive) {
		const stored = uni.getStorageSync(BASE_OPTIONS_STORAGE_KEY);
		if (stored && typeof stored === "object") {
			baseOptionsCache = stored as BaseOptionGroups;
			return { data: baseOptionsCache };
		}
	}
	const query = includeInactive ? "?includeInactive=true" : "";
	const res = await requestJson<ApiResponse<BaseOptionGroups>>(`/api/base-options${query}`);
	if (!includeInactive) {
		baseOptionsCache = res.data;
		uni.setStorageSync(BASE_OPTIONS_STORAGE_KEY, res.data);
	}
	return res;
}

// ---------- items (全量缓存, 分页从缓存切片) ----------
export async function loadItems(
	params: {
		search?: string;
		categoryCode?: string;
		locationCode?: string;
		tagNames?: string[];
		isActive?: boolean;
		page?: number;
		pageSize?: number;
	} = {},
	force = false,
) {
	const isFullActiveQuery =
		!params.search &&
		!params.categoryCode &&
		!params.locationCode &&
		(!params.tagNames || params.tagNames.length === 0) &&
		params.isActive !== false;
	const page = params.page ?? 1;
	const pageSize = params.pageSize ?? 15;

	// 全量查询且 pageSize 大: 缓存全量, 分页从缓存切片
	if (isFullActiveQuery && !force && itemsCache && pageSize >= 200) {
		return {
			data: {
				list: itemsCache,
				total: itemsCache.length,
				page: 1,
				pageSize: itemsCache.length,
				hasMore: false,
			},
		};
	}

	const query = buildInventorySearchQuery({ ...params, page, pageSize });
	const res = await requestJson<ApiResponse<PagedResponse<InventoryItem>>>(
		`/api/items?${query}`,
	);
	// 全量请求 (pageSize 大) 缓存
	if (isFullActiveQuery && pageSize >= 200) {
		itemsCache = res.data.list;
	}
	return res;
}

// ---------- itemDetail (短期 TTL, 避免重复 selectItem 请求) ----------
export async function loadItemDetail(itemId: string, force = false) {
	const now = Date.now();
	const cached = itemDetailCache.get(itemId);
	if (!force && cached && now - cached.ts < DETAIL_TTL) {
		return { data: cached.data };
	}
	const res = await requestJson<ApiResponse<ItemDetailResponse>>(`/api/items/${itemId}`);
	itemDetailCache.set(itemId, { data: res.data, ts: now });
	return res;
}

// ---------- tags ----------
export async function loadTags(search = "", page = 1, pageSize = 15) {
	const query = buildQueryString({ page, pageSize, search });
	return requestJson<ApiResponse<PagedResponse<TagSummary>>>(`/api/tags?${query}`);
}

// ---------- setup / dashboard ----------
export function loadSetupStatus() {
	return requestJson<ApiResponse<SetupStatus>>("/api/setup/status");
}

export async function loadDashboard(force = false) {
	const now = Date.now();
	if (!force && dashboardCache && now - dashboardCache.ts < DASHBOARD_TTL) {
		return { data: dashboardCache.data };
	}
	const res = await requestJson<ApiResponse<DashboardData>>("/api/dashboard");
	dashboardCache = { data: res.data, ts: now };
	return res;
}
