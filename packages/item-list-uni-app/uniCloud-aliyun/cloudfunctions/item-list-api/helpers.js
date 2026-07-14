// 输入解析、行映射、存在性校验、使用量统计
// 从原 worker/index.ts 迁移, is_active 由 0/1 改为 bool

const { ISO_DATE_PATTERN, roundQuantity, parseTagNames } = require("./utils.js");
const { first, byId, count } = require("./db.js");

const MAX_LIST_LIMIT = 200;

class ApiError extends Error {
	constructor(status, message, details) {
		super(message);
		this.status = status;
		this.details = details;
	}
}

// ---------- 请求体 / 查询参数解析 ----------
async function readJson(c) {
	try {
		return await c.req.json();
	} catch {
		throw new ApiError(400, "Request body must be valid JSON.");
	}
}

function getRequiredString(payload, fieldName) {
	const value = payload[fieldName];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ApiError(400, `${fieldName} must be a non-empty string.`);
	}
	return value.trim();
}

function getOptionalString(payload, fieldName) {
	const value = payload[fieldName];
	if (value === undefined || value === null || value === "") {
		return null;
	}
	if (typeof value !== "string") {
		throw new ApiError(400, `${fieldName} must be a string.`);
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function getOptionalStringArray(payload, fieldName) {
	const value = payload[fieldName];
	if (value === undefined || value === null) {
		return [];
	}
	if (!Array.isArray(value)) {
		throw new ApiError(400, `${fieldName} must be an array of strings.`);
	}
	for (const entry of value) {
		if (typeof entry !== "string") {
			throw new ApiError(400, `${fieldName} must be an array of strings.`);
		}
	}
	return value
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}

function getRequiredBoolean(payload, fieldName) {
	const value = payload[fieldName];
	if (typeof value !== "boolean") {
		throw new ApiError(400, `${fieldName} must be a boolean.`);
	}
	return value;
}

function getPositiveNumber(payload, fieldName) {
	const value = payload[fieldName];
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new ApiError(400, `${fieldName} must be a positive number.`);
	}
	return roundQuantity(value);
}

function getOptionalNonNegativeNumber(payload, fieldName) {
	const value = payload[fieldName];
	if (value === undefined || value === null || value === "") {
		return null;
	}
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new ApiError(400, `${fieldName} must be a non-negative number.`);
	}
	return roundQuantity(value);
}

function getOptionalInteger(payload, fieldName) {
	const value = payload[fieldName];
	if (value === undefined || value === null || value === "") {
		return null;
	}
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new ApiError(400, `${fieldName} must be a non-negative integer.`);
	}
	return value;
}

function getOptionalDate(payload, fieldName) {
	const value = getOptionalString(payload, fieldName);
	if (value === null) {
		return null;
	}
	if (!ISO_DATE_PATTERN.test(value)) {
		throw new ApiError(400, `${fieldName} must use YYYY-MM-DD format.`);
	}
	return value;
}

function parsePositiveInteger(value, defaultValue) {
	if (value === undefined) {
		return defaultValue;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new ApiError(400, "Expected a positive integer query parameter.");
	}
	return parsed;
}

function parseLimit(value, defaultValue) {
	const parsed = parsePositiveInteger(value, defaultValue);
	return Math.min(parsed, MAX_LIST_LIMIT);
}

function parseOptionalBoolean(value) {
	if (value === undefined) {
		return undefined;
	}
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	throw new ApiError(400, "Boolean query parameters must be true or false.");
}

