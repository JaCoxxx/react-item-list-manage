export type ApiResponse<T> = {
	data: T;
};

export type PagedResponse<T> = {
	list: T[];
	total: number;
	page: number;
	pageSize: number;
	hasMore: boolean;
};

export type DashboardData = {
	totalItems: number;
	itemsInStock: number;
	itemsOutOfStock: number;
	totalQuantity: number;
	itemsBelowMinStock: number;
	itemsExpiringSoon: number;
	itemsWithExpiredStock: number;
};

export type SetupStatus = {
	ready: boolean;
	missingTables: string[];
	missingViews: string[];
	baseOptionCount: number;
};

export type BaseOption = {
	id: string;
	type: string;
	code: string;
	name: string;
	sortOrder: number;
	isActive: boolean;
	remark: string | null;
	createdAt: string;
	updatedAt: string;
};

export type BaseOptionGroups = Record<string, BaseOption[]>;

export type TagSummary = {
	tagName: string;
	itemCount: number;
};

export type InventoryItem = {
	id: string;
	name: string;
	code: string | null;
	categoryCode: string;
	unitCode: string;
	defaultLocationCode: string | null;
	defaultShelfLifeDays: number | null;
	minStockAlert: number;
	remark: string | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
	currentQuantity: number;
	nearestExpiryDate: string | null;
	expiredBatchCount: number;
	expiringBatchCount: number;
	tagNames: string[];
};

export type StockBatch = {
	id: string;
	itemId: string;
	quantity: number;
	usedQuantity: number;
	remainingQuantity: number;
	purchasedAt: string;
	productionDate: string | null;
	expiryDate: string | null;
	locationCode: string | null;
	supplier: string | null;
	unitPrice: number | null;
	note: string | null;
	createdAt: string;
};

export type StockMovement = {
	id: string;
	itemId: string;
	batchId: string | null;
	movementType: "IN" | "OUT";
	quantity: number;
	movementDate: string;
	reasonCode: string | null;
	locationCode: string | null;
	unitPrice: number | null;
	note: string | null;
	createdAt: string;
	itemName?: string;
	itemCode?: string | null;
	expiryDate?: string | null;
};

export type ItemDetailResponse = {
	item: InventoryItem;
	batches: StockBatch[];
	recentMovements: StockMovement[];
};

export type OcrFieldLine = {
	id: string;
	key: string;
	label: string;
	value: string;
};

export type OcrItemLine = {
	id: string;
	product: string;
	quantity: string;
	unitPrice: string;
	subtotalAmount: string;
};

export type OcrReceiptResult = {
	provider: "baidu" | "gpt" | "deepseek";
	model: string;
	wordsResultNum?: number;
	lines?: string[];
	fieldLines: OcrFieldLine[];
	itemLines: OcrItemLine[];
	raw?: Record<string, unknown>;
};

export type AiProvider = "gpt" | "deepseek";

export type PageLayoutMode = "row" | "two-column" | "three-column";

export type AiCommandAction = "stock_in" | "stock_out" | "create_item" | "unsupported";

export type AiCommandParseResult = {
	action: AiCommandAction;
	confidence: number;
	reply: string;
	params: {
		itemName?: string;
		itemCode?: string;
		quantity?: number;
		reasonCode?: string;
		categoryCode?: string;
		unitCode?: string;
		locationCode?: string;
		note?: string;
	};
};

export type MenuEntry = {
	title: string;
	copy: string;
	url: string;
};
