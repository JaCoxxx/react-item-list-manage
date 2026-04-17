import { MinusOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Card, Input, List, Select, Space, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, requestJson } from "../lib/api";
import type { ApiResponse, BaseOptionGroups, InventoryItem } from "../lib/types";
import { EMPTY_OPTIONS } from "../lib/utils";

const { Text } = Typography;

type QuickStockPageProps = {
	baseOptions: BaseOptionGroups;
	reloadCoreData: (showToast?: boolean) => Promise<void>;
};

function todayDate() {
	return new Date().toISOString().slice(0, 10);
}

function QuickStockPage({ baseOptions, reloadCoreData }: QuickStockPageProps) {
	const { message } = AntdApp.useApp();
	const [items, setItems] = useState<InventoryItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [rowActionKey, setRowActionKey] = useState<string | null>(null);
	const [newItemName, setNewItemName] = useState("");
	const [creating, setCreating] = useState(false);
	const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);

	const defaultCategoryCode = useMemo(
		() => (baseOptions.category ?? EMPTY_OPTIONS)[0]?.code ?? null,
		[baseOptions]
	);
	const defaultUnitCode = useMemo(
		() => (baseOptions.unit ?? EMPTY_OPTIONS)[0]?.code ?? null,
		[baseOptions]
	);
	const defaultLocationCode = useMemo(
		() => (baseOptions.location ?? EMPTY_OPTIONS)[0]?.code ?? null,
		[baseOptions]
	);
	const outboundReasonCode = useMemo(() => {
		const reasons = baseOptions.outbound_reason ?? EMPTY_OPTIONS;
		return reasons.find((option) => option.code === "consume")?.code ?? reasons[0]?.code ?? null;
	}, [baseOptions]);

	const tagOptions = useMemo(() => {
		const values = new Set<string>(selectedTagNames);
		items.forEach((item) => {
			item.tagNames.forEach((tagName) => values.add(tagName));
		});
		return Array.from(values)
			.sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
			.map((tagName) => ({
				label: tagName,
				value: tagName,
			}));
	}, [items, selectedTagNames]);

	const loadItems = useCallback(async () => {
		setLoading(true);
		try {
			const query = new URLSearchParams();
			query.set("limit", "200");
			query.set("isActive", "true");
			if (selectedTagNames.length > 0) {
				query.set("tagNames", selectedTagNames.join(","));
			}
			const response = await fetchJson<ApiResponse<InventoryItem[]>>(
				`/api/items?${query.toString()}`
			);
			const sortedItems = [...response.data].sort((left, right) =>
				left.name.localeCompare(right.name, "zh-Hans-CN")
			);
			setItems(sortedItems);
		} catch (requestError) {
			const nextError =
				requestError instanceof Error ? requestError.message : "加载物品列表失败";
			message.error(nextError);
		} finally {
			setLoading(false);
		}
	}, [message, selectedTagNames]);

	useEffect(() => {
		void loadItems();
	}, [loadItems]);

	const stockInOne = useCallback(async (itemId: string, note: string) => {
		const movementDate = todayDate();
		await requestJson("/api/stock/in", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				itemId,
				quantity: 1,
				movementDate,
				purchasedAt: movementDate,
				note,
			}),
		});
	}, []);

	const stockOutOne = useCallback(
		async (itemId: string, note: string) => {
			if (!outboundReasonCode) {
				throw new Error("缺少可用出库原因，请先在基础数据中配置出库原因。");
			}

			await requestJson("/api/stock/out", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					itemId,
					quantity: 1,
					movementDate: todayDate(),
					reasonCode: outboundReasonCode,
					note,
				}),
			});
		},
		[outboundReasonCode]
	);

	const adjustStock = useCallback(
		async (item: InventoryItem, direction: "in" | "out") => {
			const actionKey = `${item.id}:${direction}`;
			setRowActionKey(actionKey);
			try {
				if (direction === "in") {
					await stockInOne(item.id, "快速操作 +1");
					message.success(`${item.name} 已 +1`);
				} else {
					await stockOutOne(item.id, "快速操作 -1");
					message.success(`${item.name} 已 -1`);
				}
				await Promise.all([loadItems(), reloadCoreData(false)]);
			} catch (requestError) {
				const nextError =
					requestError instanceof Error ? requestError.message : "调整库存失败";
				message.error(nextError);
			} finally {
				setRowActionKey(null);
			}
		},
		[loadItems, message, reloadCoreData, stockInOne, stockOutOne]
	);

	const createItemWithStock = useCallback(async () => {
		const nextName = newItemName.trim();
		if (!nextName) {
			message.warning("请输入物品名称");
			return;
		}

		if (!defaultCategoryCode || !defaultUnitCode) {
			message.error("缺少分类或单位基础数据，无法新建物品");
			return;
		}

		setCreating(true);
		try {
			let targetItemId: string;
			let existingItem = items.find((item) => item.name === nextName);
			if (!existingItem) {
				const query = new URLSearchParams();
				query.set("limit", "200");
				query.set("isActive", "true");
				query.set("search", nextName);
				const searchResponse = await fetchJson<ApiResponse<InventoryItem[]>>(
					`/api/items?${query.toString()}`
				);
				existingItem =
					searchResponse.data.find((item) => item.name === nextName) ?? undefined;
			}

			if (existingItem) {
				targetItemId = existingItem.id;
			} else {
				const payload: Record<string, unknown> = {
					itemName: nextName,
					categoryCode: defaultCategoryCode,
					unitCode: defaultUnitCode,
				};
				if (defaultLocationCode) {
					payload.defaultLocationCode = defaultLocationCode;
				}

				const createResponse = await requestJson<ApiResponse<{ id: string }>>("/api/items", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify(payload),
				});
				targetItemId = createResponse.data.id;
			}

			await stockInOne(targetItemId, "快速新增物品默认入库 1");
			setNewItemName("");
			await Promise.all([loadItems(), reloadCoreData(false)]);
			message.success(existingItem ? `${nextName} 已入库 +1` : `${nextName} 已新增并入库 1`);
		} catch (requestError) {
			const nextError =
				requestError instanceof Error ? requestError.message : "新增物品并入库失败";
			message.error(nextError);
		} finally {
			setCreating(false);
		}
	}, [
		defaultCategoryCode,
		defaultLocationCode,
		defaultUnitCode,
		items,
		loadItems,
		message,
		newItemName,
		reloadCoreData,
		stockInOne,
	]);

	return (
		<div className="page-stack page-shell">
			<div className="page-title-row">
				<Space className="page-header-actions">
					<Select
						mode="multiple"
						allowClear
						placeholder="按标签筛选"
						value={selectedTagNames}
						options={tagOptions}
						onChange={(values) => setSelectedTagNames(values)}
						optionFilterProp="label"
						className="tag-filter-select"
					/>
					<Button
						icon={<ReloadOutlined />}
						onClick={() => void loadItems()}
						className="page-action-button"
					>
						刷新列表
					</Button>
				</Space>
			</div>

			{outboundReasonCode ? null : (
				<Alert
					type="warning"
					showIcon
					className="page-alert"
					message="未配置出库原因，-1 操作不可用"
				/>
			)}

			<Card className="surface-card">
				<List
					className="quick-stock-list"
					loading={loading}
					dataSource={items}
					rowKey={(item) => item.id}
					renderItem={(item) => (
						<List.Item className="quick-stock-row">
							<Text strong className="quick-stock-name">
								{item.name}
							</Text>
							<Button
								size="small"
								icon={<MinusOutlined />}
								disabled={item.currentQuantity <= 0 || !outboundReasonCode}
								loading={rowActionKey === `${item.id}:out`}
								onClick={() => void adjustStock(item, "out")}
							>
								-1
							</Button>
							<Text className="quick-stock-qty">{item.currentQuantity}</Text>
							<Button
								size="small"
								type="primary"
								icon={<PlusOutlined />}
								loading={rowActionKey === `${item.id}:in`}
								onClick={() => void adjustStock(item, "in")}
							>
								+1
							</Button>
						</List.Item>
					)}
				/>
			</Card>

			<Card className="surface-card">
				<div className="quick-stock-create">
					<Input
						allowClear
						placeholder="输入物品名称，默认新建并入库 1"
						value={newItemName}
						onChange={(event) => setNewItemName(event.target.value)}
						onPressEnter={() => void createItemWithStock()}
						className="quick-stock-create-input"
					/>
					<Button
						type="primary"
						loading={creating}
						onClick={() => void createItemWithStock()}
						className="quick-stock-create-button"
					>
						新增物品 + 库存 1
					</Button>
				</div>
			</Card>
		</div>
	);
}

export default QuickStockPage;
