import { requestJson } from "./api";
import type { ApiResponse, BaseOptionGroups, InventoryItem, OcrItemLine } from "./types";
import {
	getDefaultCategory,
	getDefaultLocation,
	getDefaultUnit,
	normalizeOptionalText,
	parseReceiptQuantity,
	todayDate,
} from "./utils";

type ImportReceiptOptions = {
	itemLines: OcrItemLine[];
	items: InventoryItem[];
	baseOptions: BaseOptionGroups;
	locationCode?: string;
	categoryCode?: string;
	unitCode?: string;
};

export async function importReceiptItems(options: ImportReceiptOptions) {
	const importedNames: string[] = [];
	const categoryCode = options.categoryCode || getDefaultCategory(options.baseOptions);
	const unitCode = options.unitCode || getDefaultUnit(options.baseOptions);
	const locationCode = options.locationCode || getDefaultLocation(options.baseOptions) || undefined;

	if (!categoryCode || !unitCode) {
		throw new Error("缺少默认分类或单位，无法导入识别结果。");
	}

	const knownItems = new Map(options.items.map((item) => [item.name, item]));

	for (const line of options.itemLines) {
		const itemName = normalizeOptionalText(line.product || "");
		if (!itemName) {
			continue;
		}

		let itemId = knownItems.get(itemName)?.id;
		if (!itemId) {
			const createResponse = await requestJson<ApiResponse<{ id: string }>>("/api/items", {
				method: "POST",
				data: {
					itemName,
					categoryCode,
					unitCode,
					defaultLocationCode: locationCode,
				},
			});
			itemId = createResponse.data.id;
			knownItems.set(itemName, {
				id: itemId,
				name: itemName,
				code: null,
				categoryCode,
				unitCode,
				defaultLocationCode: locationCode ?? null,
				defaultShelfLifeDays: null,
				minStockAlert: 0,
				remark: null,
				isActive: true,
				createdAt: "",
				updatedAt: "",
				currentQuantity: 0,
				nearestExpiryDate: null,
				expiredBatchCount: 0,
				expiringBatchCount: 0,
				tagNames: [],
			});
		}

		await requestJson("/api/stock/in", {
			method: "POST",
			data: {
				itemId,
				quantity: parseReceiptQuantity(line),
				movementDate: todayDate(),
				purchasedAt: todayDate(),
				locationCode,
				unitPrice: line.unitPrice ? Number.parseFloat(line.unitPrice) : undefined,
				note: normalizeOptionalText(`OCR 导入：${line.subtotalAmount ? `小计 ${line.subtotalAmount}` : "识别结果"}`),
			},
		});

		importedNames.push(itemName);
	}

	return importedNames;
}
