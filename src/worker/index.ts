import { Hono, type Context } from "hono";

type AppBindings = {
	Bindings: {
		item_list_db: D1Database;
		BAIDU_OCR_API_KEY?: string;
		BAIDU_OCR_SECRET_KEY?: string;
		BAIDU_OCR_RECEIPT_API_URL?: string;
	};
};

type Queryable = D1Database | D1DatabaseSession;

type BaseOptionRow = {
	id: string;
	option_type: string;
	option_code: string;
	option_name: string;
	sort_order: number;
	is_active: number;
	remark: string | null;
	created_at: string;
	updated_at: string;
};

type ItemRow = {
	id: string;
	item_name: string;
	item_code: string | null;
	category_code: string;
	unit_code: string;
	default_location_code: string | null;
	default_shelf_life_days: number | null;
	min_stock_alert: number;
	remark: string | null;
	is_active: number;
	created_at: string;
	updated_at: string;
	current_quantity?: number;
	nearest_expiry_date?: string | null;
	expired_batch_count?: number;
	expiring_batch_count?: number;
};

type BatchInventoryRow = {
	id: string;
	item_id: string;
	batch_quantity: number;
	purchased_at: string;
	production_date: string | null;
	expiry_date: string | null;
	location_code: string | null;
	supplier: string | null;
	unit_price: number | null;
	note: string | null;
	created_at: string;
	used_quantity: number;
	remaining_quantity: number;
};

type MovementRow = {
	id: string;
	item_id: string;
	batch_id: string | null;
	movement_type: "IN" | "OUT";
	quantity: number;
	movement_date: string;
	reason_code: string | null;
	location_code: string | null;
	unit_price: number | null;
	note: string | null;
	created_at: string;
	item_name?: string;
	item_code?: string | null;
	expiry_date?: string | null;
};

type DashboardRow = {
	total_items: number;
	items_in_stock: number;
	items_out_of_stock: number;
	total_quantity: number;
	items_below_min_stock: number;
	items_expiring_soon: number;
	items_with_expired_stock: number;
};

type BaiduTokenCache = {
	accessToken: string;
	expiresAt: number;
};

type BaiduAccessTokenResponse = {
	access_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
	error_code?: number;
	error_msg?: string;
};

type BaiduOcrResponse = {
	words_result?: unknown;
	words_result_num?: number;
	error_code?: number;
	error_msg?: string;
};

type OcrFieldLine = {
	id: string;
	key: string;
	label: string;
	value: string;
};

type OcrItemLine = {
	id: string;
	product: string;
	quantity: string;
	unitPrice: string;
	subtotalAmount: string;
};

class ApiError extends Error {
	status: number;
	details?: unknown;

	constructor(status: number, message: string, details?: unknown) {
		super(message);
		this.status = status;
		this.details = details;
	}
}

const app = new Hono<AppBindings>();

const DEFAULT_ALERT_WINDOW_DAYS = 7;
const MAX_LIST_LIMIT = 200;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BAIDU_OAUTH_URL = "https://aip.baidubce.com/oauth/2.0/token";
const DEFAULT_BAIDU_OCR_RECEIPT_URL =
	"https://aip.baidubce.com/rest/2.0/ocr/v1/shopping_receipt";
const BAIDU_OCR_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const BAIDU_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const BAIDU_RECEIPT_FIELD_LABELS: Record<string, string> = {
	shop_name: "店铺名称",
	receipt_num: "小票号",
	machine_num: "机号",
	employee_num: "员工号",
	consumption_date: "消费日期",
	consumption_time: "消费时间",
	total_amount: "总金额",
	change: "找零",
	currency: "币种",
	paid_amount: "实付金额",
	discount: "优惠金额",
	print_date: "打印日期",
	print_time: "打印时间",
};
let baiduTokenCache: BaiduTokenCache | null = null;

app.use("/api/*", async (c, next) => {
	c.header("Cache-Control", "no-store");
	await next();
});

app.onError((error, c) => {
	if (error instanceof ApiError) {
		return new Response(
			JSON.stringify({
				error: error.message,
				details: error.details,
			}),
			{
				status: error.status,
				headers: {
					"content-type": "application/json; charset=utf-8",
				},
			}
		);
	}

	console.error(error);

	if (isSchemaMissingError(error)) {
		return c.json(
			{
				error:
					"D1 schema is not initialized. Run db/schema.sql and db/seed.sql first.",
			},
			503
		);
	}

	if (isUniqueConstraintError(error)) {
		return c.json(
			{
				error: "A record with the same unique value already exists.",
			},
			409
		);
	}

	return c.json(
		{
			error: "Internal server error.",
		},
		500
	);
});

const apiIndexHandler = (c: Context<AppBindings>) =>
	c.json({
		data: {
			name: "item-list-api",
			version: 1,
			endpoints: [
				"/api/health",
				"/api/setup/status",
				"/api/base-options",
				"/api/base-options/:type",
				"/api/base-options/:type/:id",
				"/api/items",
				"/api/items/:id",
				"/api/stock/in",
				"/api/stock/batches/:id",
				"/api/stock/out",
				"/api/movements",
				"/api/dashboard",
				"/api/alerts",
				"/api/ocr/baidu/receipt",
			],
		},
	});

app.get("/api", apiIndexHandler);
app.get("/api/", apiIndexHandler);

app.get("/api/health", (c) =>
	c.json({
		data: {
			status: "ok",
			timestamp: new Date().toISOString(),
		},
	})
);

app.get("/api/setup/status", async (c) => {
	const db = c.env.item_list_db;
	const requiredTables = [
		"base_options",
		"items",
		"stock_batches",
		"stock_movements",
	];
	const requiredViews = ["batch_inventory_view", "item_inventory_view"];

	const [tableRows, viewRows] = await Promise.all([
		db.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${requiredTables
				.map(() => "?")
				.join(", ")})`
		)
			.bind(...requiredTables)
			.all<{ name: string }>(),
		db.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'view' AND name IN (${requiredViews
				.map(() => "?")
				.join(", ")})`
		)
			.bind(...requiredViews)
			.all<{ name: string }>(),
	]);

	const existingTables = new Set(tableRows.results.map((row) => row.name));
	const existingViews = new Set(viewRows.results.map((row) => row.name));
	const missingTables = requiredTables.filter((name) => !existingTables.has(name));
	const missingViews = requiredViews.filter((name) => !existingViews.has(name));

	const seedCountResult = existingTables.has("base_options")
		? await db
				.prepare("SELECT COUNT(*) AS count FROM base_options")
				.first<{ count: number }>()
		: { count: 0 };

	return c.json({
		data: {
			ready: missingTables.length === 0 && missingViews.length === 0,
			missingTables,
			missingViews,
			baseOptionCount: seedCountResult?.count ?? 0,
		},
	});
});

app.get("/api/base-options", async (c) => {
	const type = c.req.query("type");
	const includeInactive = parseOptionalBoolean(c.req.query("includeInactive")) === true;
	const isActive = parseOptionalBoolean(c.req.query("isActive"));
	const db = c.env.item_list_db;

	if (type) {
		const options = await listBaseOptions(db, type, {
			includeInactive,
			isActive,
		});
		return c.json({
			data: {
				type,
				options,
			},
		});
	}

	const conditions: string[] = [];
	const bindings: unknown[] = [];

	if (typeof isActive === "boolean") {
		conditions.push("is_active = ?");
		bindings.push(isActive ? 1 : 0);
	} else if (!includeInactive) {
		conditions.push("is_active = 1");
	}

	const rows = await db
		.prepare(
			`SELECT
				id,
				option_type,
				option_code,
				option_name,
				sort_order,
				is_active,
				remark,
				created_at,
				updated_at
			FROM base_options
			${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
			ORDER BY option_type ASC, sort_order ASC, option_name ASC`
		)
		.bind(...bindings)
		.all<BaseOptionRow>();

	const grouped = rows.results.reduce<Record<string, ReturnType<typeof mapBaseOption>[]>>(
		(accumulator, row) => {
			const entry = mapBaseOption(row);
			accumulator[row.option_type] ??= [];
			accumulator[row.option_type].push(entry);
			return accumulator;
		},
		{}
	);

	return c.json({ data: grouped });
});