function normalizeQueryValue(value) {
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

function getRequiredTagNameFromRoute(value, fieldName) {
	const normalized = normalizeQueryValue(value);
	if (!normalized) {
		throw new ApiError(400, `${fieldName} must be a non-empty string.`);
	}
	return normalized;
}

function parseTagNamesQuery(value) {
	if (value === undefined) {
		return [];
	}
	return value
		.split(",")
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}

// ---------- 行映射 ----------
function mapBaseOption(row) {
	return {
		id: row._id,
		type: row.option_type,
		code: row.option_code,
		name: row.option_name,
		sortOrder: row.sort_order,
		isActive: row.is_active === true,
		remark: row.remark ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapItemSummary(row) {
	return {
		id: row._id,
		name: row.item_name,
		code: row.item_code ?? null,
		categoryCode: row.category_code,
		unitCode: row.unit_code,
		defaultLocationCode: row.default_location_code ?? null,
		defaultShelfLifeDays: row.default_shelf_life_days ?? null,
		minStockAlert: row.min_stock_alert,
		remark: row.remark ?? null,
		isActive: row.is_active === true,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		currentQuantity: roundQuantity(row.current_quantity ?? 0),
		nearestExpiryDate: row.nearest_expiry_date ?? null,
		expiredBatchCount: row.expired_batch_count ?? 0,
		expiringBatchCount: row.expiring_batch_count ?? 0,
		tagNames: parseTagNames(row.tag_names),
	};
}

function mapBatch(row) {
	return {
		id: row._id,
		itemId: row.item_id,
		quantity: roundQuantity(row.batch_quantity ?? row.quantity),
		usedQuantity: roundQuantity(row.used_quantity ?? 0),
		remainingQuantity: roundQuantity(row.remaining_quantity ?? 0),
		purchasedAt: row.purchased_at,
		productionDate: row.production_date ?? null,
		expiryDate: row.expiry_date ?? null,
		locationCode: row.location_code ?? null,
		supplier: row.supplier ?? null,
		unitPrice: row.unit_price ?? null,
		note: row.note ?? null,
		createdAt: row.created_at,
	};
}

function mapMovement(row) {
	return {
		id: row._id,
		itemId: row.item_id,
		itemName: row.item_name,
		itemCode: row.item_code ?? null,
		batchId: row.batch_id ?? null,
		type: row.movement_type,
		quantity: roundQuantity(row.quantity),
		movementDate: row.movement_date,
		reasonCode: row.reason_code ?? null,
		locationCode: row.location_code ?? null,
		unitPrice: row.unit_price ?? null,
		note: row.note ?? null,
		expiryDate: row.expiry_date ?? null,
		createdAt: row.created_at,
	};
}

function mapDashboard(row) {
	return {
		totalItems: row.total_items ?? 0,
		itemsInStock: row.items_in_stock ?? 0,
		itemsOutOfStock: row.items_out_of_stock ?? 0,
		totalQuantity: roundQuantity(row.total_quantity ?? 0),
		itemsBelowMinStock: row.items_below_min_stock ?? 0,
		itemsExpiringSoon: row.items_expiring_soon ?? 0,
		itemsWithExpiredStock: row.items_with_expired_stock ?? 0,
	};
}

// ---------- 存在性校验 / 使用量 ----------
async function ensureOptionExists(type, code) {
	if (code === null || code === undefined) {
		return;
	}
	const option = await first("base_options", {
		option_type: type,
		option_code: code,
		is_active: true,
	});
	if (!option) {
		throw new ApiError(400, `Unknown ${type} option: ${code}.`);
	}
}

async function ensureItemExists(itemId) {
	const item = await byId("items", itemId);
	if (!item) {
		throw new ApiError(404, "Item not found.");
	}
	return item;
}

async function getBaseOptionUsageCount(type, code) {
	if (type === "category") {
		return await count("items", { category_code: code });
	}
	if (type === "unit") {
		return await count("items", { unit_code: code });
	}
	if (type === "location") {
		const ic = await count("items", { default_location_code: code });
		const bc = await count("stock_batches", { location_code: code });
		const mc = await count("stock_movements", { location_code: code });
		return ic + bc + mc;
	}
	if (type === "outbound_reason") {
		return await count("stock_movements", { reason_code: code });
	}
	return 0;
}

module.exports = {
	MAX_LIST_LIMIT,
	ApiError,
	readJson,
	getRequiredString,
	getOptionalString,
	getOptionalStringArray,
	getRequiredBoolean,
	getPositiveNumber,
	getOptionalNonNegativeNumber,
	getOptionalInteger,
	getOptionalDate,
	parsePositiveInteger,
	parseLimit,
	parseOptionalBoolean,
	normalizeQueryValue,
	getRequiredTagNameFromRoute,
	parseTagNamesQuery,
	mapBaseOption,
	mapItemSummary,
	mapBatch,
	mapMovement,
	mapDashboard,
	ensureOptionExists,
	ensureItemExists,
	getBaseOptionUsageCount,
};
