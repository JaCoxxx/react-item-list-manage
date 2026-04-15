import { Hono, type Context } from "hono";

type AppBindings = {
	Bindings: {
		item_list_db: D1Database;
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
				"/api/items",
				"/api/items/:id",
				"/api/stock/in",
				"/api/stock/out",
				"/api/movements",
				"/api/dashboard",
				"/api/alerts",
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
	const db = c.env.item_list_db;

	if (type) {
		const options = await listBaseOptions(db, type);
		return c.json({
			data: {
				type,
				options,
			},
		});
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
			WHERE is_active = 1
			ORDER BY option_type ASC, sort_order ASC, option_name ASC`
		)
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
	return c.json({
		data: {
			type,
			options: await listBaseOptions(c.env.item_list_db, type),
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

async function listBaseOptions(db: Queryable, type: string) {
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
			WHERE option_type = ?
				AND is_active = 1
			ORDER BY sort_order ASC, option_name ASC`
		)
		.bind(type)
		.all<BaseOptionRow>();

	return rows.results.map(mapBaseOption);
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
