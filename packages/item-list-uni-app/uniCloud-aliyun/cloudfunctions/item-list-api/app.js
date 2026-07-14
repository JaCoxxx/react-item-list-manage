// Hono 应用: 全部路由 + middleware
// 从原 worker/index.ts 迁移, D1 查询换成 uniCloud 云数据库 (db.js), secrets 用 process.env

const crypto = require("crypto");
const { Hono } = require("hono");
const {
	db,
	all,
	first,
	byId,
	insertOne,
	updateById,
	updateWhere,
	deleteById,
	deleteWhere,
	count,
	groupSum,
	getBatchInventory,
	getItemInventory,
	getCurrentQuantity,
	_,
} = require("./db.js");
const {
	todayDate,
	addDays,
	roundQuantity,
	normalizeTagNames,
} = require("./utils.js");
const {
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
} = require("./helpers.js");
const {
	parseAiProvider,
	resolveAiProviderConfig,
	requestAiReceiptOcr,
	requestAiCommandParse,
	validateOpenAiFieldLines,
	validateOpenAiItemLines,
	requestBaiduShoppingReceiptOcr,
	parseBaiduReceiptResult,
	BAIDU_OCR_IMAGE_MAX_BYTES,
} = require("./ocr.js");

const app = new Hono();
const DEFAULT_ALERT_WINDOW_DAYS = 7;

// multipart 文件字段 duck typing (不依赖全局 File)
function isFileLike(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof value.arrayBuffer === "function"
	);
}

