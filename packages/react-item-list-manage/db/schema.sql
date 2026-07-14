CREATE TABLE IF NOT EXISTS base_options (
	id TEXT PRIMARY KEY,
	option_type TEXT NOT NULL,
	option_code TEXT NOT NULL,
	option_name TEXT NOT NULL,
	sort_order INTEGER NOT NULL DEFAULT 0,
	is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
	remark TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (option_type, option_code)
);

CREATE TABLE IF NOT EXISTS items (
	id TEXT PRIMARY KEY,
	item_name TEXT NOT NULL,
	item_code TEXT,
	category_code TEXT NOT NULL,
	unit_code TEXT NOT NULL,
	default_location_code TEXT,
	default_shelf_life_days INTEGER CHECK (
		default_shelf_life_days IS NULL OR default_shelf_life_days >= 0
	),
	min_stock_alert REAL NOT NULL DEFAULT 0 CHECK (min_stock_alert >= 0),
	remark TEXT,
	is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (item_code)
);

CREATE TABLE IF NOT EXISTS item_tags (
	id TEXT PRIMARY KEY,
	item_id TEXT NOT NULL,
	tag_name TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
	UNIQUE (item_id, tag_name)
);

CREATE TABLE IF NOT EXISTS tags (
	id TEXT PRIMARY KEY,
	tag_name TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_batches (
	id TEXT PRIMARY KEY,
	item_id TEXT NOT NULL,
	quantity REAL NOT NULL CHECK (quantity > 0),
	purchased_at TEXT NOT NULL,
	production_date TEXT,
	expiry_date TEXT,
	location_code TEXT,
	supplier TEXT,
	unit_price REAL CHECK (unit_price IS NULL OR unit_price >= 0),
	note TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
	id TEXT PRIMARY KEY,
	item_id TEXT NOT NULL,
	batch_id TEXT,
	movement_type TEXT NOT NULL CHECK (movement_type IN ('IN', 'OUT')),
	quantity REAL NOT NULL CHECK (quantity > 0),
	movement_date TEXT NOT NULL,
	reason_code TEXT,
	location_code TEXT,
	unit_price REAL CHECK (unit_price IS NULL OR unit_price >= 0),
	note TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (item_id) REFERENCES items(id),
	FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_base_options_type_sort
	ON base_options (option_type, sort_order, option_name);

CREATE INDEX IF NOT EXISTS idx_items_category
	ON items (category_code);

CREATE INDEX IF NOT EXISTS idx_items_location
	ON items (default_location_code);

CREATE INDEX IF NOT EXISTS idx_item_tags_item
	ON item_tags (item_id);

CREATE INDEX IF NOT EXISTS idx_item_tags_tag
	ON item_tags (tag_name);

CREATE INDEX IF NOT EXISTS idx_tags_name
	ON tags (tag_name);

CREATE INDEX IF NOT EXISTS idx_stock_batches_item_expiry
	ON stock_batches (item_id, expiry_date, purchased_at);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item_date
	ON stock_movements (item_id, movement_date, created_at);

CREATE INDEX IF NOT EXISTS idx_stock_movements_batch
	ON stock_movements (batch_id, movement_type);

CREATE VIEW IF NOT EXISTS batch_inventory_view AS
SELECT
	b.id,
	b.item_id,
	b.quantity AS batch_quantity,
	b.purchased_at,
	b.production_date,
	b.expiry_date,
	b.location_code,
	b.supplier,
	b.unit_price,
	b.note,
	b.created_at,
	COALESCE(
		SUM(CASE WHEN m.movement_type = 'OUT' THEN m.quantity ELSE 0 END),
		0
	) AS used_quantity,
	b.quantity - COALESCE(
		SUM(CASE WHEN m.movement_type = 'OUT' THEN m.quantity ELSE 0 END),
		0
	) AS remaining_quantity
FROM stock_batches b
LEFT JOIN stock_movements m ON m.batch_id = b.id
GROUP BY b.id;

CREATE VIEW IF NOT EXISTS item_inventory_view AS
SELECT
	i.id AS item_id,
	ROUND(
		COALESCE(
			SUM(
				CASE
					WHEN biv.remaining_quantity > 0 THEN biv.remaining_quantity
					ELSE 0
				END
			),
			0
		),
		3
	) AS current_quantity,
	MIN(
		CASE
			WHEN biv.remaining_quantity > 0 THEN biv.expiry_date
			ELSE NULL
		END
	) AS nearest_expiry_date,
	SUM(
		CASE
			WHEN biv.remaining_quantity > 0
				AND biv.expiry_date IS NOT NULL
				AND biv.expiry_date < date('now')
			THEN 1
			ELSE 0
		END
	) AS expired_batch_count,
	SUM(
		CASE
			WHEN biv.remaining_quantity > 0
				AND biv.expiry_date IS NOT NULL
				AND biv.expiry_date >= date('now')
				AND biv.expiry_date <= date('now', '+7 day')
			THEN 1
			ELSE 0
		END
	) AS expiring_batch_count
FROM items i
LEFT JOIN batch_inventory_view biv ON biv.item_id = i.id
GROUP BY i.id;
