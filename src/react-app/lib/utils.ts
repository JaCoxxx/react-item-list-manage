import dayjs from "dayjs";
import type {
	BaseOption,
	InventoryItem,
	ItemFormValues,
	StockInFormValues,
} from "./types";

export const EMPTY_OPTIONS: BaseOption[] = [];

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

export function normalizeOptionalText(value: string | undefined) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function getDefaultStockInValues(): Partial<StockInFormValues> {
	const today = dayjs();

	return {
		quantity: 1,
		movementDate: today,
		purchasedAt: today,
	};
}

export function getDefaultItemFormValues(): ItemFormValues {
	return {
		itemName: "",
		itemCode: undefined,
		categoryCode: "",
		unitCode: "",
		tagNames: [],
		defaultLocationCode: undefined,
		defaultShelfLifeDays: undefined,
		minStockAlert: 0,
		remark: undefined,
		isActive: true,
	};
}

export function mapItemToFormValues(item: InventoryItem): ItemFormValues {
	return {
		itemName: item.name,
		itemCode: item.code ?? undefined,
		categoryCode: item.categoryCode,
		unitCode: item.unitCode,
		tagNames: item.tagNames,
		defaultLocationCode: item.defaultLocationCode ?? undefined,
		defaultShelfLifeDays: item.defaultShelfLifeDays ?? undefined,
		minStockAlert: item.minStockAlert,
		remark: item.remark ?? undefined,
		isActive: item.isActive,
	};
}
