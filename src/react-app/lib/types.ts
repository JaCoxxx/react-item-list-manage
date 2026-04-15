import type { Dayjs } from "dayjs";

export type DashboardData = {
	totalItems: number;
	itemsInStock: number;
	itemsOutOfStock: number;
	totalQuantity: number;
	itemsBelowMinStock: number;
	itemsExpiringSoon: number;
	itemsWithExpiredStock: number;
};

export type BaseOption = {
	id: string;
	type: string;
	code: string;
	name: string;
	sortOrder: number;
	remark: string | null;
	createdAt: string;
	updatedAt: string;
};

export type BaseOptionGroups = Record<string, BaseOption[]>;

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
};

export type StockInFormValues = {
	itemId: string;
	quantity: number;
	movementDate: Dayjs;
	purchasedAt: Dayjs;
	productionDate?: Dayjs;
	expiryDate?: Dayjs;
	locationCode?: string;
	supplier?: string;
	unitPrice?: number;
	note?: string;
};

export type ItemFormValues = {
	itemName: string;
	itemCode?: string;
	categoryCode: string;
	unitCode: string;
	defaultLocationCode?: string;
	defaultShelfLifeDays?: number;
	minStockAlert?: number;
	remark?: string;
	isActive: boolean;
};

export type SetupStatus = {
	ready: boolean;
	missingTables: string[];
	missingViews: string[];
	baseOptionCount: number;
};

export type ApiResponse<T> = {
	data: T;
};