function arrayBufferToBase64(buffer) {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

// ---------- 中间件 ----------
app.use("/api/*", async (c, next) => {
	c.header("Cache-Control", "no-store");
	await next();
});

app.onError((error, c) => {
	if (error instanceof ApiError) {
		return c.json({ error: error.message, details: error.details }, error.status);
	}
	console.error(error);
	if (isUniqueConstraintError(error)) {
		return c.json({ error: "A record with the same unique value already exists." }, 409);
	}
	return c.json({ error: "Internal server error." }, 500);
});

function isUniqueConstraintError(error) {
	if (!(error instanceof Error)) return false;
	return /duplicate|E11000|唯一|已存在/.test(error.message || "");
}

// ---------- 内部 helper ----------
async function listBaseOptions(type, options = {}) {
	const where = { option_type: type };
	if (typeof options.isActive === "boolean") {
		where.is_active = options.isActive;
	} else if (!options.includeInactive) {
		where.is_active = true;
	}
	const rows = await all("base_options", where, {
		orderBy: [
			["sort_order", "asc"],
			["option_name", "asc"],
		],
	});
	return rows.map(mapBaseOption);
}

async function getBaseOptionByTypeAndId(type, id) {
	const option = await first("base_options", { option_type: type, _id: id });
	if (!option) {
		throw new ApiError(404, "Base option not found.");
	}
	return option;
}

async function listBaseOptionsGrouped(where) {
	const rows = await all("base_options", where, {
		orderBy: [
			["option_type", "asc"],
			["sort_order", "asc"],
			["option_name", "asc"],
		],
	});
	const grouped = {};
	for (const row of rows) {
		(grouped[row.option_type] ??= []).push(mapBaseOption(row));
	}
	return grouped;
}

// ---------- index / health / setup ----------
const ENDPOINTS = [
	"/api/health",
	"/api/setup/status",
	"/api/base-options",
	"/api/base-options/:type",
	"/api/base-options/:type/:id",
	"/api/tags",
	"/api/tags/:tagName",
	"/api/items",
	"/api/items/:id",
	"/api/stock/in",
	"/api/stock/batches/:id",
	"/api/stock/out",
	"/api/movements",
	"/api/dashboard",
	"/api/alerts",
	"/api/ocr/baidu/receipt",
	"/api/ocr/openai/receipt",
	"/api/ai/command/parse",
];
const apiIndexHandler = (c) =>
	c.json({ data: { name: "item-list-api", version: 1, endpoints: ENDPOINTS } });
app.get("/api", apiIndexHandler);
app.get("/api/", apiIndexHandler);

app.get("/api/health", (c) =>
	c.json({ data: { status: "ok", timestamp: new Date().toISOString() } })
);

app.get("/api/setup/status", async (c) => {
	const required = [
		"base_options",
		"items",
		"item_tags",
		"tags",
		"stock_batches",
		"stock_movements",
	];
	const missing = [];
	let baseOptionCount = 0;
	for (const name of required) {
		try {
			const total = await count(name, {});
			if (name === "base_options") baseOptionCount = total;
		} catch {
			missing.push(name);
		}
	}
	return c.json({
		data: {
			ready: missing.length === 0,
			missingTables: missing,
			missingViews: [],
			baseOptionCount,
		},
	});
});

// ---------- base-options ----------
app.get("/api/base-options", async (c) => {
	const type = c.req.query("type");
	const includeInactive = parseOptionalBoolean(c.req.query("includeInactive")) === true;
	const isActive = parseOptionalBoolean(c.req.query("isActive"));
	if (type) {
		return c.json({
			data: { type, options: await listBaseOptions(type, { includeInactive, isActive }) },
		});
	}
	const where = {};
	if (typeof isActive === "boolean") where.is_active = isActive;
	else if (!includeInactive) where.is_active = true;
	return c.json({ data: await listBaseOptionsGrouped(where) });
});

app.get("/api/base-options/:type", async (c) => {
	const type = c.req.param("type");
	const includeInactive = parseOptionalBoolean(c.req.query("includeInactive")) === true;
	const isActive = parseOptionalBoolean(c.req.query("isActive"));
	return c.json({
		data: { type, options: await listBaseOptions(type, { includeInactive, isActive }) },
	});
});

app.get("/api/base-options/:type/:id", async (c) => {
	const type = c.req.param("type");
	const id = c.req.param("id");
	const option = await getBaseOptionByTypeAndId(type, id);
	return c.json({ data: mapBaseOption(option) });
});

app.post("/api/base-options", async (c) => {
	const payload = await readJson(c);
	const optionType = getRequiredString(payload, "optionType");
	const optionCode = getRequiredString(payload, "optionCode");
	const optionName = getRequiredString(payload, "optionName");
	const sortOrder = getOptionalInteger(payload, "sortOrder") ?? 0;
	const remark = getOptionalString(payload, "remark");
	const isActive = Object.hasOwn(payload, "isActive")
		? getRequiredBoolean(payload, "isActive")
		: true;
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await insertOne("base_options", {
		_id: id,
		option_type: optionType,
		option_code: optionCode,
		option_name: optionName,
		sort_order: sortOrder,
		is_active: isActive,
		remark,
		created_at: now,
		updated_at: now,
	});
	return c.json({ data: { id, created: true } }, 201);
});

app.patch("/api/base-options/:type/:id", async (c) => {
	const type = c.req.param("type");
	const id = c.req.param("id");
	const payload = await readJson(c);
	const current = await getBaseOptionByTypeAndId(type, id);
	const patch = {};
	if (Object.hasOwn(payload, "optionCode")) {
		const nextCode = getRequiredString(payload, "optionCode");
		if (nextCode !== current.option_code) {
			const usage = await getBaseOptionUsageCount(type, current.option_code);
			if (usage > 0) {
				throw new ApiError(409, "Cannot change code for an option in use.", {
					type,
					id,
					code: current.option_code,
					usageCount: usage,
				});
			}
		}
		patch.option_code = nextCode;
	}
	if (Object.hasOwn(payload, "optionName")) patch.option_name = getRequiredString(payload, "optionName");
	if (Object.hasOwn(payload, "sortOrder")) {
		const so = payload.sortOrder;
		if (typeof so !== "number" || !Number.isInteger(so) || so < 0) {
			throw new ApiError(400, "sortOrder must be a non-negative integer.");
		}
		patch.sort_order = so;
	}
	if (Object.hasOwn(payload, "remark")) patch.remark = getOptionalString(payload, "remark");
	if (Object.hasOwn(payload, "isActive")) patch.is_active = getRequiredBoolean(payload, "isActive");
	if (Object.keys(patch).length === 0) {
		throw new ApiError(400, "No valid fields were provided for update.");
	}
	patch.updated_at = new Date().toISOString();
	await updateById("base_options", id, patch);
	return c.json({ data: { id, updated: true } });
});

app.delete("/api/base-options/:type/:id", async (c) => {
	const type = c.req.param("type");
	const id = c.req.param("id");
	const option = await getBaseOptionByTypeAndId(type, id);
	const usage = await getBaseOptionUsageCount(type, option.option_code);
	if (usage > 0) {
		throw new ApiError(409, "Cannot delete option in use.", {
			type,
			id,
			code: option.option_code,
			usageCount: usage,
		});
	}
	await deleteById("base_options", id);
	return c.json({ data: { id, deleted: true } });
});

// ---------- tags ----------
app.get("/api/tags", async (c) => {
	const search = normalizeQueryValue(c.req.query("search"));
	const page = parsePositiveInteger(c.req.query("page"), 1);
	const pageSize = parseLimit(c.req.query("pageSize"), 15);
	const tagDocs = await all("tags", {});
	const itemTagDocs = await all("item_tags", {}, { limit: 10000 });
	const tagSet = new Set();
	for (const t of tagDocs) tagSet.add(t.tag_name);
	for (const it of itemTagDocs) tagSet.add(it.tag_name);
	let names = Array.from(tagSet);
	if (search) {
		const lower = search.toLowerCase();
		names = names.filter((n) => n.toLowerCase().includes(lower));
	}
	names.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
	const total = names.length;
	const start = (page - 1) * pageSize;
	const pagedNames = names.slice(start, start + pageSize);
	const list = [];
	for (const name of pagedNames) {
		const itemIds = new Set();
		for (const it of itemTagDocs) {
			if (it.tag_name === name) itemIds.add(it.item_id);
		}
		list.push({ tagName: name, itemCount: itemIds.size });
	}
	return c.json({
		data: { list, total, page, pageSize, hasMore: start + pageSize < total },
	});
});

app.post("/api/tags", async (c) => {
	const payload = await readJson(c);
	const tagName = getRequiredString(payload, "tagName");
	const now = new Date().toISOString();
	await insertOne("tags", {
		_id: crypto.randomUUID(),
		tag_name: tagName,
		created_at: now,
		updated_at: now,
	});
	return c.json({ data: { tagName, created: true } }, 201);
});

app.patch("/api/tags/:tagName", async (c) => {
	const currentTagName = getRequiredTagNameFromRoute(c.req.param("tagName"), "tagName");
	const payload = await readJson(c);
	const newTagName = getRequiredString(payload, "newTagName");
	const tagDoc = await first("tags", { tag_name: currentTagName });
	const itemTagExists = await first("item_tags", { tag_name: currentTagName });
	if (!tagDoc && !itemTagExists) {
		throw new ApiError(404, "Tag not found.");
	}
	if (newTagName === currentTagName) {
		return c.json({ data: { tagName: currentTagName, updated: true } });
	}
	// 同时拥有 current 和 new tag 的 item: 先删 current, 避免唯一冲突
	const currentItems = await all("item_tags", { tag_name: currentTagName }, { limit: 10000 });
	const newItemTags = await all("item_tags", { tag_name: newTagName }, { limit: 10000 });
	const newItemIds = new Set(newItemTags.map((it) => it.item_id));
	for (const it of currentItems) {
		if (newItemIds.has(it.item_id)) {
			await deleteById("item_tags", it._id);
		}
	}
	// 插入新 catalog tag (忽略已存在)
	if (!(await first("tags", { tag_name: newTagName }))) {
		const now = new Date().toISOString();
		await insertOne("tags", {
			_id: crypto.randomUUID(),
			tag_name: newTagName,
			created_at: now,
			updated_at: now,
		});
	}
	await updateWhere("item_tags", { tag_name: currentTagName }, { tag_name: newTagName });
	await deleteWhere("tags", { tag_name: currentTagName });
	return c.json({ data: { tagName: newTagName, updated: true } });
});

app.delete("/api/tags/:tagName", async (c) => {
	const tagName = getRequiredTagNameFromRoute(c.req.param("tagName"), "tagName");
	const itemTagExists = await first("item_tags", { tag_name: tagName });
	const tagDoc = await first("tags", { tag_name: tagName });
	if (!itemTagExists && !tagDoc) {
		throw new ApiError(404, "Tag not found.");
	}
	await deleteWhere("item_tags", { tag_name: tagName });
	await deleteWhere("tags", { tag_name: tagName });
	return c.json({ data: { tagName, deleted: true } });
});

// ---------- items ----------
app.get("/api/items", async (c) => {
	const search = normalizeQueryValue(c.req.query("search"));
	const categoryCode = normalizeQueryValue(c.req.query("categoryCode"));
	const locationCode = normalizeQueryValue(c.req.query("locationCode"));
	const tagNames = parseTagNamesQuery(c.req.query("tagNames"));
	const isActive = parseOptionalBoolean(c.req.query("isActive"));
	const page = parsePositiveInteger(c.req.query("page"), 1);
	const pageSize = parseLimit(c.req.query("pageSize"), 15);

	const where = {};
	if (categoryCode) where.category_code = categoryCode;
	if (locationCode) where.default_location_code = locationCode;
	if (typeof isActive === "boolean") where.is_active = isActive;
	else where.is_active = true;

	let items = await all("items", where, {
		orderBy: [["created_at", "desc"]],
		limit: 200,
	});
	if (search) {
		const lower = search.toLowerCase();
		items = items.filter(
			(i) =>
				i.item_name.toLowerCase().includes(lower) ||
				(i.item_code || "").toLowerCase().includes(lower)
		);
	}
	if (tagNames.length > 0) {
		const itemIds = items.map((i) => i._id);
		const itemTags =
			itemIds.length > 0
				? await all("item_tags", { item_id: _.in(itemIds) }, { limit: 10000 })
				: [];
		const map = new Map();
		for (const it of itemTags) {
			if (!map.has(it.item_id)) map.set(it.item_id, new Set());
			map.get(it.item_id).add(it.tag_name);
		}
		items = items.filter((i) => {
			const tags = map.get(i._id);
			return tags && tagNames.every((t) => tags.has(t));
		});
	}
	const total = items.length;
	const start = (page - 1) * pageSize;
	const paged = items.slice(start, start + pageSize);

	const list = [];
	for (const item of paged) {
		const inv = await getItemInventory(item._id);
		const tagRows = await all("item_tags", { item_id: item._id }, {
			orderBy: [["tag_name", "asc"]],
		});
		list.push(
			mapItemSummary({
				...item,
				...inv,
				tag_names: tagRows.map((t) => t.tag_name).join("\n"),
			})
		);
	}
	return c.json({
		data: { list, total, page, pageSize, hasMore: start + pageSize < total },
	});
});

app.post("/api/items", async (c) => {
	const payload = await readJson(c);
	const itemName = getRequiredString(payload, "itemName");
	const itemCode = getOptionalString(payload, "itemCode");
	const categoryCode = getRequiredString(payload, "categoryCode");
	const unitCode = getRequiredString(payload, "unitCode");
	const defaultLocationCode = getOptionalString(payload, "defaultLocationCode");
	const defaultShelfLifeDays = getOptionalInteger(payload, "defaultShelfLifeDays");
	const minStockAlert = getOptionalNonNegativeNumber(payload, "minStockAlert") ?? 0;
	const remark = getOptionalString(payload, "remark");
	const tagNames = normalizeTagNames(getOptionalStringArray(payload, "tagNames"));

	await Promise.all([
		ensureOptionExists("category", categoryCode),
		ensureOptionExists("unit", unitCode),
		ensureOptionExists("location", defaultLocationCode),
	]);

	const itemId = crypto.randomUUID();
	const now = new Date().toISOString();
	await insertOne("items", {
		_id: itemId,
		item_name: itemName,
		item_code: itemCode,
		category_code: categoryCode,
		unit_code: unitCode,
		default_location_code: defaultLocationCode,
		default_shelf_life_days: defaultShelfLifeDays,
		min_stock_alert: minStockAlert,
		remark,
		is_active: true,
		created_at: now,
		updated_at: now,
	});
	for (const tagName of tagNames) {
		if (!(await first("tags", { tag_name: tagName }))) {
			await insertOne("tags", {
				_id: crypto.randomUUID(),
				tag_name: tagName,
				created_at: now,
				updated_at: now,
			});
		}
	}
	for (const tagName of tagNames) {
		await insertOne("item_tags", {
			_id: crypto.randomUUID(),
			item_id: itemId,
			tag_name: tagName,
			created_at: now,
		});
	}
	return c.json({ data: { id: itemId } }, 201);
});

app.get("/api/items/:id", async (c) => {
	const itemId = c.req.param("id");
	const item = await byId("items", itemId);
	if (!item) throw new ApiError(404, "Item not found.");
	const [inv, batchRows, movementRows] = await Promise.all([
		getItemInventory(itemId),
		all("stock_batches", { item_id: itemId }),
		all("stock_movements", { item_id: itemId }, {
			orderBy: [
				["movement_date", "desc"],
				["created_at", "desc"],
			],
			limit: 50,
		}),
	]);
	const usedByBatch = await groupSum(
		"stock_movements",
		{ item_id: itemId, movement_type: "OUT" },
		"batch_id",
		"quantity"
	);
	const batchesWithInv = batchRows
		.map((b) => {
			const used = usedByBatch.get(b._id) || 0;
			return {
				...b,
				used_quantity: used,
				remaining_quantity: roundQuantity(b.quantity - used),
			};
		})
		.sort((a, b) => {
			const aRem = a.remaining_quantity > 0 ? 0 : 1;
			const bRem = b.remaining_quantity > 0 ? 0 : 1;
			if (aRem !== bRem) return aRem - bRem;
			const aNull = a.expiry_date ? 0 : 1;
			const bNull = b.expiry_date ? 0 : 1;
			if (aNull !== bNull) return aNull - bNull;
			if (a.expiry_date && b.expiry_date && a.expiry_date !== b.expiry_date)
				return a.expiry_date < b.expiry_date ? -1 : 1;
			if (a.purchased_at !== b.purchased_at)
				return a.purchased_at < b.purchased_at ? -1 : 1;
			if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
			return 0;
		});

	const tagRows = await all("item_tags", { item_id: itemId }, {
		orderBy: [["tag_name", "asc"]],
	});
	const movements = movementRows.map((m) => {
		const batch = m.batch_id ? batchRows.find((b) => b._id === m.batch_id) : null;
		return mapMovement({
			...m,
			item_name: item.item_name,
			item_code: item.item_code ?? null,
			expiry_date: batch?.expiry_date ?? null,
		});
	});
	return c.json({
		data: {
			item: mapItemSummary({
				...item,
				...inv,
				tag_names: tagRows.map((t) => t.tag_name).join("\n"),
			}),
			batches: batchesWithInv.map(mapBatch),
			recentMovements: movements,
		},
	});
});

app.patch("/api/items/:id", async (c) => {
	const itemId = c.req.param("id");
	const payload = await readJson(c);
	await ensureItemExists(itemId);
	const patch = {};
	const shouldUpdateTagNames = Object.hasOwn(payload, "tagNames");
	const nextTagNames = shouldUpdateTagNames
		? normalizeTagNames(getOptionalStringArray(payload, "tagNames"))
		: [];

	if (Object.hasOwn(payload, "itemName")) patch.item_name = getRequiredString(payload, "itemName");
	if (Object.hasOwn(payload, "itemCode")) patch.item_code = getOptionalString(payload, "itemCode");
	if (Object.hasOwn(payload, "categoryCode")) {
		const cc = getRequiredString(payload, "categoryCode");
		await ensureOptionExists("category", cc);
		patch.category_code = cc;
	}
	if (Object.hasOwn(payload, "unitCode")) {
		const uc = getRequiredString(payload, "unitCode");
		await ensureOptionExists("unit", uc);
		patch.unit_code = uc;
	}
	if (Object.hasOwn(payload, "defaultLocationCode")) {
		const lc = getOptionalString(payload, "defaultLocationCode");
		await ensureOptionExists("location", lc);
		patch.default_location_code = lc;
	}
	if (Object.hasOwn(payload, "defaultShelfLifeDays"))
		patch.default_shelf_life_days = getOptionalInteger(payload, "defaultShelfLifeDays");
	if (Object.hasOwn(payload, "minStockAlert"))
		patch.min_stock_alert = getOptionalNonNegativeNumber(payload, "minStockAlert") ?? 0;
	if (Object.hasOwn(payload, "remark")) patch.remark = getOptionalString(payload, "remark");
	if (Object.hasOwn(payload, "isActive")) patch.is_active = getRequiredBoolean(payload, "isActive");

	if (Object.keys(patch).length === 0 && !shouldUpdateTagNames) {
		throw new ApiError(400, "No valid fields were provided for update.");
	}
	if (Object.keys(patch).length > 0) {
		patch.updated_at = new Date().toISOString();
		await updateById("items", itemId, patch);
	}
	if (shouldUpdateTagNames) {
		const now = new Date().toISOString();
		for (const tagName of nextTagNames) {
			if (!(await first("tags", { tag_name: tagName }))) {
				await insertOne("tags", {
					_id: crypto.randomUUID(),
					tag_name: tagName,
					created_at: now,
					updated_at: now,
				});
			}
		}
		await deleteWhere("item_tags", { item_id: itemId });
		for (const tagName of nextTagNames) {
			await insertOne("item_tags", {
				_id: crypto.randomUUID(),
				item_id: itemId,
				tag_name: tagName,
				created_at: now,
			});
		}
	}
	return c.json({ data: { id: itemId, updated: true } });
});

app.delete("/api/items/:id", async (c) => {
	const itemId = c.req.param("id");
	await ensureItemExists(itemId);
	const batchCount = await count("stock_batches", { item_id: itemId });
	const movementCount = await count("stock_movements", { item_id: itemId });
	if (batchCount > 0 || movementCount > 0) {
		throw new ApiError(409, "Cannot delete item with stock history.", {
			itemId,
			batchCount,
			movementCount,
		});
	}
	await deleteWhere("item_tags", { item_id: itemId });
	await deleteById("items", itemId);
	return c.json({ data: { id: itemId, deleted: true } });
});

// ---------- stock ----------
app.post("/api/stock/in", async (c) => {
	const payload = await readJson(c);
	const itemId = getRequiredString(payload, "itemId");
	const quantity = getPositiveNumber(payload, "quantity");
	const movementDate = getOptionalDate(payload, "movementDate") ?? todayDate();
	const purchasedAt = getOptionalDate(payload, "purchasedAt") ?? movementDate;
	const productionDate = getOptionalDate(payload, "productionDate");
	const supplier = getOptionalString(payload, "supplier");
	const note = getOptionalString(payload, "note");
	const locationCodeInput = getOptionalString(payload, "locationCode");
	const unitPrice = getOptionalNonNegativeNumber(payload, "unitPrice");

	const item = await ensureItemExists(itemId);
	const locationCode = locationCodeInput ?? item.default_location_code;
	await ensureOptionExists("location", locationCode);

	let expiryDate = getOptionalDate(payload, "expiryDate");
	if (!expiryDate && productionDate && item.default_shelf_life_days !== null) {
		expiryDate = addDays(productionDate, item.default_shelf_life_days);
	}
	if (productionDate && expiryDate && expiryDate < productionDate) {
		throw new ApiError(400, "expiryDate must be on or after productionDate.");
	}

	const batchId = crypto.randomUUID();
	const movementId = crypto.randomUUID();
	const now = new Date().toISOString();
	await insertOne("stock_batches", {
		_id: batchId,
		item_id: itemId,
		quantity,
		purchased_at: purchasedAt,
		production_date: productionDate,
		expiry_date: expiryDate,
		location_code: locationCode,
		supplier,
		unit_price: unitPrice,
		note,
		created_at: now,
	});
	await insertOne("stock_movements", {
		_id: movementId,
		item_id: itemId,
		batch_id: batchId,
		movement_type: "IN",
		quantity,
		movement_date: movementDate,
		location_code: locationCode,
		unit_price: unitPrice,
		note,
		created_at: now,
	});
	const currentQuantity = await getCurrentQuantity(itemId);
	return c.json(
		{ data: { itemId, batchId, movementId, currentQuantity, computedExpiryDate: expiryDate } },
		201
	);
});

app.patch("/api/stock/batches/:id", async (c) => {
	const batchId = c.req.param("id");
	const payload = await readJson(c);
	const batch = await getBatchInventory(batchId);
	if (!batch) throw new ApiError(404, "Batch not found.");

	const patch = {};
	let nextProductionDate = batch.production_date;
	let nextExpiryDate = batch.expiry_date;

	if (Object.hasOwn(payload, "quantity")) {
		const quantity = getPositiveNumber(payload, "quantity");
		const used = roundQuantity(batch.used_quantity);
		if (quantity < used) {
			throw new ApiError(409, "quantity cannot be less than used stock.", {
				batchId,
				usedQuantity: used,
			});
		}
		patch.quantity = quantity;
	}
	if (Object.hasOwn(payload, "purchasedAt")) {
		const purchasedAt = getOptionalDate(payload, "purchasedAt");
		if (!purchasedAt) throw new ApiError(400, "purchasedAt must use YYYY-MM-DD format.");
		patch.purchased_at = purchasedAt;
	}
	if (Object.hasOwn(payload, "productionDate")) {
		nextProductionDate = getOptionalDate(payload, "productionDate");
		patch.production_date = nextProductionDate;
	}
	if (Object.hasOwn(payload, "expiryDate")) {
		nextExpiryDate = getOptionalDate(payload, "expiryDate");
		patch.expiry_date = nextExpiryDate;
	}
	if (nextProductionDate && nextExpiryDate && nextExpiryDate < nextProductionDate) {
		throw new ApiError(400, "expiryDate must be on or after productionDate.");
	}
	if (Object.hasOwn(payload, "locationCode")) {
		const lc = getOptionalString(payload, "locationCode");
		await ensureOptionExists("location", lc);
		patch.location_code = lc;
	}
	if (Object.hasOwn(payload, "supplier")) patch.supplier = getOptionalString(payload, "supplier");
	if (Object.hasOwn(payload, "unitPrice"))
		patch.unit_price = getOptionalNonNegativeNumber(payload, "unitPrice");
	if (Object.hasOwn(payload, "note")) patch.note = getOptionalString(payload, "note");

	if (Object.keys(patch).length === 0) {
		throw new ApiError(400, "No valid fields were provided for update.");
	}
	await updateById("stock_batches", batchId, patch);
	return c.json({
		data: {
			batchId,
			itemId: batch.item_id,
			currentQuantity: await getCurrentQuantity(batch.item_id),
			updated: true,
		},
	});
});

app.post("/api/stock/out", async (c) => {
	const payload = await readJson(c);
	const itemId = getRequiredString(payload, "itemId");
	const quantity = getPositiveNumber(payload, "quantity");
	const movementDate = getOptionalDate(payload, "movementDate") ?? todayDate();
	const reasonCode = getRequiredString(payload, "reasonCode");
	const note = getOptionalString(payload, "note");
	const locationCode = getOptionalString(payload, "locationCode");

	await Promise.all([
		ensureItemExists(itemId),
		ensureOptionExists("outbound_reason", reasonCode),
		ensureOptionExists("location", locationCode),
	]);

	const batches = await all("stock_batches", { item_id: itemId });
	const usedByBatch = await groupSum(
		"stock_movements",
		{ item_id: itemId, movement_type: "OUT" },
		"batch_id",
		"quantity"
	);
	let available = batches
		.map((b) => {
			const used = usedByBatch.get(b._id) || 0;
			return {
				...b,
				used_quantity: used,
				remaining_quantity: roundQuantity(b.quantity - used),
			};
		})
		.filter((b) => b.remaining_quantity > 0);
	if (locationCode) available = available.filter((b) => b.location_code === locationCode);
	available.sort((a, b) => {
		const aNull = a.expiry_date ? 0 : 1;
		const bNull = b.expiry_date ? 0 : 1;
		if (aNull !== bNull) return aNull - bNull;
		if (a.expiry_date && b.expiry_date && a.expiry_date !== b.expiry_date)
			return a.expiry_date < b.expiry_date ? -1 : 1;
		if (a.purchased_at !== b.purchased_at) return a.purchased_at < b.purchased_at ? -1 : 1;
		if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
		return 0;
	});

	const totalAvailable = available.reduce((s, r) => s + r.remaining_quantity, 0);
	if (totalAvailable < quantity) {
		throw new ApiError(409, "Not enough stock available.", {
			requestedQuantity: quantity,
			availableQuantity: roundQuantity(totalAvailable),
		});
	}

	let remaining = quantity;
	const allocations = [];
	const now = new Date().toISOString();
	for (const row of available) {
		if (remaining <= 0) break;
		const consumed = Math.min(row.remaining_quantity, remaining);
		remaining = roundQuantity(remaining - consumed);
		const movementId = crypto.randomUUID();
		allocations.push({
			movementId,
			batchId: row._id,
			quantity: roundQuantity(consumed),
			locationCode: row.location_code,
			expiryDate: row.expiry_date,
		});
		await insertOne("stock_movements", {
			_id: movementId,
			item_id: itemId,
			batch_id: row._id,
			movement_type: "OUT",
			quantity: roundQuantity(consumed),
			movement_date: movementDate,
			reason_code: reasonCode,
			location_code: row.location_code,
			note,
			created_at: now,
		});
	}
	const currentQuantity = await getCurrentQuantity(itemId);
	return c.json(
		{
			data: {
				itemId,
				reasonCode,
				requestedQuantity: quantity,
				allocatedQuantity: roundQuantity(quantity),
				currentQuantity,
				allocations,
			},
		},
		201
	);
});

// ---------- movements / dashboard / alerts ----------
app.get("/api/movements", async (c) => {
	const itemId = normalizeQueryValue(c.req.query("itemId"));
	const movementType = normalizeQueryValue(c.req.query("movementType"));
	const page = parsePositiveInteger(c.req.query("page"), 1);
	const pageSize = parseLimit(c.req.query("pageSize"), 15);
	if (movementType && movementType !== "IN" && movementType !== "OUT") {
		throw new ApiError(400, "movementType must be IN or OUT.");
	}
	const where = {};
	if (itemId) where.item_id = itemId;
	if (movementType) where.movement_type = movementType;
	const allRows = await all("stock_movements", where, {
		orderBy: [
			["movement_date", "desc"],
			["created_at", "desc"],
		],
		limit: 1000,
	});
	const total = allRows.length;
	const start = (page - 1) * pageSize;
	const rows = allRows.slice(start, start + pageSize);
	const itemIds = Array.from(new Set(rows.map((r) => r.item_id)));
	const batchIds = Array.from(new Set(rows.map((r) => r.batch_id).filter(Boolean)));
	const items = itemIds.length > 0 ? await all("items", { _id: _.in(itemIds) }) : [];
	const batches = batchIds.length > 0 ? await all("stock_batches", { _id: _.in(batchIds) }) : [];
	const itemMap = new Map(items.map((i) => [i._id, i]));
	const batchMap = new Map(batches.map((b) => [b._id, b]));
	const list = rows.map((m) => {
		const item = itemMap.get(m.item_id);
		const batch = m.batch_id ? batchMap.get(m.batch_id) : null;
		return mapMovement({
			...m,
			item_name: item?.item_name,
			item_code: item?.item_code ?? null,
			expiry_date: batch?.expiry_date ?? null,
		});
	});
	return c.json({
		data: { list, total, page, pageSize, hasMore: start + pageSize < total },
	});
});

app.get("/api/dashboard", async (c) => {
	const items = await all("items", { is_active: true });
	const itemIds = items.map((i) => i._id);
	const allBatches = itemIds.length > 0 ? await all("stock_batches", { item_id: _.in(itemIds) }) : [];
	const usedByBatch =
		allBatches.length > 0
			? await groupSum(
					"stock_movements",
					{ movement_type: "OUT", batch_id: _.in(allBatches.map((b) => b._id)) },
					"batch_id",
					"quantity"
			  )
			: new Map();
	const batchesByItem = new Map();
	for (const b of allBatches) {
		(batchesByItem.get(b.item_id) ?? batchesByItem.set(b.item_id, []).get(b.item_id)).push(b);
	}
	const today = todayDate();
	let inStock = 0,
		outStock = 0,
		totalQty = 0,
		belowMin = 0,
		expiringSoon = 0,
		expiredStock = 0;
	for (const i of items) {
		const batches = batchesByItem.get(i._id) || [];
		let current = 0,
			expired = 0,
			expiring = 0;
		for (const b of batches) {
			const used = usedByBatch.get(b._id) || 0;
			const remaining = roundQuantity(b.quantity - used);
			if (remaining > 0) {
				current += remaining;
				if (b.expiry_date) {
					if (b.expiry_date < today) expired++;
					else if (b.expiry_date <= addDays(today, 7)) expiring++;
				}
			}
		}
		current = roundQuantity(current);
		if (current > 0) inStock++;
		else outStock++;
		totalQty += current;
		if (i.min_stock_alert > 0 && current <= i.min_stock_alert) belowMin++;
		if (expiring > 0) expiringSoon++;
		if (expired > 0) expiredStock++;
	}
	return c.json({
		data: mapDashboard({
			total_items: items.length,
			items_in_stock: inStock,
			items_out_of_stock: outStock,
			total_quantity: totalQty,
			items_below_min_stock: belowMin,
			items_expiring_soon: expiringSoon,
			items_with_expired_stock: expiredStock,
		}),
	});
});

app.get("/api/alerts", async (c) => {
	const days = parsePositiveInteger(c.req.query("days"), DEFAULT_ALERT_WINDOW_DAYS);
	const cutoff = addDays(todayDate(), days);
	const items = await all("items", { is_active: true });
	const itemIds = items.map((i) => i._id);
	const allBatches = itemIds.length > 0 ? await all("stock_batches", { item_id: _.in(itemIds) }) : [];
	const usedByBatch =
		allBatches.length > 0
			? await groupSum(
					"stock_movements",
					{ movement_type: "OUT", batch_id: _.in(allBatches.map((b) => b._id)) },
					"batch_id",
					"quantity"
			  )
			: new Map();
	const itemMap = new Map(items.map((i) => [i._id, i]));
	const today = todayDate();
	const rows = [];
	for (const b of allBatches) {
		const used = usedByBatch.get(b._id) || 0;
		const remaining = roundQuantity(b.quantity - used);
		if (remaining > 0 && b.expiry_date && b.expiry_date <= cutoff) {
			const item = itemMap.get(b.item_id);
			if (!item) continue;
			rows.push({
				item_id: item._id,
				item_name: item.item_name,
				item_code: item.item_code ?? null,
				category_code: item.category_code,
				unit_code: item.unit_code,
				batch_id: b._id,
				location_code: b.location_code ?? null,
				expiry_date: b.expiry_date,
				remaining_quantity: remaining,
			});
		}
	}
	rows.sort((a, b) => {
		if (a.expiry_date !== b.expiry_date) return a.expiry_date < b.expiry_date ? -1 : 1;
		return a.item_name < b.item_name ? -1 : a.item_name > b.item_name ? 1 : 0;
	});
	const mapAlert = (r) => ({
		itemId: r.item_id,
		itemName: r.item_name,
		itemCode: r.item_code,
		categoryCode: r.category_code,
		unitCode: r.unit_code,
		batchId: r.batch_id,
		locationCode: r.location_code,
		expiryDate: r.expiry_date,
		remainingQuantity: r.remaining_quantity,
	});
	const expired = rows.filter((r) => r.expiry_date < today).map(mapAlert);
	const expiringSoon = rows.filter((r) => r.expiry_date >= today).map(mapAlert);
	return c.json({ data: { windowDays: days, expired, expiringSoon } });
});

// ---------- OCR / AI ----------
app.post("/api/ocr/baidu/receipt", async (c) => {
	let formData;
	try {
		formData = await c.req.formData();
	} catch {
		throw new ApiError(400, "Request body must be multipart/form-data.");
	}
	const imageFile = formData.get("image");
	if (!isFileLike(imageFile)) throw new ApiError(400, "image file is required.");
	if (!imageFile.type.startsWith("image/")) {
		throw new ApiError(400, "Only image file uploads are supported.");
	}
	const imageBuffer = await imageFile.arrayBuffer();
	if (imageBuffer.byteLength <= 0) throw new ApiError(400, "Uploaded image cannot be empty.");
	if (imageBuffer.byteLength > BAIDU_OCR_IMAGE_MAX_BYTES) {
		throw new ApiError(400, "Uploaded image is too large.");
	}
	const ocrResult = await requestBaiduShoppingReceiptOcr(imageBuffer);
	const parsed = parseBaiduReceiptResult(ocrResult);
	return c.json({
		data: {
			provider: "baidu",
			model: "shopping_receipt",
			wordsResultNum:
				typeof ocrResult.words_result_num === "number"
					? ocrResult.words_result_num
					: parsed.lines.length,
			lines: parsed.lines,
			fieldLines: parsed.fieldLines,
			itemLines: parsed.itemLines,
			raw: ocrResult,
		},
	});
});

app.post("/api/ocr/openai/receipt", async (c) => {
	let formData;
	try {
		formData = await c.req.formData();
	} catch {
		throw new ApiError(400, "Request body must be multipart/form-data.");
	}
	const imageFile = formData.get("image");
	if (!isFileLike(imageFile)) throw new ApiError(400, "image file is required.");
	if (!imageFile.type.startsWith("image/")) {
		throw new ApiError(400, "Only image file uploads are supported.");
	}
	const imageBuffer = await imageFile.arrayBuffer();
	if (imageBuffer.byteLength <= 0) throw new ApiError(400, "Uploaded image cannot be empty.");
	if (imageBuffer.byteLength > 8 * 1024 * 1024) {
		throw new ApiError(400, "Uploaded image is too large.");
	}
	const provider = parseAiProvider(formData.get("provider"));
	const providerConfig = resolveAiProviderConfig(provider);
	const imageBase64 = arrayBufferToBase64(imageBuffer);
	const mimeType = imageFile.type;
	const raw = await requestAiReceiptOcr(providerConfig, imageBase64, mimeType);
	const fieldLines = validateOpenAiFieldLines(raw.fieldLines);
	const itemLines = validateOpenAiItemLines(raw.itemLines);
	return c.json({
		data: {
			provider: providerConfig.provider,
			model: providerConfig.receiptModel,
			fieldLines,
			itemLines,
		},
	});
});

app.post("/api/ai/command/parse", async (c) => {
	const payload = await readJson(c);
	const text = getRequiredString(payload, "text");
	const provider = parseAiProvider(payload.provider);
	const providerConfig = resolveAiProviderConfig(provider);
	const parsed = await requestAiCommandParse(providerConfig, text);
	return c.json({ data: parsed });
});

module.exports = { app };