app.get("/api/base-options/:type", async (c) => {
	const type = c.req.param("type");
	const includeInactive = parseOptionalBoolean(c.req.query("includeInactive")) === true;
	const isActive = parseOptionalBoolean(c.req.query("isActive"));
	return c.json({
		data: {
			type,
			options: await listBaseOptions(c.env.item_list_db, type, {
				includeInactive,
				isActive,
			}),
		},
	});
});

app.get("/api/base-options/:type/:id", async (c) => {
	const type = c.req.param("type");
	const id = c.req.param("id");
	const option = await getBaseOptionByTypeAndId(c.env.item_list_db, type, id);
	return c.json({
		data: mapBaseOption(option),
	});
});

app.post("/api/base-options", async (c) => {
	const payload = await readJson<Record<string, unknown>>(c);
	const optionType = getRequiredString(payload, "optionType");
	const optionCode = getRequiredString(payload, "optionCode");
	const optionName = getRequiredString(payload, "optionName");
	const sortOrder = getOptionalInteger(payload, "sortOrder") ?? 0;
	const remark = getOptionalString(payload, "remark");
	const isActive = Object.hasOwn(payload, "isActive")
		? getRequiredBoolean(payload, "isActive")
		: true;
	const id = crypto.randomUUID();

	await c.env.item_list_db
		.prepare(
			`INSERT INTO base_options (
				id,
				option_type,
				option_code,
				option_name,
				sort_order,
				is_active,
				remark
			) VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(id, optionType, optionCode, optionName, sortOrder, isActive ? 1 : 0, remark)
		.run();

	return c.json(
		{
			data: {
				id,
				created: true,
			},
		},
		201
	);
});

app.patch("/api/base-options/:type/:id", async (c) => {
	const type = c.req.param("type");
	const id = c.req.param("id");
	const payload = await readJson<Record<string, unknown>>(c);
	const db = c.env.item_list_db.withSession("first-primary");
	const currentOption = await getBaseOptionByTypeAndId(db, type, id);
	const assignments: string[] = [];
	const bindings: unknown[] = [];

	if (Object.hasOwn(payload, "optionCode")) {
		const nextCode = getRequiredString(payload, "optionCode");
		if (nextCode !== currentOption.option_code) {
			const usageCount = await getBaseOptionUsageCount(db, type, currentOption.option_code);
			if (usageCount > 0) {
				throw new ApiError(409, "Cannot change code for an option in use.", {
					type,
					id,
					code: currentOption.option_code,
					usageCount,
				});
			}
		}
		assignments.push("option_code = ?");
		bindings.push(nextCode);
	}

	if (Object.hasOwn(payload, "optionName")) {
		assignments.push("option_name = ?");
		bindings.push(getRequiredString(payload, "optionName"));
	}

	if (Object.hasOwn(payload, "sortOrder")) {
		const sortOrder = payload.sortOrder;
		if (
			typeof sortOrder !== "number" ||
			!Number.isInteger(sortOrder) ||
			sortOrder < 0
		) {
			throw new ApiError(400, "sortOrder must be a non-negative integer.");
		}
		assignments.push("sort_order = ?");
		bindings.push(sortOrder);
	}

	if (Object.hasOwn(payload, "remark")) {
		assignments.push("remark = ?");
		bindings.push(getOptionalString(payload, "remark"));
	}

	if (Object.hasOwn(payload, "isActive")) {
		assignments.push("is_active = ?");
		bindings.push(getRequiredBoolean(payload, "isActive") ? 1 : 0);
	}

	if (assignments.length === 0) {
		throw new ApiError(400, "No valid fields were provided for update.");
	}

	assignments.push("updated_at = CURRENT_TIMESTAMP");
	bindings.push(id, type);

	await db
		.prepare(
			`UPDATE base_options
			SET ${assignments.join(", ")}
			WHERE id = ?
				AND option_type = ?`
		)
		.bind(...bindings)
		.run();

	return c.json({
		data: {
			id,
			updated: true,
		},
	});
});

app.delete("/api/base-options/:type/:id", async (c) => {
	const type = c.req.param("type");
	const id = c.req.param("id");
	const db = c.env.item_list_db.withSession("first-primary");
	const option = await getBaseOptionByTypeAndId(db, type, id);
	const usageCount = await getBaseOptionUsageCount(db, type, option.option_code);

	if (usageCount > 0) {
		throw new ApiError(409, "Cannot delete option in use.", {
			type,
			id,
			code: option.option_code,
			usageCount,
		});
	}

	await db
		.prepare("DELETE FROM base_options WHERE id = ? AND option_type = ?")
		.bind(id, type)
		.run();

	return c.json({
		data: {
			id,
			deleted: true,
		},
	});
});

app.get("/api/items", async (c) => {
	const search = normalizeQueryValue(c.req.query("search"));
	const categoryCode = normalizeQueryValue(c.req.query("categoryCode"));
	const locationCode = normalizeQueryValue(c.req.query("locationCode"));
	const isActive = parseOptionalBoolean(c.req.query("isActive"));
	const limit = parseLimit(c.req.query("limit"), 50);

	const conditions = ["1 = 1"];
	const bindings: unknown[] = [];

	if (search) {
		conditions.push("(i.item_name LIKE ? OR COALESCE(i.item_code, '') LIKE ?)");
		bindings.push(`%${search}%`, `%${search}%`);
	}

	if (categoryCode) {
		conditions.push("i.category_code = ?");
		bindings.push(categoryCode);
	}

	if (locationCode) {
		conditions.push("i.default_location_code = ?");
		bindings.push(locationCode);
	}

	if (typeof isActive === "boolean") {
		conditions.push("i.is_active = ?");
		bindings.push(isActive ? 1 : 0);
	} else {
		conditions.push("i.is_active = 1");
	}

	bindings.push(limit);

	const sql = `
		SELECT
			i.id,
			i.item_name,
			i.item_code,
			i.category_code,
			i.unit_code,
			i.default_location_code,
			i.default_shelf_life_days,
			i.min_stock_alert,
			i.remark,
			i.is_active,
			i.created_at,
			i.updated_at,
			COALESCE(inv.current_quantity, 0) AS current_quantity,
			inv.nearest_expiry_date,
			COALESCE(inv.expired_batch_count, 0) AS expired_batch_count,
			COALESCE(inv.expiring_batch_count, 0) AS expiring_batch_count
		FROM items i
		LEFT JOIN item_inventory_view inv ON inv.item_id = i.id
		WHERE ${conditions.join(" AND ")}
		ORDER BY i.created_at DESC
		LIMIT ?
	`;

	const rows = await c.env.item_list_db
		.prepare(sql)
		.bind(...bindings)
		.all<ItemRow>();

	return c.json({
		data: rows.results.map(mapItemSummary),
	});
});

app.post("/api/items", async (c) => {
	const db = c.env.item_list_db;
	const payload = await readJson<Record<string, unknown>>(c);
	const itemName = getRequiredString(payload, "itemName");
	const itemCode = getOptionalString(payload, "itemCode");
	const categoryCode = getRequiredString(payload, "categoryCode");
	const unitCode = getRequiredString(payload, "unitCode");
	const defaultLocationCode = getOptionalString(payload, "defaultLocationCode");
	const defaultShelfLifeDays = getOptionalInteger(payload, "defaultShelfLifeDays");
	const minStockAlert = getOptionalNonNegativeNumber(payload, "minStockAlert") ?? 0;
	const remark = getOptionalString(payload, "remark");

	await Promise.all([
		ensureOptionExists(db, "category", categoryCode),
		ensureOptionExists(db, "unit", unitCode),
		ensureOptionExists(db, "location", defaultLocationCode),
	]);

	const itemId = crypto.randomUUID();

	await db
		.prepare(
			`INSERT INTO items (
				id,
				item_name,
				item_code,
				category_code,
				unit_code,
				default_location_code,
				default_shelf_life_days,
				min_stock_alert,
				remark
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			itemId,
			itemName,
			itemCode,
			categoryCode,
			unitCode,
			defaultLocationCode,
			defaultShelfLifeDays,
			minStockAlert,
			remark
		)
		.run();

	return c.json(
		{
			data: {
				id: itemId,
			},
		},
		201
	);
});

app.get("/api/items/:id", async (c) => {
	const itemId = c.req.param("id");
	const db = c.env.item_list_db.withSession("first-primary");

	const item = await db
		.prepare(
			`SELECT
				i.id,
				i.item_name,
				i.item_code,
				i.category_code,
				i.unit_code,
				i.default_location_code,
				i.default_shelf_life_days,
				i.min_stock_alert,
				i.remark,
				i.is_active,
				i.created_at,
				i.updated_at,
				COALESCE(inv.current_quantity, 0) AS current_quantity,
				inv.nearest_expiry_date,
				COALESCE(inv.expired_batch_count, 0) AS expired_batch_count,
				COALESCE(inv.expiring_batch_count, 0) AS expiring_batch_count
			FROM items i
			LEFT JOIN item_inventory_view inv ON inv.item_id = i.id
			WHERE i.id = ?`
		)
		.bind(itemId)
		.first<ItemRow>();

	if (!item) {
		throw new ApiError(404, "Item not found.");
	}

	const [batches, movements] = await Promise.all([
		db
			.prepare(
				`SELECT
					id,
					item_id,
					batch_quantity,
					purchased_at,
					production_date,
					expiry_date,
					location_code,
					supplier,
					unit_price,
					note,
					created_at,
					used_quantity,
					remaining_quantity
				FROM batch_inventory_view
				WHERE item_id = ?
				ORDER BY
					CASE WHEN remaining_quantity > 0 THEN 0 ELSE 1 END ASC,
					CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END ASC,
					expiry_date ASC,
					purchased_at ASC,
					created_at ASC`
			)
			.bind(itemId)
			.all<BatchInventoryRow>(),
		db
			.prepare(
				`SELECT
					m.id,
					m.item_id,
					m.batch_id,
					m.movement_type,
					m.quantity,
					m.movement_date,
					m.reason_code,
					m.location_code,
					m.unit_price,
					m.note,
					m.created_at
				FROM stock_movements m
				WHERE m.item_id = ?
				ORDER BY m.movement_date DESC, m.created_at DESC
				LIMIT 50`
			)
			.bind(itemId)
			.all<MovementRow>(),
	]);

	return c.json({
		data: {
			item: mapItemSummary(item),
			batches: batches.results.map(mapBatch),
			recentMovements: movements.results.map(mapMovement),
		},
	});
});

app.patch("/api/items/:id", async (c) => {
	const itemId = c.req.param("id");
	const db = c.env.item_list_db;
	const payload = await readJson<Record<string, unknown>>(c);

	await ensureItemExists(db, itemId);

	const assignments: string[] = [];
	const bindings: unknown[] = [];

	if (Object.hasOwn(payload, "itemName")) {
		assignments.push("item_name = ?");
		bindings.push(getRequiredString(payload, "itemName"));
	}

	if (Object.hasOwn(payload, "itemCode")) {
		assignments.push("item_code = ?");
		bindings.push(getOptionalString(payload, "itemCode"));
	}

	if (Object.hasOwn(payload, "categoryCode")) {
		const categoryCode = getRequiredString(payload, "categoryCode");
		await ensureOptionExists(db, "category", categoryCode);
		assignments.push("category_code = ?");
		bindings.push(categoryCode);
	}

	if (Object.hasOwn(payload, "unitCode")) {
		const unitCode = getRequiredString(payload, "unitCode");
		await ensureOptionExists(db, "unit", unitCode);
		assignments.push("unit_code = ?");
		bindings.push(unitCode);
	}

	if (Object.hasOwn(payload, "defaultLocationCode")) {
		const defaultLocationCode = getOptionalString(payload, "defaultLocationCode");
		await ensureOptionExists(db, "location", defaultLocationCode);
		assignments.push("default_location_code = ?");
		bindings.push(defaultLocationCode);
	}

	if (Object.hasOwn(payload, "defaultShelfLifeDays")) {
		assignments.push("default_shelf_life_days = ?");
		bindings.push(getOptionalInteger(payload, "defaultShelfLifeDays"));
	}

	if (Object.hasOwn(payload, "minStockAlert")) {
		assignments.push("min_stock_alert = ?");
		bindings.push(getOptionalNonNegativeNumber(payload, "minStockAlert") ?? 0);
	}

	if (Object.hasOwn(payload, "remark")) {
		assignments.push("remark = ?");
		bindings.push(getOptionalString(payload, "remark"));
	}

	if (Object.hasOwn(payload, "isActive")) {
		assignments.push("is_active = ?");
		bindings.push(getRequiredBoolean(payload, "isActive") ? 1 : 0);
	}

	if (assignments.length === 0) {
		throw new ApiError(400, "No valid fields were provided for update.");
	}

	assignments.push("updated_at = CURRENT_TIMESTAMP");
	bindings.push(itemId);

	await db
		.prepare(`UPDATE items SET ${assignments.join(", ")} WHERE id = ?`)
		.bind(...bindings)
		.run();

	return c.json({
		data: {
			id: itemId,
			updated: true,
		},
	});
});

app.delete("/api/items/:id", async (c) => {
	const itemId = c.req.param("id");
	const db = c.env.item_list_db.withSession("first-primary");

	await ensureItemExists(db, itemId);

	const related = await db
		.prepare(
			`SELECT
				(SELECT COUNT(*) FROM stock_batches WHERE item_id = ?) AS batch_count,
				(SELECT COUNT(*) FROM stock_movements WHERE item_id = ?) AS movement_count`
		)
		.bind(itemId, itemId)
		.first<{ batch_count: number; movement_count: number }>();

	const batchCount = related?.batch_count ?? 0;
	const movementCount = related?.movement_count ?? 0;

	if (batchCount > 0 || movementCount > 0) {
		throw new ApiError(409, "Cannot delete item with stock history.", {
			itemId,
			batchCount,
			movementCount,
		});
	}

	await db.prepare("DELETE FROM items WHERE id = ?").bind(itemId).run();

	return c.json({
		data: {
			id: itemId,
			deleted: true,
		},
	});
});

app.post("/api/stock/in", async (c) => {
	const session = c.env.item_list_db.withSession("first-primary");
	const payload = await readJson<Record<string, unknown>>(c);
	const itemId = getRequiredString(payload, "itemId");
	const quantity = getPositiveNumber(payload, "quantity");
	const movementDate = getOptionalDate(payload, "movementDate") ?? todayDate();
	const purchasedAt = getOptionalDate(payload, "purchasedAt") ?? movementDate;
	const productionDate = getOptionalDate(payload, "productionDate");
	const supplier = getOptionalString(payload, "supplier");
	const note = getOptionalString(payload, "note");
	const locationCodeInput = getOptionalString(payload, "locationCode");
	const unitPrice = getOptionalNonNegativeNumber(payload, "unitPrice");

	const item = await ensureItemExists(session, itemId);
	const locationCode = locationCodeInput ?? item.default_location_code;
	await ensureOptionExists(session, "location", locationCode);

	let expiryDate = getOptionalDate(payload, "expiryDate");
	if (!expiryDate && productionDate && item.default_shelf_life_days !== null) {
		expiryDate = addDays(productionDate, item.default_shelf_life_days);
	}

	if (productionDate && expiryDate && expiryDate < productionDate) {
		throw new ApiError(400, "expiryDate must be on or after productionDate.");
	}

	const batchId = crypto.randomUUID();
	const movementId = crypto.randomUUID();

	await session.batch([
		session
			.prepare(
				`INSERT INTO stock_batches (
					id,
					item_id,
					quantity,
					purchased_at,
					production_date,
					expiry_date,
					location_code,
					supplier,
					unit_price,
					note
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				batchId,
				itemId,
				quantity,
				purchasedAt,
				productionDate,
				expiryDate,
				locationCode,
				supplier,
				unitPrice,
				note
			),
		session
			.prepare(
				`INSERT INTO stock_movements (
					id,
					item_id,
					batch_id,
					movement_type,
					quantity,
					movement_date,
					location_code,
					unit_price,
					note
				) VALUES (?, ?, ?, 'IN', ?, ?, ?, ?, ?)`
			)
			.bind(
				movementId,
				itemId,
				batchId,
				quantity,
				movementDate,
				locationCode,
				unitPrice,
				note
			),
	]);

	const currentQuantity = await getCurrentQuantity(session, itemId);

	return c.json(
		{
			data: {
				itemId,
				batchId,
				movementId,
				currentQuantity,
				computedExpiryDate: expiryDate,
			},
		},
		201
	);
});

app.patch("/api/stock/batches/:id", async (c) => {
	const batchId = c.req.param("id");
	const session = c.env.item_list_db.withSession("first-primary");
	const payload = await readJson<Record<string, unknown>>(c);
	const batch = await session
		.prepare(
			`SELECT
				id,
				item_id,
				batch_quantity,
				purchased_at,
				production_date,
				expiry_date,
				location_code,
				supplier,
				unit_price,
				note,
				created_at,
				used_quantity,
				remaining_quantity
			FROM batch_inventory_view
			WHERE id = ?`
		)
		.bind(batchId)
		.first<BatchInventoryRow>();

	if (!batch) {
		throw new ApiError(404, "Batch not found.");
	}

	const assignments: string[] = [];
	const bindings: unknown[] = [];

	let nextProductionDate = batch.production_date;
	let nextExpiryDate = batch.expiry_date;

	if (Object.hasOwn(payload, "quantity")) {
		const quantity = getPositiveNumber(payload, "quantity");
		const usedQuantity = roundQuantity(batch.used_quantity);

		if (quantity < usedQuantity) {
			throw new ApiError(409, "quantity cannot be less than used stock.", {
				batchId,
				usedQuantity,
			});
		}

		assignments.push("quantity = ?");
		bindings.push(quantity);
	}

	if (Object.hasOwn(payload, "purchasedAt")) {
		const purchasedAt = getOptionalDate(payload, "purchasedAt");
		if (!purchasedAt) {
			throw new ApiError(400, "purchasedAt must use YYYY-MM-DD format.");
		}
		assignments.push("purchased_at = ?");
		bindings.push(purchasedAt);
	}

	if (Object.hasOwn(payload, "productionDate")) {
		nextProductionDate = getOptionalDate(payload, "productionDate");
		assignments.push("production_date = ?");
		bindings.push(nextProductionDate);
	}

	if (Object.hasOwn(payload, "expiryDate")) {
		nextExpiryDate = getOptionalDate(payload, "expiryDate");
		assignments.push("expiry_date = ?");
		bindings.push(nextExpiryDate);
	}

	if (nextProductionDate && nextExpiryDate && nextExpiryDate < nextProductionDate) {
		throw new ApiError(400, "expiryDate must be on or after productionDate.");
	}

	if (Object.hasOwn(payload, "locationCode")) {
		const locationCode = getOptionalString(payload, "locationCode");
		await ensureOptionExists(session, "location", locationCode);
		assignments.push("location_code = ?");
		bindings.push(locationCode);
	}

	if (Object.hasOwn(payload, "supplier")) {
		assignments.push("supplier = ?");
		bindings.push(getOptionalString(payload, "supplier"));
	}

	if (Object.hasOwn(payload, "unitPrice")) {
		assignments.push("unit_price = ?");
		bindings.push(getOptionalNonNegativeNumber(payload, "unitPrice"));
	}

	if (Object.hasOwn(payload, "note")) {
		assignments.push("note = ?");
		bindings.push(getOptionalString(payload, "note"));
	}

	if (assignments.length === 0) {
		throw new ApiError(400, "No valid fields were provided for update.");
	}

	bindings.push(batchId);

	await session
		.prepare(`UPDATE stock_batches SET ${assignments.join(", ")} WHERE id = ?`)
		.bind(...bindings)
		.run();

	return c.json({
		data: {
			batchId,
			itemId: batch.item_id,
			currentQuantity: await getCurrentQuantity(session, batch.item_id),
			updated: true,
		},
	});
});

app.post("/api/stock/out", async (c) => {
	const session = c.env.item_list_db.withSession("first-primary");
	const payload = await readJson<Record<string, unknown>>(c);
	const itemId = getRequiredString(payload, "itemId");
	const quantity = getPositiveNumber(payload, "quantity");
	const movementDate = getOptionalDate(payload, "movementDate") ?? todayDate();
	const reasonCode = getRequiredString(payload, "reasonCode");
	const note = getOptionalString(payload, "note");
	const locationCode = getOptionalString(payload, "locationCode");

	await Promise.all([
		ensureItemExists(session, itemId),
		ensureOptionExists(session, "outbound_reason", reasonCode),
		ensureOptionExists(session, "location", locationCode),
	]);

	const conditions = ["item_id = ?", "remaining_quantity > 0"];
	const bindings: unknown[] = [itemId];

	if (locationCode) {
		conditions.push("location_code = ?");
		bindings.push(locationCode);
	}

	const availableRows = await session
		.prepare(
			`SELECT
				id,
				item_id,
				batch_quantity,
				purchased_at,
				production_date,
				expiry_date,
				location_code,
				supplier,
				unit_price,
				note,
				created_at,
				used_quantity,
				remaining_quantity
			FROM batch_inventory_view
			WHERE ${conditions.join(" AND ")}
			ORDER BY
				CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END ASC,
				expiry_date ASC,
				purchased_at ASC,
				created_at ASC`
		)
		.bind(...bindings)
		.all<BatchInventoryRow>();

	const availableBatches = availableRows.results;
	const totalAvailable = availableBatches.reduce(
		(sum, row) => sum + row.remaining_quantity,
		0
	);

	if (totalAvailable < quantity) {
		throw new ApiError(409, "Not enough stock available.", {
			requestedQuantity: quantity,
			availableQuantity: roundQuantity(totalAvailable),
		});
	}

	let remainingToConsume = quantity;
	const allocations = availableBatches.flatMap((row) => {
		if (remainingToConsume <= 0) {
			return [];
		}

		const consumedQuantity = Math.min(row.remaining_quantity, remainingToConsume);
		remainingToConsume = roundQuantity(remainingToConsume - consumedQuantity);

		return [
			{
				movementId: crypto.randomUUID(),
				batchId: row.id,
				quantity: roundQuantity(consumedQuantity),
				locationCode: row.location_code,
				expiryDate: row.expiry_date,
			},
		];
	});

	await session.batch(
		allocations.map((allocation) =>
			session
				.prepare(
					`INSERT INTO stock_movements (
						id,
						item_id,
						batch_id,
						movement_type,
						quantity,
						movement_date,
						reason_code,
						location_code,
						note
					) VALUES (?, ?, ?, 'OUT', ?, ?, ?, ?, ?)`
				)
				.bind(
					allocation.movementId,
					itemId,
					allocation.batchId,
					allocation.quantity,
					movementDate,
					reasonCode,
					allocation.locationCode,
					note
				)
		)
	);

	const currentQuantity = await getCurrentQuantity(session, itemId);

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

app.get("/api/movements", async (c) => {
	const itemId = normalizeQueryValue(c.req.query("itemId"));
	const movementType = normalizeQueryValue(c.req.query("movementType"));
	const limit = parseLimit(c.req.query("limit"), 50);

	if (movementType && movementType !== "IN" && movementType !== "OUT") {
		throw new ApiError(400, "movementType must be IN or OUT.");
	}

	const conditions = ["1 = 1"];
	const bindings: unknown[] = [];

	if (itemId) {
		conditions.push("m.item_id = ?");
		bindings.push(itemId);
	}

	if (movementType) {
		conditions.push("m.movement_type = ?");
		bindings.push(movementType);
	}

	bindings.push(limit);

	const rows = await c.env.item_list_db
		.prepare(
			`SELECT
				m.id,
				m.item_id,
				m.batch_id,
				m.movement_type,
				m.quantity,
				m.movement_date,
				m.reason_code,
				m.location_code,
				m.unit_price,
				m.note,
				m.created_at,
				i.item_name,
				i.item_code,
				b.expiry_date
			FROM stock_movements m
			INNER JOIN items i ON i.id = m.item_id
			LEFT JOIN stock_batches b ON b.id = m.batch_id
			WHERE ${conditions.join(" AND ")}
			ORDER BY m.movement_date DESC, m.created_at DESC
			LIMIT ?`
		)
		.bind(...bindings)
		.all<MovementRow>();

	return c.json({
		data: rows.results.map(mapMovement),
	});
});

app.get("/api/dashboard", async (c) => {
	const row = await c.env.item_list_db
		.prepare(
			`SELECT
				COUNT(*) AS total_items,
				SUM(CASE WHEN COALESCE(inv.current_quantity, 0) > 0 THEN 1 ELSE 0 END) AS items_in_stock,
				SUM(CASE WHEN COALESCE(inv.current_quantity, 0) = 0 THEN 1 ELSE 0 END) AS items_out_of_stock,
				ROUND(COALESCE(SUM(COALESCE(inv.current_quantity, 0)), 0), 3) AS total_quantity,
				SUM(
					CASE
						WHEN i.min_stock_alert > 0
							AND COALESCE(inv.current_quantity, 0) <= i.min_stock_alert
						THEN 1
						ELSE 0
					END
				) AS items_below_min_stock,
				SUM(CASE WHEN COALESCE(inv.expiring_batch_count, 0) > 0 THEN 1 ELSE 0 END) AS items_expiring_soon,
				SUM(CASE WHEN COALESCE(inv.expired_batch_count, 0) > 0 THEN 1 ELSE 0 END) AS items_with_expired_stock
			FROM items i
			LEFT JOIN item_inventory_view inv ON inv.item_id = i.id
			WHERE i.is_active = 1`
		)
		.first<DashboardRow>();

	return c.json({
		data: mapDashboard(
			row ?? {
				total_items: 0,
				items_in_stock: 0,
				items_out_of_stock: 0,
				total_quantity: 0,
				items_below_min_stock: 0,
				items_expiring_soon: 0,
				items_with_expired_stock: 0,
			}
		),
	});
});

app.get("/api/alerts", async (c) => {
	const days = parsePositiveInteger(c.req.query("days"), DEFAULT_ALERT_WINDOW_DAYS);
	const rows = await c.env.item_list_db
		.prepare(
			`SELECT
				i.id AS item_id,
				i.item_name,
				i.item_code,
				i.category_code,
				i.unit_code,
				biv.id AS batch_id,
				biv.location_code,
				biv.expiry_date,
				ROUND(biv.remaining_quantity, 3) AS remaining_quantity
			FROM batch_inventory_view biv
			INNER JOIN items i ON i.id = biv.item_id
			WHERE i.is_active = 1
				AND biv.remaining_quantity > 0
				AND biv.expiry_date IS NOT NULL
				AND biv.expiry_date <= date('now', ?)
			ORDER BY biv.expiry_date ASC, i.item_name ASC`
		)
		.bind(`+${days} day`)
		.all<{
			item_id: string;
			item_name: string;
			item_code: string | null;
			category_code: string;
			unit_code: string;
			batch_id: string;
			location_code: string | null;
			expiry_date: string;
			remaining_quantity: number;
		}>();

	const today = todayDate();
	const expired = rows.results
		.filter((row) => row.expiry_date < today)
		.map((row) => ({
			itemId: row.item_id,
			itemName: row.item_name,
			itemCode: row.item_code,
			categoryCode: row.category_code,
			unitCode: row.unit_code,
			batchId: row.batch_id,
			locationCode: row.location_code,
			expiryDate: row.expiry_date,
			remainingQuantity: row.remaining_quantity,
		}));
	const expiringSoon = rows.results
		.filter((row) => row.expiry_date >= today)
		.map((row) => ({
			itemId: row.item_id,
			itemName: row.item_name,
			itemCode: row.item_code,
			categoryCode: row.category_code,
			unitCode: row.unit_code,
			batchId: row.batch_id,
			locationCode: row.location_code,
			expiryDate: row.expiry_date,
			remainingQuantity: row.remaining_quantity,
		}));

	return c.json({
		data: {
			windowDays: days,
			expired,
			expiringSoon,
		},
	});
});

app.post("/api/ocr/baidu/receipt", async (c) => {
	let formData: FormData;
	try {
		formData = await c.req.formData();
	} catch {
		throw new ApiError(400, "Request body must be multipart/form-data.");
	}

	const imageFile = formData.get("image");
	if (!(imageFile instanceof File)) {
		throw new ApiError(400, "image file is required.");
	}

	if (!imageFile.type.startsWith("image/")) {
		throw new ApiError(400, "Only image file uploads are supported.");
	}

	const imageBuffer = await imageFile.arrayBuffer();
	if (imageBuffer.byteLength <= 0) {
		throw new ApiError(400, "Uploaded image cannot be empty.");
	}

	if (imageBuffer.byteLength > BAIDU_OCR_IMAGE_MAX_BYTES) {
		throw new ApiError(400, "Uploaded image is too large.");
	}

	const ocrResult = await requestBaiduShoppingReceiptOcr(c.env, imageBuffer);
	const parsedResult = parseBaiduReceiptResult(ocrResult);

	return c.json({
		data: {
			provider: "baidu",
			model: "shopping_receipt",
			wordsResultNum:
				typeof ocrResult.words_result_num === "number"
					? ocrResult.words_result_num
					: parsedResult.lines.length,
			lines: parsedResult.lines,
			fieldLines: parsedResult.fieldLines,
			itemLines: parsedResult.itemLines,
			raw: ocrResult,
		},
	});
});

function isSchemaMissingError(error: unknown) {
	return (
		error instanceof Error &&
		(error.message.includes("no such table") || error.message.includes("no such view"))
	);
}

function isUniqueConstraintError(error: unknown) {
	return (
		error instanceof Error && error.message.includes("UNIQUE constraint failed")
	);
}

function parseLimit(value: string | undefined, defaultValue: number) {
	const parsed = parsePositiveInteger(value, defaultValue);
	return Math.min(parsed, MAX_LIST_LIMIT);
}

function parsePositiveInteger(value: string | undefined, defaultValue: number) {
	if (value === undefined) {
		return defaultValue;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new ApiError(400, "Expected a positive integer query parameter.");
	}

	return parsed;
}

function parseOptionalBoolean(value: string | undefined) {
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

function normalizeQueryValue(value: string | undefined) {
	if (value === undefined) {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

async function readJson<T>(c: Context<AppBindings>) {
	try {
		return (await c.req.json()) as T;
	} catch {
		throw new ApiError(400, "Request body must be valid JSON.");
	}
}

function getRequiredString(
	payload: Record<string, unknown>,
	fieldName: string
) {
	const value = payload[fieldName];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ApiError(400, `${fieldName} must be a non-empty string.`);
	}

	return value.trim();
}

function getOptionalString(
	payload: Record<string, unknown>,
	fieldName: string
) {
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

function getRequiredBoolean(
	payload: Record<string, unknown>,
	fieldName: string
) {
	const value = payload[fieldName];
	if (typeof value !== "boolean") {
		throw new ApiError(400, `${fieldName} must be a boolean.`);
	}

	return value;
}

function getPositiveNumber(payload: Record<string, unknown>, fieldName: string) {
	const value = payload[fieldName];
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new ApiError(400, `${fieldName} must be a positive number.`);
	}

	return roundQuantity(value);
}

function getOptionalNonNegativeNumber(
	payload: Record<string, unknown>,
	fieldName: string
) {
	const value = payload[fieldName];
	if (value === undefined || value === null || value === "") {
		return null;
	}

	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new ApiError(400, `${fieldName} must be a non-negative number.`);
	}

	return roundQuantity(value);
}

function getOptionalInteger(payload: Record<string, unknown>, fieldName: string) {
	const value = payload[fieldName];
	if (value === undefined || value === null || value === "") {
		return null;
	}

	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new ApiError(400, `${fieldName} must be a non-negative integer.`);
	}

	return value;
}

function getOptionalDate(payload: Record<string, unknown>, fieldName: string) {
	const value = getOptionalString(payload, fieldName);
	if (value === null) {
		return null;
	}

	if (!ISO_DATE_PATTERN.test(value)) {
		throw new ApiError(400, `${fieldName} must use YYYY-MM-DD format.`);
	}

	return value;
}

function todayDate() {
	return new Date().toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number) {
	const date = new Date(`${dateString}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function roundQuantity(value: number) {
	return Number.parseFloat(value.toFixed(3));
}

function requireEnvValue(value: string | undefined, fieldName: string) {
	const normalized = value?.trim();
	if (!normalized) {
		throw new ApiError(503, `${fieldName} is not configured.`);
	}
	return normalized;
}

function getBaiduReceiptApiUrl(env: AppBindings["Bindings"]) {
	const configured = env.BAIDU_OCR_RECEIPT_API_URL?.trim();
	return configured && configured.length > 0 ? configured : DEFAULT_BAIDU_OCR_RECEIPT_URL;
}

function toBaiduError(payload: unknown) {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}

	const errorRecord = payload as Record<string, unknown>;
	const errorCode = errorRecord.error_code;
	const errorMessage = errorRecord.error_msg;
	if (typeof errorCode !== "number" || typeof errorMessage !== "string") {
		return null;
	}

	return {
		code: errorCode,
		message: errorMessage,
	};
}

function isBaiduAccessTokenExpired(payload: unknown) {
	const error = toBaiduError(payload);
	return Boolean(error && (error.code === 110 || error.code === 111));
}

async function readJsonObjectResponse(response: Response) {
	const text = await response.text();
	if (text.length === 0) {
		return null;
	}

	try {
		const parsed = JSON.parse(text) as unknown;
		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}
		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = "";
	for (let index = 0; index < bytes.length; index += chunkSize) {
		const chunk = bytes.subarray(index, index + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

async function getBaiduAccessToken(env: AppBindings["Bindings"]) {
	const now = Date.now();
	if (baiduTokenCache && baiduTokenCache.expiresAt > now) {
		return baiduTokenCache.accessToken;
	}

	const apiKey = requireEnvValue(env.BAIDU_OCR_API_KEY, "BAIDU_OCR_API_KEY");
	const secretKey = requireEnvValue(env.BAIDU_OCR_SECRET_KEY, "BAIDU_OCR_SECRET_KEY");
	const tokenUrl = `${BAIDU_OAUTH_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;
	const response = await fetch(tokenUrl, {
		method: "POST",
	});
	const payload = await readJsonObjectResponse(response);
	const baiduError = toBaiduError(payload);

	if (!response.ok || baiduError) {
		throw new ApiError(502, "Failed to fetch Baidu OCR access token.", {
			status: response.status,
			baiduError,
		});
	}

	const tokenPayload = payload as BaiduAccessTokenResponse | null;
	const accessToken = tokenPayload?.access_token;
	if (typeof accessToken !== "string" || accessToken.length === 0) {
		throw new ApiError(502, "Invalid Baidu OCR access token response.");
	}

	const expiresInSeconds =
		typeof tokenPayload?.expires_in === "number" && tokenPayload.expires_in > 0
			? tokenPayload.expires_in
			: 60 * 60;
	const ttlMs = Math.max(
		30 * 1000,
		expiresInSeconds * 1000 - BAIDU_TOKEN_REFRESH_BUFFER_MS
	);
	baiduTokenCache = {
		accessToken,
		expiresAt: now + ttlMs,
	};

	return accessToken;
}

async function doBaiduReceiptOcrRequest(
	env: AppBindings["Bindings"],
	imageBase64: string,
	accessToken: string
) {
	const response = await fetch(
		`${getBaiduReceiptApiUrl(env)}?access_token=${encodeURIComponent(accessToken)}`,
		{
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				image: imageBase64,
				detect_direction: "true",
			}),
		}
	);
	const payload = await readJsonObjectResponse(response);
	return {
		response,
		payload,
	};
}

async function requestBaiduShoppingReceiptOcr(
	env: AppBindings["Bindings"],
	imageBuffer: ArrayBuffer
) {
	const imageBase64 = arrayBufferToBase64(imageBuffer);
	let accessToken = await getBaiduAccessToken(env);
	let { response, payload } = await doBaiduReceiptOcrRequest(env, imageBase64, accessToken);

	if (isBaiduAccessTokenExpired(payload)) {
		baiduTokenCache = null;
		accessToken = await getBaiduAccessToken(env);
		const retried = await doBaiduReceiptOcrRequest(env, imageBase64, accessToken);
		response = retried.response;
		payload = retried.payload;
	}

	const baiduError = toBaiduError(payload);
	if (!response.ok || baiduError) {
		throw new ApiError(502, "Baidu OCR request failed.", {
			status: response.status,
			baiduError,
		});
	}

	if (!payload) {
		throw new ApiError(502, "Baidu OCR returned an empty response.");
	}

	return payload as BaiduOcrResponse;
}

function parseBaiduReceiptResult(payload: BaiduOcrResponse) {
	const fieldLines = extractBaiduReceiptFieldLines(payload);
	const itemLines = extractBaiduReceiptItemLines(payload);
	const lines = [
		...fieldLines.map((field) => `${field.label}：${field.value}`),
		...itemLines.map(
			(item, index) =>
				`商品${index + 1}：${item.product || "-"}，数量 ${item.quantity || "-"}`
		),
	];

	if (lines.length === 0) {
		lines.push(...extractBaiduFallbackTextLines(payload));
	}

	return {
		fieldLines,
		itemLines,
		lines,
	};
}

function extractBaiduReceiptFieldLines(payload: BaiduOcrResponse) {
	const receipts = getBaiduReceiptRecords(payload);
	const lines: OcrFieldLine[] = [];

	receipts.forEach((receipt, receiptIndex) => {
		Object.entries(receipt).forEach(([fieldKey, fieldValue]) => {
			if (fieldKey === "table" || fieldKey === "table_row_num") {
				return;
			}

			const value = extractFirstWord(fieldValue);
			if (value === null) {
				return;
			}

			lines.push({
				id: `field-${receiptIndex}-${fieldKey}-${lines.length}`,
				key: fieldKey,
				label: BAIDU_RECEIPT_FIELD_LABELS[fieldKey] ?? fieldKey,
				value,
			});
		});
	});

	return lines;
}

function extractBaiduReceiptItemLines(payload: BaiduOcrResponse) {
	const receipts = getBaiduReceiptRecords(payload);
	const items: OcrItemLine[] = [];

	receipts.forEach((receipt, receiptIndex) => {
		const tableValue = receipt.table;
		if (!Array.isArray(tableValue)) {
			return;
		}

		const rows = tableValue
			.map(normalizeBaiduReceiptTableRow)
			.filter(
				(row) =>
					row.product.length > 0 ||
					row.quantity.length > 0 ||
					row.unitPrice.length > 0 ||
					row.subtotalAmount.length > 0
			);

		const mergedRows = mergeBaiduReceiptRows(rows);
		mergedRows.forEach((row, rowIndex) => {
			items.push({
				id: `item-${receiptIndex}-${rowIndex}`,
				...row,
			});
		});
	});

	return items;
}

function normalizeBaiduReceiptTableRow(value: unknown) {
	if (typeof value !== "object" || value === null) {
		return {
			product: "",
			quantity: "",
			unitPrice: "",
			subtotalAmount: "",
		};
	}

	const row = value as Record<string, unknown>;
	return {
		product:
			extractFirstWord(row.product) ??
			extractFirstWord(row.item_name) ??
			extractFirstWord(row.name) ??
			"",
		quantity: extractFirstWord(row.quantity) ?? extractFirstWord(row.qty) ?? "",
		unitPrice:
			extractFirstWord(row.unit_price) ?? extractFirstWord(row.price) ?? "",
		subtotalAmount:
			extractFirstWord(row.subtotal_amount) ??
			extractFirstWord(row.amount) ??
			"",
	};
}

function mergeBaiduReceiptRows(
	rows: Array<{
		product: string;
		quantity: string;
		unitPrice: string;
		subtotalAmount: string;
	}>
) {
	const merged: Array<{
		product: string;
		quantity: string;
		unitPrice: string;
		subtotalAmount: string;
	}> = [];
	let current:
		| {
				product: string;
				quantity: string;
				unitPrice: string;
				subtotalAmount: string;
		  }
		| null = null;

	for (const row of rows) {
		if (!current) {
			current = { ...row };
			continue;
		}

		if (shouldMergeBaiduReceiptRows(current, row)) {
			current = mergeBaiduReceiptRow(current, row);
			continue;
		}

		merged.push(current);
		current = { ...row };
	}

	if (current) {
		merged.push(current);
	}

	return merged;
}

function shouldMergeBaiduReceiptRows(
	current: {
		product: string;
		quantity: string;
		unitPrice: string;
		subtotalAmount: string;
	},
	next: {
		product: string;
		quantity: string;
		unitPrice: string;
		subtotalAmount: string;
	}
) {
	const nextHasOnlyProduct =
		next.product.length > 0 &&
		next.quantity.length === 0 &&
		next.unitPrice.length === 0 &&
		next.subtotalAmount.length === 0;
	const currentHasAmountOrQuantity =
		current.quantity.length > 0 ||
		current.unitPrice.length > 0 ||
		current.subtotalAmount.length > 0;

	if (nextHasOnlyProduct && currentHasAmountOrQuantity) {
		return true;
	}

	if (current.product.length === 0 && next.product.length > 0) {
		return true;
	}

	if (looksLikeSkuCode(current.product) && nextHasOnlyProduct) {
		return true;
	}

	if (
		current.quantity.length === 0 &&
		next.quantity.length > 0 &&
		next.product.length === 0
	) {
		return true;
	}

	if (
		current.unitPrice.length === 0 &&
		next.unitPrice.length > 0 &&
		next.product.length === 0
	) {
		return true;
	}

	if (
		current.subtotalAmount.length === 0 &&
		next.subtotalAmount.length > 0 &&
		next.product.length === 0
	) {
		return true;
	}

	return false;
}

function mergeBaiduReceiptRow(
	current: {
		product: string;
		quantity: string;
		unitPrice: string;
		subtotalAmount: string;
	},
	next: {
		product: string;
		quantity: string;
		unitPrice: string;
		subtotalAmount: string;
	}
) {
	const merged = { ...current };

	if (next.product.length > 0) {
		if (merged.product.length === 0) {
			merged.product = next.product;
		} else if (looksLikeSkuCode(merged.product) && !looksLikeSkuCode(next.product)) {
			merged.product = next.product;
		}
	}

	if (merged.quantity.length === 0 && next.quantity.length > 0) {
		merged.quantity = next.quantity;
	}

	if (merged.unitPrice.length === 0 && next.unitPrice.length > 0) {
		merged.unitPrice = next.unitPrice;
	}

	if (merged.subtotalAmount.length === 0 && next.subtotalAmount.length > 0) {
		merged.subtotalAmount = next.subtotalAmount;
	}

	return merged;
}

function looksLikeSkuCode(value: string) {
	const trimmed = value.trim();
	if (trimmed.length < 4) {
		return false;
	}

	if (/[\u4e00-\u9fff]/.test(trimmed)) {
		return false;
	}

	return /^[A-Za-z0-9-]+$/.test(trimmed);
}

function getBaiduReceiptRecords(payload: BaiduOcrResponse) {
	const wordsResult = payload.words_result;
	if (!wordsResult) {
		return [];
	}

	if (Array.isArray(wordsResult)) {
		return wordsResult.filter(
			(entry): entry is Record<string, unknown> =>
				typeof entry === "object" && entry !== null
		);
	}

	if (typeof wordsResult === "object" && wordsResult !== null) {
		return [wordsResult as Record<string, unknown>];
	}

	return [];
}

function extractBaiduFallbackTextLines(payload: BaiduOcrResponse) {
	const wordsResult = payload.words_result;
	if (!wordsResult) {
		return [];
	}

	if (Array.isArray(wordsResult)) {
		return wordsResult
			.map(extractLineFromWordResult)
			.filter((line): line is string => line !== null);
	}

	if (typeof wordsResult === "object") {
		return Object.values(wordsResult)
			.map(extractLineFromWordResult)
			.filter((line): line is string => line !== null);
	}

	return [];
}

function extractLineFromWordResult(value: unknown) {
	const word = extractFirstWord(value);
	return word ?? null;
}

function extractFirstWord(value: unknown): string | null {
	if (typeof value === "string") {
		const text = value.trim();
		return text.length > 0 ? text : null;
	}

	if (Array.isArray(value)) {
		for (const entry of value) {
			const extracted = extractFirstWord(entry);
			if (extracted !== null) {
				return extracted;
			}
		}
		return null;
	}

	if (typeof value !== "object" || value === null) {
		return null;
	}

	const entry = value as Record<string, unknown>;
	const directCandidates = [entry.word, entry.words, entry.value, entry.text];
	for (const candidate of directCandidates) {
		if (typeof candidate === "string") {
			const text = candidate.trim();
			if (text.length > 0) {
				return text;
			}
		}
	}

	for (const nestedValue of Object.values(entry)) {
		const extracted = extractFirstWord(nestedValue);
		if (extracted !== null) {
			return extracted;
		}
	}

	return null;
}

async function listBaseOptions(
	db: Queryable,
	type: string,
	options?: {
		includeInactive?: boolean;
		isActive?: boolean;
	}
) {
	const conditions = ["option_type = ?"];
	const bindings: unknown[] = [type];

	if (typeof options?.isActive === "boolean") {
		conditions.push("is_active = ?");
		bindings.push(options.isActive ? 1 : 0);
	} else if (!options?.includeInactive) {
		conditions.push("is_active = 1");
	}

	const rows = await db
		.prepare(
			`SELECT
				id,
				option_type,
				option_code,
				option_name,
				sort_order,
				is_active,
				remark,
				created_at,
				updated_at
			FROM base_options
			WHERE ${conditions.join(" AND ")}
			ORDER BY sort_order ASC, option_name ASC`
		)
		.bind(...bindings)
		.all<BaseOptionRow>();

	return rows.results.map(mapBaseOption);
}

async function getBaseOptionByTypeAndId(db: Queryable, type: string, id: string) {
	const option = await db
		.prepare(
			`SELECT
				id,
				option_type,
				option_code,
				option_name,
				sort_order,
				is_active,
				remark,
				created_at,
				updated_at
			FROM base_options
			WHERE option_type = ?
				AND id = ?`
		)
		.bind(type, id)
		.first<BaseOptionRow>();

	if (!option) {
		throw new ApiError(404, "Base option not found.");
	}

	return option;
}

async function getBaseOptionUsageCount(db: Queryable, type: string, code: string) {
	if (type === "category") {
		const row = await db
			.prepare("SELECT COUNT(*) AS count FROM items WHERE category_code = ?")
			.bind(code)
			.first<{ count: number }>();
		return row?.count ?? 0;
	}

	if (type === "unit") {
		const row = await db
			.prepare("SELECT COUNT(*) AS count FROM items WHERE unit_code = ?")
			.bind(code)
			.first<{ count: number }>();
		return row?.count ?? 0;
	}

	if (type === "location") {
		const row = await db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM items WHERE default_location_code = ?) AS item_count,
					(SELECT COUNT(*) FROM stock_batches WHERE location_code = ?) AS batch_count,
					(SELECT COUNT(*) FROM stock_movements WHERE location_code = ?) AS movement_count`
			)
			.bind(code, code, code)
			.first<{
				item_count: number;
				batch_count: number;
				movement_count: number;
			}>();

		return (row?.item_count ?? 0) + (row?.batch_count ?? 0) + (row?.movement_count ?? 0);
	}

	if (type === "outbound_reason") {
		const row = await db
			.prepare("SELECT COUNT(*) AS count FROM stock_movements WHERE reason_code = ?")
			.bind(code)
			.first<{ count: number }>();
		return row?.count ?? 0;
	}

	return 0;
}

async function ensureOptionExists(
	db: Queryable,
	type: string,
	code: string | null
) {
	if (code === null) {
		return;
	}

	const option = await db
		.prepare(
			`SELECT id
			FROM base_options
			WHERE option_type = ?
				AND option_code = ?
				AND is_active = 1`
		)
		.bind(type, code)
		.first<{ id: string }>();

	if (!option) {
		throw new ApiError(400, `Unknown ${type} option: ${code}.`);
	}
}

async function ensureItemExists(db: Queryable, itemId: string) {
	const item = await db
		.prepare(
			`SELECT
				id,
				item_name,
				item_code,
				category_code,
				unit_code,
				default_location_code,
				default_shelf_life_days,
				min_stock_alert,
				remark,
				is_active,
				created_at,
				updated_at
			FROM items
			WHERE id = ?`
		)
		.bind(itemId)
		.first<ItemRow>();

	if (!item) {
		throw new ApiError(404, "Item not found.");
	}

	return item;
}

async function getCurrentQuantity(db: Queryable, itemId: string) {
	const row = await db
		.prepare(
			`SELECT
				COALESCE(current_quantity, 0) AS current_quantity
			FROM item_inventory_view
			WHERE item_id = ?`
		)
		.bind(itemId)
		.first<{ current_quantity: number }>();

	return row?.current_quantity ?? 0;
}

function mapBaseOption(row: BaseOptionRow) {
	return {
		id: row.id,
		type: row.option_type,
		code: row.option_code,
		name: row.option_name,
		sortOrder: row.sort_order,
		isActive: row.is_active === 1,
		remark: row.remark,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapItemSummary(row: ItemRow) {
	return {
		id: row.id,
		name: row.item_name,
		code: row.item_code,
		categoryCode: row.category_code,
		unitCode: row.unit_code,
		defaultLocationCode: row.default_location_code,
		defaultShelfLifeDays: row.default_shelf_life_days,
		minStockAlert: row.min_stock_alert,
		remark: row.remark,
		isActive: row.is_active === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		currentQuantity: roundQuantity(row.current_quantity ?? 0),
		nearestExpiryDate: row.nearest_expiry_date ?? null,
		expiredBatchCount: row.expired_batch_count ?? 0,
		expiringBatchCount: row.expiring_batch_count ?? 0,
	};
}

function mapBatch(row: BatchInventoryRow) {
	return {
		id: row.id,
		itemId: row.item_id,
		quantity: roundQuantity(row.batch_quantity),
		usedQuantity: roundQuantity(row.used_quantity),
		remainingQuantity: roundQuantity(row.remaining_quantity),
		purchasedAt: row.purchased_at,
		productionDate: row.production_date,
		expiryDate: row.expiry_date,
		locationCode: row.location_code,
		supplier: row.supplier,
		unitPrice: row.unit_price,
		note: row.note,
		createdAt: row.created_at,
	};
}

function mapMovement(row: MovementRow) {
	return {
		id: row.id,
		itemId: row.item_id,
		itemName: row.item_name,
		itemCode: row.item_code,
		batchId: row.batch_id,
		type: row.movement_type,
		quantity: roundQuantity(row.quantity),
		movementDate: row.movement_date,
		reasonCode: row.reason_code,
		locationCode: row.location_code,
		unitPrice: row.unit_price,
		note: row.note,
		expiryDate: row.expiry_date,
		createdAt: row.created_at,
	};
}

function mapDashboard(row: DashboardRow) {
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

export default app;
