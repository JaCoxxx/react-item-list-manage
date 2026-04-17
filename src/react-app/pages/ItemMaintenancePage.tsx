import {
	App as AntdApp,
	Button,
	Card,
	Descriptions,
	Drawer,
	Form,
	Grid,
	Input,
	InputNumber,
	List,
	Popconfirm,
	Select,
	Space,
	Switch,
	Table,
	Tag,
	Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, requestJson } from "../lib/api";
import {
	EMPTY_OPTIONS,
	findOptionName,
	getDefaultItemFormValues,
	mapItemToFormValues,
	normalizeOptionalText,
} from "../lib/utils";
import type {
	ApiResponse,
	BaseOptionGroups,
	InventoryItem,
	ItemFormValues,
} from "../lib/types";

const { Text } = Typography;
const { useBreakpoint } = Grid;

type ItemMaintenancePageProps = {
	baseOptions: BaseOptionGroups;
	reloadCoreData: (showToast?: boolean) => Promise<void>;
};

function ItemMaintenancePage({
	baseOptions,
	reloadCoreData,
}: ItemMaintenancePageProps) {
	const { message } = AntdApp.useApp();
	const screens = useBreakpoint();
	const isMobile = !screens.md;
	const [itemForm] = Form.useForm<ItemFormValues>();
	const [items, setItems] = useState<InventoryItem[]>([]);
	const [listLoading, setListLoading] = useState(true);
	const [editingItemId, setEditingItemId] = useState<string | null>(null);
	const [detailItemId, setDetailItemId] = useState<string | null>(null);
	const [formDrawerOpen, setFormDrawerOpen] = useState(false);
	const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
	const [submittingItem, setSubmittingItem] = useState(false);
	const [rowActionKey, setRowActionKey] = useState<string | null>(null);
	const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
	const categoryOptions = baseOptions.category ?? EMPTY_OPTIONS;
	const locationOptions = baseOptions.location ?? EMPTY_OPTIONS;
	const unitOptions = baseOptions.unit ?? EMPTY_OPTIONS;
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

	const editingItem = useMemo(
		() => items.find((item) => item.id === editingItemId) ?? null,
		[items, editingItemId]
	);
	const detailItem = useMemo(
		() => items.find((item) => item.id === detailItemId) ?? null,
		[items, detailItemId]
	);

	const loadItems = useCallback(async () => {
		setListLoading(true);

		try {
			const query = new URLSearchParams();
			query.set("limit", "200");
			if (selectedTagNames.length > 0) {
				query.set("tagNames", selectedTagNames.join(","));
			}

			const activeQuery = new URLSearchParams(query);
			activeQuery.set("isActive", "true");
			const inactiveQuery = new URLSearchParams(query);
			inactiveQuery.set("isActive", "false");

			const [activeResponse, inactiveResponse] = await Promise.all([
				fetchJson<ApiResponse<InventoryItem[]>>(`/api/items?${activeQuery.toString()}`),
				fetchJson<ApiResponse<InventoryItem[]>>(`/api/items?${inactiveQuery.toString()}`),
			]);

			const merged = new Map<string, InventoryItem>();
			[...activeResponse.data, ...inactiveResponse.data].forEach((item) => {
				merged.set(item.id, item);
			});

			const nextItems = Array.from(merged.values()).sort((a, b) => {
				if (a.isActive !== b.isActive) {
					return a.isActive ? -1 : 1;
				}

				return a.name.localeCompare(b.name, "zh-Hans-CN");
			});

			setItems(nextItems);
		} catch (requestError) {
			message.error(
				requestError instanceof Error ? requestError.message : "加载物品列表失败"
			);
		} finally {
			setListLoading(false);
		}
	}, [message, selectedTagNames]);

	useEffect(() => {
		void loadItems();
	}, [loadItems]);

	const openCreateDrawer = useCallback(() => {
		setEditingItemId(null);
		itemForm.resetFields();
		itemForm.setFieldsValue(getDefaultItemFormValues());
		setFormDrawerOpen(true);
	}, [itemForm]);

	const openEditDrawer = useCallback((item: InventoryItem) => {
		setEditingItemId(item.id);
		itemForm.resetFields();
		itemForm.setFieldsValue(mapItemToFormValues(item));
		setFormDrawerOpen(true);
	}, [itemForm]);

	const openDetailDrawer = useCallback((item: InventoryItem) => {
		setDetailItemId(item.id);
		setDetailDrawerOpen(true);
	}, []);

	const closeDetailDrawer = useCallback(() => {
		setDetailDrawerOpen(false);
		setDetailItemId(null);
	}, []);

	const closeFormDrawer = useCallback(() => {
		setFormDrawerOpen(false);
		setEditingItemId(null);
	}, []);

	useEffect(() => {
		if (!formDrawerOpen || !editingItem) {
			return;
		}

		itemForm.setFieldsValue(mapItemToFormValues(editingItem));
	}, [editingItem, formDrawerOpen, itemForm]);

	const submitItem = useCallback(
		async (values: ItemFormValues) => {
			setSubmittingItem(true);

			const payload = {
				itemName: values.itemName.trim(),
				itemCode: normalizeOptionalText(values.itemCode),
				categoryCode: values.categoryCode,
				unitCode: values.unitCode,
				tagNames: values.tagNames ?? [],
				defaultLocationCode: values.defaultLocationCode,
				defaultShelfLifeDays: values.defaultShelfLifeDays,
				minStockAlert: values.minStockAlert ?? 0,
				remark: normalizeOptionalText(values.remark),
				isActive: values.isActive,
			};

			try {
				if (editingItemId) {
					await requestJson<ApiResponse<{ id: string; updated: boolean }>>(
						`/api/items/${editingItemId}`,
						{
							method: "PATCH",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify(payload),
						}
					);
					message.success("物品已更新");
				} else {
					await requestJson<ApiResponse<{ id: string }>>("/api/items", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(payload),
					});
					message.success("物品已创建");
				}

				closeFormDrawer();
				await Promise.all([loadItems(), reloadCoreData(false)]);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "保存物品失败"
				);
			} finally {
				setSubmittingItem(false);
			}
		},
		[closeFormDrawer, editingItemId, loadItems, message, reloadCoreData]
	);

	const toggleItemActive = useCallback(
		async (item: InventoryItem, nextIsActive: boolean) => {
			const nextActionKey = `${item.id}:toggle`;
			setRowActionKey(nextActionKey);

			try {
				await requestJson<ApiResponse<{ id: string; updated: boolean }>>(
					`/api/items/${item.id}`,
					{
						method: "PATCH",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							isActive: nextIsActive,
						}),
					}
				);
				message.success(nextIsActive ? "物品已启用" : "物品已禁用");
				await Promise.all([loadItems(), reloadCoreData(false)]);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "更新物品状态失败"
				);
			} finally {
				setRowActionKey(null);
			}
		},
		[loadItems, message, reloadCoreData]
	);

	const deleteItem = useCallback(
		async (item: InventoryItem) => {
			const nextActionKey = `${item.id}:delete`;
			setRowActionKey(nextActionKey);

			try {
				await requestJson<ApiResponse<{ id: string; deleted: boolean }>>(
					`/api/items/${item.id}`,
					{
						method: "DELETE",
					}
				);
				message.success("物品已删除");
				await Promise.all([loadItems(), reloadCoreData(false)]);
				if (detailItemId === item.id) {
					closeDetailDrawer();
				}
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "删除物品失败"
				);
			} finally {
				setRowActionKey(null);
			}
		},
		[closeDetailDrawer, detailItemId, loadItems, message, reloadCoreData]
	);

	const columns: TableColumnsType<InventoryItem> = useMemo(
		() => [
			{
				title: "物品",
				key: "name",
				render: (_, item) => (
					<Space direction="vertical" size={2}>
						<Text strong>{item.name}</Text>
						<Text type="secondary">{item.code ?? "未设置编码"}</Text>
						{item.tagNames.length > 0 ? (
							<Space size={[4, 4]} wrap>
								{item.tagNames.map((tagName) => (
									<Tag key={`${item.id}:${tagName}`} className="status-tag">
										{tagName}
									</Tag>
								))}
							</Space>
						) : null}
					</Space>
				),
			},
			{
				title: "库存",
				key: "currentQuantity",
				align: "right",
				render: (_, item) =>
					`${item.currentQuantity} ${findOptionName(unitOptions, item.unitCode)}`,
			},
			{
				title: "状态",
				key: "status",
				render: (_, item) =>
					item.isActive ? (
						<Tag className="mono-tag">启用</Tag>
					) : (
						<Tag className="status-tag">停用</Tag>
					),
			},
		],
		[
			unitOptions,
		]
	);

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
						type="primary"
						className="page-action-button"
						onClick={openCreateDrawer}
					>
						新增物品
					</Button>
				</Space>
			</div>

			<Card className="surface-card">
				{isMobile ? (
					<List
						className="item-compact-list"
						loading={listLoading}
						dataSource={items}
						locale={{ emptyText: "暂无物品，请先新增物品。" }}
						renderItem={(item) => (
							<List.Item
								className="item-compact-row"
								onClick={() => openDetailDrawer(item)}
							>
								<div className="item-compact-main">
									<Text strong>{item.name}</Text>
									<Text type="secondary">{item.code ?? "未设置编码"}</Text>
									{item.tagNames.length > 0 ? (
										<Space size={[4, 4]} wrap>
											{item.tagNames.map((tagName) => (
												<Tag key={`${item.id}:${tagName}`} className="status-tag">
													{tagName}
												</Tag>
											))}
										</Space>
									) : null}
								</div>
								<Space size={8} className="item-compact-side">
									<Text>
										{item.currentQuantity} {findOptionName(unitOptions, item.unitCode)}
									</Text>
									{item.isActive ? (
										<Tag className="mono-tag">启用</Tag>
									) : (
										<Tag className="status-tag">停用</Tag>
									)}
								</Space>
							</List.Item>
						)}
					/>
				) : (
					<Table<InventoryItem>
						rowKey="id"
						loading={listLoading}
						columns={columns}
						dataSource={items}
						pagination={{
							pageSize: 12,
							showSizeChanger: false,
						}}
						scroll={{ x: 980 }}
						className="item-list-table"
						rowClassName={() => "item-list-row"}
						onRow={(item) => ({
							onClick: () => openDetailDrawer(item),
						})}
					/>
				)}
			</Card>

			<Drawer
				title="物品详情"
				placement="right"
				size={isMobile ? "100%" : 520}
				open={detailDrawerOpen}
				onClose={closeDetailDrawer}
				className="item-detail-drawer"
			>
				{detailItem ? (
					<>
						<Descriptions column={1} size="small">
							<Descriptions.Item label="物品名称">{detailItem.name}</Descriptions.Item>
							<Descriptions.Item label="物品编码">
								{detailItem.code ?? "未设置"}
							</Descriptions.Item>
							<Descriptions.Item label="分类">
								{findOptionName(categoryOptions, detailItem.categoryCode)}
							</Descriptions.Item>
							<Descriptions.Item label="单位">
								{findOptionName(unitOptions, detailItem.unitCode)}
							</Descriptions.Item>
							<Descriptions.Item label="默认位置">
								{findOptionName(locationOptions, detailItem.defaultLocationCode)}
							</Descriptions.Item>
							<Descriptions.Item label="标签">
								{detailItem.tagNames.length > 0 ? (
									<Space size={[4, 4]} wrap>
										{detailItem.tagNames.map((tagName) => (
											<Tag key={`${detailItem.id}:${tagName}`} className="status-tag">
												{tagName}
											</Tag>
										))}
									</Space>
								) : (
									"无"
								)}
							</Descriptions.Item>
							<Descriptions.Item label="默认保质期">
								{detailItem.defaultShelfLifeDays
									? `${detailItem.defaultShelfLifeDays} 天`
									: "未设置"}
							</Descriptions.Item>
							<Descriptions.Item label="低库存提醒值">
								{detailItem.minStockAlert}
							</Descriptions.Item>
							<Descriptions.Item label="当前库存">
								{detailItem.currentQuantity}{" "}
								{findOptionName(unitOptions, detailItem.unitCode)}
							</Descriptions.Item>
							<Descriptions.Item label="最近到期日期">
								{detailItem.nearestExpiryDate ?? "暂无"}
							</Descriptions.Item>
							<Descriptions.Item label="即将到期批次">
								{detailItem.expiringBatchCount}
							</Descriptions.Item>
							<Descriptions.Item label="已过期批次">
								{detailItem.expiredBatchCount}
							</Descriptions.Item>
							<Descriptions.Item label="状态">
								{detailItem.isActive ? "启用" : "停用"}
							</Descriptions.Item>
							<Descriptions.Item label="备注">
								{detailItem.remark ?? "无"}
							</Descriptions.Item>
							<Descriptions.Item label="创建时间">
								{detailItem.createdAt}
							</Descriptions.Item>
							<Descriptions.Item label="更新时间">
								{detailItem.updatedAt}
							</Descriptions.Item>
						</Descriptions>

						<div className="stock-drawer-actions">
							<Button
								onClick={() => {
									openEditDrawer(detailItem);
									setDetailDrawerOpen(false);
								}}
							>
								编辑物品
							</Button>
							<Popconfirm
								title="确认删除该物品？"
								description="删除后不可恢复；存在库存记录的物品不能删除。"
								okText="删除"
								cancelText="取消"
								onConfirm={() => void deleteItem(detailItem)}
							>
								<Button
									danger
									loading={rowActionKey === `${detailItem.id}:delete`}
								>
									删除物品
								</Button>
							</Popconfirm>
							{detailItem.isActive ? (
								<Button
									onClick={() => void toggleItemActive(detailItem, false)}
									loading={rowActionKey === `${detailItem.id}:toggle`}
								>
									禁用物品
								</Button>
							) : (
								<Button
									type="primary"
									onClick={() => void toggleItemActive(detailItem, true)}
									loading={rowActionKey === `${detailItem.id}:toggle`}
								>
									启用物品
								</Button>
							)}
						</div>
					</>
				) : (
					<Text type="secondary">未找到该物品详情。</Text>
				)}
			</Drawer>

			<Drawer
				title={editingItemId ? "编辑物品" : "新增物品"}
				placement="right"
				size={isMobile ? "100%" : 520}
				open={formDrawerOpen}
				onClose={closeFormDrawer}
				className="item-form-drawer"
			>
				<Form<ItemFormValues>
					form={itemForm}
					layout="vertical"
					initialValues={getDefaultItemFormValues()}
					onFinish={(values) => void submitItem(values)}
				>
					<Form.Item
						label="物品名称"
						name="itemName"
						rules={[{ required: true, message: "请输入物品名称" }]}
					>
						<Input placeholder="例如 抽纸、牛奶、洗衣液" />
					</Form.Item>
					<Form.Item label="物品编码" name="itemCode">
						<Input placeholder="可选，用于内部编码或条码" />
					</Form.Item>
					<Form.Item
						label="分类"
						name="categoryCode"
						rules={[{ required: true, message: "请选择分类" }]}
					>
						<Select
							placeholder="选择分类"
							options={categoryOptions.map((option) => ({
								label: option.name,
								value: option.code,
							}))}
						/>
					</Form.Item>
					<Form.Item
						label="单位"
						name="unitCode"
						rules={[{ required: true, message: "请选择单位" }]}
					>
						<Select
							placeholder="选择单位"
							options={unitOptions.map((option) => ({
								label: option.name,
								value: option.code,
							}))}
						/>
					</Form.Item>
					<Form.Item label="标签" name="tagNames">
						<Select
							mode="tags"
							allowClear
							placeholder="可输入多个标签"
							options={tagOptions}
							tokenSeparators={[",", "，"]}
							optionFilterProp="label"
						/>
					</Form.Item>
					<Form.Item label="默认位置" name="defaultLocationCode">
						<Select
							allowClear
							placeholder="可选"
							options={locationOptions.map((option) => ({
								label: option.name,
								value: option.code,
							}))}
						/>
					</Form.Item>
					<Form.Item label="默认保质期（天）" name="defaultShelfLifeDays">
						<InputNumber
							min={0}
							step={1}
							precision={0}
							className="full-width-input"
							placeholder="可选"
						/>
					</Form.Item>
					<Form.Item label="低库存提醒值" name="minStockAlert">
						<InputNumber
							min={0}
							step={1}
							precision={3}
							className="full-width-input"
							placeholder="默认 0"
						/>
					</Form.Item>
					<Form.Item label="启用状态" name="isActive" valuePropName="checked">
						<Switch checkedChildren="启用" unCheckedChildren="停用" />
					</Form.Item>
					<Form.Item label="备注" name="remark">
						<Input.TextArea
							rows={4}
							placeholder="补充物品说明，例如品牌、规格、适用场景"
						/>
					</Form.Item>

					<div className="stock-drawer-actions">
						<Button
							onClick={() => {
								if (editingItem) {
									itemForm.setFieldsValue(mapItemToFormValues(editingItem));
									return;
								}

								itemForm.resetFields();
								itemForm.setFieldsValue(getDefaultItemFormValues());
							}}
						>
							重置
						</Button>
						<Button type="primary" htmlType="submit" loading={submittingItem}>
							{editingItemId ? "保存修改" : "创建物品"}
						</Button>
					</div>
				</Form>
			</Drawer>
		</div>
	);
}

export default ItemMaintenancePage;
