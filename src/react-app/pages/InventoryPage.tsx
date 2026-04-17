import dayjs, { type Dayjs } from "dayjs";
import {
	EditOutlined,
	FilterOutlined,
	PlusOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import {
	Alert,
	App as AntdApp,
	Button,
	Card,
	DatePicker,
	Descriptions,
	Drawer,
	Form,
	Grid,
	Input,
	InputNumber,
	List,
	Select,
	Space,
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
	getDefaultStockInValues,
	normalizeOptionalText,
} from "../lib/utils";
import type {
	ApiResponse,
	BaseOptionGroups,
	InventoryItem,
	StockBatch,
	StockInFormValues,
} from "../lib/types";

const { useBreakpoint } = Grid;
const { Text } = Typography;

type StockEditFormValues = {
	itemId: string;
	batchId: string;
	quantity: number;
	purchasedAt: Dayjs;
	productionDate?: Dayjs;
	expiryDate?: Dayjs;
	locationCode?: string;
	supplier?: string;
	unitPrice?: number;
	note?: string;
};

type StockOutFormValues = {
	itemId: string;
	quantity: number;
	movementDate: Dayjs;
	reasonCode: string;
	locationCode?: string;
	note?: string;
};

type ItemDetailResponse = {
	item: InventoryItem;
	batches: StockBatch[];
	recentMovements: unknown[];
};

type InventoryPageProps = {
	baseOptions: BaseOptionGroups;
};

function InventoryPage({ baseOptions }: InventoryPageProps) {
	const { message } = AntdApp.useApp();
	const screens = useBreakpoint();
	const isMobile = !screens.md;
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [items, setItems] = useState<InventoryItem[]>([]);
	const [search, setSearch] = useState("");
	const [appliedSearch, setAppliedSearch] = useState("");
	const [categoryCode, setCategoryCode] = useState<string | undefined>();
	const [locationCode, setLocationCode] = useState<string | undefined>();
	const [tagNames, setTagNames] = useState<string[]>([]);

	const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
	const [draftSearch, setDraftSearch] = useState("");
	const [draftCategoryCode, setDraftCategoryCode] = useState<string | undefined>();
	const [draftLocationCode, setDraftLocationCode] = useState<string | undefined>();
	const [draftTagNames, setDraftTagNames] = useState<string[]>([]);

	const [stockInDrawerOpen, setStockInDrawerOpen] = useState(false);
	const [stockOutDrawerOpen, setStockOutDrawerOpen] = useState(false);
	const [stockEditDrawerOpen, setStockEditDrawerOpen] = useState(false);
	const [stockActionItems, setStockActionItems] = useState<InventoryItem[]>([]);
	const [stockActionItemsLoading, setStockActionItemsLoading] = useState(false);
	const [savingStockIn, setSavingStockIn] = useState(false);
	const [savingStockOut, setSavingStockOut] = useState(false);
	const [savingStockEdit, setSavingStockEdit] = useState(false);
	const [editableBatches, setEditableBatches] = useState<StockBatch[]>([]);
	const [batchesLoading, setBatchesLoading] = useState(false);
	const [inventoryDetailDrawerOpen, setInventoryDetailDrawerOpen] = useState(false);
	const [inventoryDetailItemId, setInventoryDetailItemId] = useState<string | null>(null);

	const [stockInForm] = Form.useForm<StockInFormValues>();
	const [stockOutForm] = Form.useForm<StockOutFormValues>();
	const [stockEditForm] = Form.useForm<StockEditFormValues>();
	const selectedEditBatchId = Form.useWatch("batchId", stockEditForm);

	const categoryOptions = baseOptions.category ?? EMPTY_OPTIONS;
	const locationOptions = baseOptions.location ?? EMPTY_OPTIONS;
	const outboundReasonOptions = baseOptions.outbound_reason ?? EMPTY_OPTIONS;
	const unitOptions = baseOptions.unit ?? EMPTY_OPTIONS;

	const loadData = useCallback(
		async (showToast: boolean) => {
			setError(null);
			setRefreshing(showToast);

			try {
				const query = new URLSearchParams();
				query.set("limit", "100");

				if (appliedSearch) {
					query.set("search", appliedSearch);
				}

				if (categoryCode) {
					query.set("categoryCode", categoryCode);
				}

				if (locationCode) {
					query.set("locationCode", locationCode);
				}

				if (tagNames.length > 0) {
					query.set("tagNames", tagNames.join(","));
				}

				const itemsResponse = await fetchJson<ApiResponse<InventoryItem[]>>(
					`/api/items?${query.toString()}`
				);
				setItems(itemsResponse.data);

				if (showToast) {
					message.success("库存已刷新");
				}
			} catch (requestError) {
				const nextError =
					requestError instanceof Error ? requestError.message : "加载数据失败";
				setError(nextError);

				if (showToast) {
					message.error(nextError);
				}
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[appliedSearch, categoryCode, locationCode, message, tagNames]
	);

	useEffect(() => {
		void loadData(false);
	}, [loadData]);

	const loadStockActionItems = useCallback(async () => {
		setStockActionItemsLoading(true);
		try {
			const response = await fetchJson<ApiResponse<InventoryItem[]>>(
				"/api/items?limit=200&isActive=true"
			);
			setStockActionItems(response.data);
		} catch (requestError) {
			message.error(
				requestError instanceof Error ? requestError.message : "加载可选物品失败"
			);
		} finally {
			setStockActionItemsLoading(false);
		}
	}, [message]);

	const openStockEditDrawerForItem = useCallback(
		(item: InventoryItem) => {
			stockEditForm.resetFields();
			setEditableBatches([]);
			stockEditForm.setFieldsValue({
				itemId: item.id,
				batchId: undefined,
				quantity: undefined,
				purchasedAt: undefined,
				productionDate: undefined,
				expiryDate: undefined,
				locationCode: undefined,
				supplier: undefined,
				unitPrice: undefined,
				note: undefined,
			});
			setStockEditDrawerOpen(true);
			void loadStockActionItems();
			setBatchesLoading(true);
			void fetchJson<ApiResponse<ItemDetailResponse>>(`/api/items/${item.id}`)
				.then((response) => {
					setEditableBatches(response.data.batches);
				})
				.catch((requestError) => {
					setEditableBatches([]);
					message.error(
						requestError instanceof Error
							? requestError.message
							: "加载库存批次失败"
					);
				})
				.finally(() => {
					setBatchesLoading(false);
				});
		},
		[loadStockActionItems, message, stockEditForm]
	);

	const itemColumns = useMemo<TableColumnsType<InventoryItem>>(
		() => [
			{
				title: "物品",
				dataIndex: "name",
				key: "name",
				render: (_, record) => (
					<Space direction="vertical" size={2}>
						<Text strong>{record.name}</Text>
						<Text type="secondary">{record.code ?? "未设置编码"}</Text>
					</Space>
				),
			},
			{
				title: "库存",
				dataIndex: "currentQuantity",
				key: "currentQuantity",
				align: "right",
				render: (value, record) =>
					`${value} ${findOptionName(unitOptions, record.unitCode)}`,
			},
			{
				title: "到期情况",
				key: "expiry",
				render: (_, record) => {
					if (record.expiredBatchCount > 0) {
						return <Tag className="status-tag">有过期批次</Tag>;
					}

					if (record.expiringBatchCount > 0) {
						return <Tag className="status-tag">7天内临期</Tag>;
					}

					return record.nearestExpiryDate ? (
						<Text>{record.nearestExpiryDate}</Text>
					) : (
						<Text type="secondary">未设置</Text>
					);
				},
			},
		],
		[unitOptions]
	);

	const stockItemOptions = useMemo(() => {
		const source = stockActionItems.length > 0 ? stockActionItems : items;
		return source.map((item) => ({
			label: `${item.name}${item.code ? ` (${item.code})` : ""}`,
			value: item.id,
		}));
	}, [items, stockActionItems]);
	const tagFilterOptions = useMemo(() => {
		const values = new Set<string>([...tagNames, ...draftTagNames]);
		items.forEach((item) => {
			item.tagNames.forEach((tagName) => values.add(tagName));
		});
		return Array.from(values)
			.sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
			.map((tagName) => ({
				label: tagName,
				value: tagName,
			}));
	}, [draftTagNames, items, tagNames]);

	const selectedEditBatch = useMemo(
		() => editableBatches.find((batch) => batch.id === selectedEditBatchId) ?? null,
		[editableBatches, selectedEditBatchId]
	);
	const inventoryDetailItem = useMemo(
		() => items.find((item) => item.id === inventoryDetailItemId) ?? null,
		[items, inventoryDetailItemId]
	);

	const openFilterDrawer = useCallback(() => {
		setDraftSearch(search);
		setDraftCategoryCode(categoryCode);
		setDraftLocationCode(locationCode);
		setDraftTagNames(tagNames);
		setFilterDrawerOpen(true);
	}, [categoryCode, locationCode, search, tagNames]);

	const applyFilters = useCallback(() => {
		const nextSearch = draftSearch.trim();
		setSearch(draftSearch);
		setAppliedSearch(nextSearch);
		setCategoryCode(draftCategoryCode);
		setLocationCode(draftLocationCode);
		setTagNames(draftTagNames);
		setFilterDrawerOpen(false);
	}, [draftCategoryCode, draftLocationCode, draftSearch, draftTagNames]);

	const clearFilters = useCallback(() => {
		setSearch("");
		setAppliedSearch("");
		setCategoryCode(undefined);
		setLocationCode(undefined);
		setTagNames([]);
		setDraftSearch("");
		setDraftCategoryCode(undefined);
		setDraftLocationCode(undefined);
		setDraftTagNames([]);
		setFilterDrawerOpen(false);
	}, []);

	const openStockInDrawer = useCallback((itemId?: string) => {
		stockInForm.resetFields();
		stockInForm.setFieldsValue({
			...getDefaultStockInValues(),
			itemId,
		});
		setStockInDrawerOpen(true);
		void loadStockActionItems();
	}, [loadStockActionItems, stockInForm]);

	const openStockOutDrawer = useCallback((item: InventoryItem) => {
		stockOutForm.resetFields();
		stockOutForm.setFieldsValue({
			itemId: item.id,
			quantity: undefined,
			movementDate: dayjs(),
			reasonCode: undefined,
			locationCode: item.defaultLocationCode ?? undefined,
			note: undefined,
		});
		setStockOutDrawerOpen(true);
		void loadStockActionItems();
	}, [loadStockActionItems, stockOutForm]);

	const openInventoryDetailDrawer = useCallback((item: InventoryItem) => {
		setInventoryDetailItemId(item.id);
		setInventoryDetailDrawerOpen(true);
	}, []);

	const closeInventoryDetailDrawer = useCallback(() => {
		setInventoryDetailDrawerOpen(false);
		setInventoryDetailItemId(null);
	}, []);

	const loadBatchesForItem = useCallback(
		async (itemId: string) => {
			setBatchesLoading(true);
			try {
				const response = await fetchJson<ApiResponse<ItemDetailResponse>>(
					`/api/items/${itemId}`
				);
				setEditableBatches(response.data.batches);
			} catch (requestError) {
				setEditableBatches([]);
				message.error(
					requestError instanceof Error
						? requestError.message
						: "加载库存批次失败"
				);
			} finally {
				setBatchesLoading(false);
			}
		},
		[message]
	);

	const handleEditItemChange = useCallback(
		(itemId: string) => {
			setEditableBatches([]);
			stockEditForm.setFieldsValue({
				itemId,
				batchId: undefined,
				quantity: undefined,
				purchasedAt: undefined,
				productionDate: undefined,
				expiryDate: undefined,
				locationCode: undefined,
				supplier: undefined,
				unitPrice: undefined,
				note: undefined,
			});
			void loadBatchesForItem(itemId);
		},
		[loadBatchesForItem, stockEditForm]
	);

	const handleBatchChange = useCallback(
		(batchId: string) => {
			const target = editableBatches.find((batch) => batch.id === batchId);
			if (!target) {
				return;
			}

			stockEditForm.setFieldsValue({
				batchId: target.id,
				quantity: target.quantity,
				purchasedAt: dayjs(target.purchasedAt),
				productionDate: target.productionDate ? dayjs(target.productionDate) : undefined,
				expiryDate: target.expiryDate ? dayjs(target.expiryDate) : undefined,
				locationCode: target.locationCode ?? undefined,
				supplier: target.supplier ?? undefined,
				unitPrice: target.unitPrice ?? undefined,
				note: target.note ?? undefined,
			});
		},
		[editableBatches, stockEditForm]
	);

	const submitStockIn = useCallback(
		async (values: StockInFormValues) => {
			setSavingStockIn(true);
			try {
				await requestJson<ApiResponse<{ batchId: string }>>("/api/stock/in", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						itemId: values.itemId,
						quantity: values.quantity,
						movementDate: values.movementDate.format("YYYY-MM-DD"),
						purchasedAt: values.purchasedAt.format("YYYY-MM-DD"),
						productionDate: values.productionDate?.format("YYYY-MM-DD"),
						expiryDate: values.expiryDate?.format("YYYY-MM-DD"),
						locationCode: values.locationCode,
						supplier: normalizeOptionalText(values.supplier),
						unitPrice: values.unitPrice,
						note: normalizeOptionalText(values.note),
					}),
				});
				message.success("库存已新增");
				setStockInDrawerOpen(false);
				stockInForm.resetFields();
				stockInForm.setFieldsValue(getDefaultStockInValues());
				await loadData(false);
				await loadStockActionItems();
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "新增库存失败"
				);
			} finally {
				setSavingStockIn(false);
			}
		},
		[loadData, loadStockActionItems, message, stockInForm]
	);

	const submitStockOut = useCallback(
		async (values: StockOutFormValues) => {
			setSavingStockOut(true);
			try {
				await requestJson<ApiResponse<{ itemId: string; currentQuantity: number }>>(
					"/api/stock/out",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							itemId: values.itemId,
							quantity: values.quantity,
							movementDate: values.movementDate.format("YYYY-MM-DD"),
							reasonCode: values.reasonCode,
							locationCode: values.locationCode,
							note: normalizeOptionalText(values.note),
						}),
					}
				);
				message.success("已完成出库");
				setStockOutDrawerOpen(false);
				stockOutForm.resetFields();
				await loadData(false);
				await loadStockActionItems();
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "出库失败"
				);
			} finally {
				setSavingStockOut(false);
			}
		},
		[loadData, loadStockActionItems, message, stockOutForm]
	);

	const submitStockEdit = useCallback(
		async (values: StockEditFormValues) => {
			setSavingStockEdit(true);
			try {
				await requestJson<ApiResponse<{ updated: boolean }>>(
					`/api/stock/batches/${values.batchId}`,
					{
						method: "PATCH",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							quantity: values.quantity,
							purchasedAt: values.purchasedAt.format("YYYY-MM-DD"),
							productionDate: values.productionDate?.format("YYYY-MM-DD"),
							expiryDate: values.expiryDate?.format("YYYY-MM-DD"),
							locationCode: values.locationCode,
							supplier: normalizeOptionalText(values.supplier),
							unitPrice: values.unitPrice,
							note: normalizeOptionalText(values.note),
						}),
					}
				);
				message.success("库存批次已更新");
				setStockEditDrawerOpen(false);
				stockEditForm.resetFields();
				setEditableBatches([]);
				await loadData(false);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "编辑库存失败"
				);
			} finally {
				setSavingStockEdit(false);
			}
		},
		[loadData, message, stockEditForm]
	);

	return (
		<div className="page-stack page-shell">
			<div className="page-title-row">
				<Space className="page-header-actions">
					<Button
						icon={<FilterOutlined />}
						onClick={openFilterDrawer}
						className="page-action-button"
					>
						筛选
					</Button>
					<Button
						icon={<ReloadOutlined />}
						onClick={() => void loadData(true)}
						loading={refreshing}
						className="page-action-button"
					>
						刷新本页
					</Button>
				</Space>
			</div>

			{error ? (
				<Alert
					className="page-alert"
					type="error"
					showIcon
					message="接口加载失败"
					description={error}
				/>
			) : null}

			<Card
				title="库存清单"
				className="surface-card inventory-list-card"
				extra={
					<Space className="inventory-list-actions">
						<Button
							icon={<PlusOutlined />}
							onClick={() => openStockInDrawer()}
							className="inventory-list-action-button"
						>
							新增库存
						</Button>
					</Space>
				}
			>
				{isMobile ? (
					<List
						loading={loading}
						dataSource={items}
						className="inventory-compact-list"
						locale={{ emptyText: "暂无物品" }}
						renderItem={(item) => (
							<List.Item
								className="inventory-compact-row"
								onClick={() => openInventoryDetailDrawer(item)}
							>
								<div className="inventory-compact-main">
									<Text strong>{item.name}</Text>
									<Text type="secondary">{item.code ?? "未设置编码"}</Text>
								</div>
								<Space size={8} className="inventory-compact-side">
									<Text>
										{item.currentQuantity}{" "}
										{findOptionName(unitOptions, item.unitCode)}
									</Text>
									{renderExpiryStatus(item)}
								</Space>
							</List.Item>
						)}
					/>
				) : (
					<Table<InventoryItem>
						rowKey="id"
						loading={loading}
						columns={itemColumns}
						dataSource={items}
						pagination={{ pageSize: 10, showSizeChanger: false }}
						scroll={{ x: 900 }}
						rowClassName={() => "item-list-row"}
						onRow={(item) => ({
							onClick: () => openInventoryDetailDrawer(item),
						})}
					/>
				)}
			</Card>

			<Drawer
				title="库存详情"
				placement="right"
				size={isMobile ? "100%" : 520}
				open={inventoryDetailDrawerOpen}
				onClose={closeInventoryDetailDrawer}
				className="inventory-detail-drawer"
			>
				{inventoryDetailItem ? (
					<>
						<Descriptions column={1} size="small">
							<Descriptions.Item label="物品名称">
								{inventoryDetailItem.name}
							</Descriptions.Item>
							<Descriptions.Item label="物品编码">
								{inventoryDetailItem.code ?? "未设置"}
							</Descriptions.Item>
							<Descriptions.Item label="分类">
								{findOptionName(categoryOptions, inventoryDetailItem.categoryCode)}
							</Descriptions.Item>
							<Descriptions.Item label="单位">
								{findOptionName(unitOptions, inventoryDetailItem.unitCode)}
							</Descriptions.Item>
							<Descriptions.Item label="默认位置">
								{findOptionName(
									locationOptions,
									inventoryDetailItem.defaultLocationCode
								)}
							</Descriptions.Item>
							<Descriptions.Item label="当前库存">
								{inventoryDetailItem.currentQuantity}{" "}
								{findOptionName(unitOptions, inventoryDetailItem.unitCode)}
							</Descriptions.Item>
							<Descriptions.Item label="库存状态">
								{renderExpiryStatus(inventoryDetailItem)}
							</Descriptions.Item>
							<Descriptions.Item label="最近到期">
								{inventoryDetailItem.nearestExpiryDate ?? "未设置"}
							</Descriptions.Item>
							<Descriptions.Item label="临期批次数">
								{inventoryDetailItem.expiringBatchCount}
							</Descriptions.Item>
							<Descriptions.Item label="过期批次数">
								{inventoryDetailItem.expiredBatchCount}
							</Descriptions.Item>
							<Descriptions.Item label="补货线">
								{inventoryDetailItem.minStockAlert > 0
									? `${inventoryDetailItem.minStockAlert} ${findOptionName(unitOptions, inventoryDetailItem.unitCode)}`
									: "未设置"}
							</Descriptions.Item>
						</Descriptions>

						<div className="stock-drawer-actions">
							<Button
								icon={<PlusOutlined />}
								onClick={() => {
									setInventoryDetailDrawerOpen(false);
									openStockInDrawer(inventoryDetailItem.id);
								}}
							>
								新增该物品库存
							</Button>
							<Button
								type="primary"
								onClick={() => {
									setInventoryDetailDrawerOpen(false);
									openStockOutDrawer(inventoryDetailItem);
								}}
								disabled={inventoryDetailItem.currentQuantity <= 0}
							>
								出库
							</Button>
							<Button
								icon={<EditOutlined />}
								onClick={() => {
									setInventoryDetailDrawerOpen(false);
									openStockEditDrawerForItem(inventoryDetailItem);
								}}
							>
								编辑当前库存
							</Button>
						</div>
					</>
				) : (
					<Text type="secondary">未找到该物品库存详情。</Text>
				)}
			</Drawer>

			<Drawer
				title="筛选条件"
				placement="right"
				size={isMobile ? 300 : 360}
				open={filterDrawerOpen}
				onClose={() => setFilterDrawerOpen(false)}
				className="overview-filter-drawer"
			>
				<Space direction="vertical" size={14} className="filter-drawer-stack">
					<div>
						<Text type="secondary">名称或编码</Text>
						<Input
							allowClear
							placeholder="输入后点击应用"
							value={draftSearch}
							onChange={(event) => setDraftSearch(event.target.value)}
						/>
					</div>
					<div>
						<Text type="secondary">分类</Text>
						<Select
							allowClear
							placeholder="全部分类"
							value={draftCategoryCode}
							options={categoryOptions.map((option) => ({
								label: option.name,
								value: option.code,
							}))}
							onChange={(value) => setDraftCategoryCode(value)}
							className="full-width-input"
						/>
					</div>
					<div>
						<Text type="secondary">位置</Text>
						<Select
							allowClear
							placeholder="全部位置"
							value={draftLocationCode}
							options={locationOptions.map((option) => ({
								label: option.name,
								value: option.code,
							}))}
							onChange={(value) => setDraftLocationCode(value)}
							className="full-width-input"
						/>
					</div>
					<div>
						<Text type="secondary">标签</Text>
						<Select
							mode="multiple"
							allowClear
							placeholder="全部标签"
							value={draftTagNames}
							options={tagFilterOptions}
							onChange={(values) => setDraftTagNames(values)}
							optionFilterProp="label"
							className="full-width-input"
						/>
					</div>
				</Space>
				<div className="filter-drawer-actions">
					<Button onClick={clearFilters}>清空</Button>
					<Button type="primary" onClick={applyFilters}>
						应用筛选
					</Button>
				</div>
			</Drawer>

			<Drawer
				title="新增库存"
				placement="right"
				size={isMobile ? 320 : 440}
				open={stockInDrawerOpen}
				onClose={() => setStockInDrawerOpen(false)}
				className="overview-stock-drawer"
			>
				<Form<StockInFormValues>
					form={stockInForm}
					layout="vertical"
					initialValues={getDefaultStockInValues()}
					onFinish={(values) => void submitStockIn(values)}
				>
					<Form.Item
						label="物品"
						name="itemId"
						rules={[{ required: true, message: "请选择物品" }]}
					>
						<Select
							showSearch
							loading={stockActionItemsLoading}
							placeholder="选择已有物品"
							options={stockItemOptions}
							optionFilterProp="label"
						/>
					</Form.Item>
					<Form.Item
						label="数量"
						name="quantity"
						rules={[{ required: true, message: "请输入数量" }]}
					>
						<InputNumber
							min={0.001}
							step={1}
							precision={3}
							className="full-width-input"
						/>
					</Form.Item>
					<Form.Item
						label="入库日期"
						name="movementDate"
						rules={[{ required: true, message: "请选择入库日期" }]}
					>
						<DatePicker className="full-width-input" />
					</Form.Item>
					<Form.Item
						label="采购日期"
						name="purchasedAt"
						rules={[{ required: true, message: "请选择采购日期" }]}
					>
						<DatePicker className="full-width-input" />
					</Form.Item>
					<Form.Item label="生产日期" name="productionDate">
						<DatePicker className="full-width-input" />
					</Form.Item>
					<Form.Item label="保质截止日期" name="expiryDate">
						<DatePicker className="full-width-input" />
					</Form.Item>
					<Form.Item label="存放位置" name="locationCode">
						<Select
							allowClear
							placeholder="默认使用物品默认位置"
							options={locationOptions.map((option) => ({
								label: option.name,
								value: option.code,
							}))}
						/>
					</Form.Item>
					<Form.Item label="采购渠道" name="supplier">
						<Input />
					</Form.Item>
					<Form.Item label="单价" name="unitPrice">
						<InputNumber
							min={0}
							step={0.01}
							precision={2}
							className="full-width-input"
						/>
					</Form.Item>
					<Form.Item label="备注" name="note">
						<Input.TextArea rows={3} />
					</Form.Item>
					<div className="stock-drawer-actions">
						<Button
							onClick={() => {
								stockInForm.resetFields();
								stockInForm.setFieldsValue(getDefaultStockInValues());
							}}
						>
							重置
						</Button>
						<Button type="primary" htmlType="submit" loading={savingStockIn}>
							保存入库
						</Button>
					</div>
				</Form>
			</Drawer>

			<Drawer
				title="出库"
				placement="right"
				size={isMobile ? 320 : 440}
				open={stockOutDrawerOpen}
				onClose={() => setStockOutDrawerOpen(false)}
				className="overview-stock-drawer"
			>
				<Form<StockOutFormValues>
					form={stockOutForm}
					layout="vertical"
					onFinish={(values) => void submitStockOut(values)}
				>
					<Form.Item
						label="物品"
						name="itemId"
						rules={[{ required: true, message: "请选择物品" }]}
					>
						<Select
							showSearch
							loading={stockActionItemsLoading}
							placeholder="选择要出库的物品"
							options={stockItemOptions}
							optionFilterProp="label"
						/>
					</Form.Item>
					<Form.Item
						label="出库数量"
						name="quantity"
						rules={[{ required: true, message: "请输入出库数量" }]}
					>
						<InputNumber
							min={0.001}
							step={1}
							precision={3}
							className="full-width-input"
						/>
					</Form.Item>
					<Form.Item
						label="出库日期"
						name="movementDate"
						rules={[{ required: true, message: "请选择出库日期" }]}
					>
						<DatePicker className="full-width-input" />
					</Form.Item>
					<Form.Item
						label="出库原因"
						name="reasonCode"
						rules={[{ required: true, message: "请选择出库原因" }]}
					>
						<Select
							placeholder="选择出库原因"
							options={outboundReasonOptions.map((option) => ({
								label: option.name,
								value: option.code,
							}))}
						/>
					</Form.Item>
					<Form.Item label="位置（可选）" name="locationCode">
						<Select
							allowClear
							placeholder="不填则按全仓可用库存出库"
							options={locationOptions.map((option) => ({
								label: option.name,
								value: option.code,
							}))}
						/>
					</Form.Item>
					<Form.Item label="备注" name="note">
						<Input.TextArea rows={3} />
					</Form.Item>
					<div className="stock-drawer-actions">
						<Button
							onClick={() => {
								const currentItemId = stockOutForm.getFieldValue("itemId") as
									| string
									| undefined;
								const currentItem = items.find((item) => item.id === currentItemId);
								stockOutForm.resetFields();
								stockOutForm.setFieldsValue({
									itemId: currentItemId,
									movementDate: dayjs(),
									locationCode: currentItem?.defaultLocationCode ?? undefined,
								});
							}}
						>
							重置
						</Button>
						<Button type="primary" htmlType="submit" loading={savingStockOut}>
							确认出库
						</Button>
					</div>
				</Form>
			</Drawer>

			<Drawer
				title="编辑具体库存批次"
				placement="right"
				size={isMobile ? 320 : 460}
				open={stockEditDrawerOpen}
				onClose={() => setStockEditDrawerOpen(false)}
				className="overview-stock-drawer"
			>
				<Alert
					type="info"
					showIcon
					message="仅编辑单个库存批次"
					description="先选择物品，再选择具体批次进行编辑。数量不能低于该批次已使用数量。"
					className="stock-edit-alert"
				/>
				<Form<StockEditFormValues>
					form={stockEditForm}
					layout="vertical"
					onFinish={(values) => void submitStockEdit(values)}
				>
					<Form.Item
						label="物品"
						name="itemId"
						rules={[{ required: true, message: "请选择物品" }]}
					>
						<Select
							showSearch
							loading={stockActionItemsLoading}
							placeholder="先选择物品"
							options={stockItemOptions}
							optionFilterProp="label"
							onChange={handleEditItemChange}
						/>
					</Form.Item>
					<Form.Item
						label="库存批次"
						name="batchId"
						rules={[{ required: true, message: "请选择批次" }]}
					>
						<Select
							placeholder="选择要编辑的批次"
							loading={batchesLoading}
							disabled={editableBatches.length === 0}
							options={editableBatches.map((batch) => ({
								label: `${batch.purchasedAt} ｜ 总量 ${batch.quantity} ｜ 已用 ${batch.usedQuantity} ｜ 剩余 ${batch.remainingQuantity}`,
								value: batch.id,
							}))}
							onChange={handleBatchChange}
						/>
					</Form.Item>

					{selectedEditBatch ? (
						<Text type="secondary" className="batch-edit-hint">
							已使用 {selectedEditBatch.usedQuantity}，剩余{" "}
							{selectedEditBatch.remainingQuantity}。
						</Text>
					) : null}

					<Form.Item
						label="批次数量"
						name="quantity"
						rules={[
							{ required: true, message: "请输入批次数量" },
							{
								validator: (_, value: number | undefined) => {
									if (!selectedEditBatch || value === undefined) {
										return Promise.resolve();
									}
									if (value < selectedEditBatch.usedQuantity) {
										return Promise.reject(
											new Error(
												`批次数量不能小于已使用数量 ${selectedEditBatch.usedQuantity}`
											)
										);
									}
									return Promise.resolve();
								},
							},
						]}
					>
						<InputNumber
							min={selectedEditBatch ? selectedEditBatch.usedQuantity : 0.001}
							step={1}
							precision={3}
							className="full-width-input"
							placeholder={
								selectedEditBatch
									? `至少 ${selectedEditBatch.usedQuantity}`
									: "先选择批次"
							}
						/>
					</Form.Item>
					<Form.Item
						label="采购日期"
						name="purchasedAt"
						rules={[{ required: true, message: "请选择采购日期" }]}
					>
						<DatePicker className="full-width-input" />
					</Form.Item>
					<Form.Item label="生产日期" name="productionDate">
						<DatePicker className="full-width-input" />
					</Form.Item>
					<Form.Item label="保质截止日期" name="expiryDate">
						<DatePicker className="full-width-input" />
					</Form.Item>
					<Form.Item label="存放位置" name="locationCode">
						<Select
							allowClear
							placeholder="可清空"
							options={locationOptions.map((option) => ({
								label: option.name,
								value: option.code,
							}))}
						/>
					</Form.Item>
					<Form.Item label="采购渠道" name="supplier">
						<Input />
					</Form.Item>
					<Form.Item label="单价" name="unitPrice">
						<InputNumber
							min={0}
							step={0.01}
							precision={2}
							className="full-width-input"
						/>
					</Form.Item>
					<Form.Item label="备注" name="note">
						<Input.TextArea rows={3} />
					</Form.Item>
					<div className="stock-drawer-actions">
						<Button
							onClick={() => {
								stockEditForm.resetFields();
								setEditableBatches([]);
							}}
						>
							重置
						</Button>
						<Button type="primary" htmlType="submit" loading={savingStockEdit}>
							保存修改
						</Button>
					</div>
				</Form>
			</Drawer>
		</div>
	);
}

function renderExpiryStatus(item: InventoryItem) {
	if (item.expiredBatchCount > 0) {
		return <Tag className="status-tag">有过期批次</Tag>;
	}

	if (item.expiringBatchCount > 0) {
		return <Tag className="status-tag">7天内临期</Tag>;
	}

	return <Tag className="mono-tag">状态正常</Tag>;
}

export default InventoryPage;
