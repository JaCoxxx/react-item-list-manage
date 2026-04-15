import {
	App as AntdApp,
	Button,
	Card,
	Col,
	Form,
	Input,
	InputNumber,
	List,
	Row,
	Select,
	Space,
	Switch,
	Tag,
	Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "../lib/api";
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

const { Title, Text } = Typography;

type ItemMaintenancePageProps = {
	baseOptions: BaseOptionGroups;
	allItems: InventoryItem[];
	coreLoading: boolean;
	reloadCoreData: (showToast?: boolean) => Promise<void>;
};

function ItemMaintenancePage({
	baseOptions,
	allItems,
	coreLoading,
	reloadCoreData,
}: ItemMaintenancePageProps) {
	const { message } = AntdApp.useApp();
	const [itemForm] = Form.useForm<ItemFormValues>();
	const [editingItemId, setEditingItemId] = useState<string | null>(null);
	const [submittingItem, setSubmittingItem] = useState(false);
	const categoryOptions = baseOptions.category ?? EMPTY_OPTIONS;
	const locationOptions = baseOptions.location ?? EMPTY_OPTIONS;
	const unitOptions = baseOptions.unit ?? EMPTY_OPTIONS;

	const editingItem = useMemo(
		() => allItems.find((item) => item.id === editingItemId) ?? null,
		[allItems, editingItemId]
	);

	useEffect(() => {
		itemForm.resetFields();
		itemForm.setFieldsValue(
			editingItem ? mapItemToFormValues(editingItem) : getDefaultItemFormValues()
		);
	}, [editingItem, itemForm]);

	const submitItem = useCallback(
		async (values: ItemFormValues) => {
			setSubmittingItem(true);

			const payload = {
				itemName: values.itemName.trim(),
				itemCode: normalizeOptionalText(values.itemCode),
				categoryCode: values.categoryCode,
				unitCode: values.unitCode,
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
					await reloadCoreData(false);
				} else {
					const created = await requestJson<ApiResponse<{ id: string }>>(
						"/api/items",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify(payload),
						}
					);
					message.success("物品已创建");
					await reloadCoreData(false);
					setEditingItemId(created.data.id);
				}
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "保存物品失败"
				);
			} finally {
				setSubmittingItem(false);
			}
		},
		[editingItemId, message, reloadCoreData]
	);

	return (
		<div className="page-stack page-shell">
			<div className="page-title-row">
				<div>
					<Title level={4} className="page-title">
						物品维护
					</Title>
					<Text type="secondary">
						维护家庭物品主数据，后续入库会直接复用这里的分类、单位和默认位置。
					</Text>
				</div>
			</div>

			<Row gutter={[20, 20]}>
				<Col xs={24} xl={17} className="page-main-col">
					<Card
						title={editingItemId ? "编辑物品" : "新增物品"}
						className="surface-card form-card"
						extra={
							<Button
								className="card-extra-button"
								onClick={() => {
									setEditingItemId(null);
									itemForm.resetFields();
									itemForm.setFieldsValue(getDefaultItemFormValues());
								}}
							>
								新建物品
							</Button>
						}
					>
						<Form<ItemFormValues>
							form={itemForm}
							layout="vertical"
							initialValues={getDefaultItemFormValues()}
							onFinish={(values) => void submitItem(values)}
						>
							<Row gutter={[16, 0]}>
								<Col xs={24} md={12}>
									<Form.Item
										label="物品名称"
										name="itemName"
										rules={[{ required: true, message: "请输入物品名称" }]}
									>
										<Input placeholder="例如 抽纸、牛奶、洗衣液" />
									</Form.Item>
								</Col>
								<Col xs={24} md={12}>
									<Form.Item label="物品编码" name="itemCode">
										<Input placeholder="可选，用于内部编码或条码" />
									</Form.Item>
								</Col>
								<Col xs={24} md={12}>
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
								</Col>
								<Col xs={24} md={12}>
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
								</Col>
								<Col xs={24} md={12}>
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
								</Col>
								<Col xs={24} md={12}>
									<Form.Item label="默认保质期（天）" name="defaultShelfLifeDays">
										<InputNumber
											min={0}
											step={1}
											precision={0}
											className="full-width-input"
											placeholder="可选"
										/>
									</Form.Item>
								</Col>
								<Col xs={24} md={12}>
									<Form.Item label="低库存提醒值" name="minStockAlert">
										<InputNumber
											min={0}
											step={1}
											precision={3}
											className="full-width-input"
											placeholder="默认 0"
										/>
									</Form.Item>
								</Col>
								<Col xs={24} md={12}>
									<Form.Item
										label="启用状态"
										name="isActive"
										valuePropName="checked"
									>
										<Switch checkedChildren="启用" unCheckedChildren="停用" />
									</Form.Item>
								</Col>
								<Col xs={24}>
									<Form.Item label="备注" name="remark">
										<Input.TextArea
											rows={4}
											placeholder="补充物品说明，例如品牌、规格、适用场景"
										/>
									</Form.Item>
								</Col>
							</Row>

							<div className="stock-form-actions">
								<Button
									onClick={() => {
										if (editingItem) {
											itemForm.resetFields();
											itemForm.setFieldsValue(mapItemToFormValues(editingItem));
											return;
										}

										itemForm.resetFields();
										itemForm.setFieldsValue(getDefaultItemFormValues());
									}}
								>
									重置
								</Button>
								<Button
									type="primary"
									htmlType="submit"
									loading={submittingItem}
								>
									{editingItemId ? "保存修改" : "创建物品"}
								</Button>
							</div>
						</Form>
					</Card>
				</Col>

				<Col xs={24} xl={7} className="page-side-col">
					<Space direction="vertical" size={16} className="side-stack">
						<Card title="已有物品" loading={coreLoading} className="surface-card side-card">
							<List
								dataSource={allItems}
								className="item-maintenance-list"
								locale={{ emptyText: "暂无物品" }}
								renderItem={(item) => (
									<List.Item
										className={`item-maintenance-item${item.id === editingItemId ? " is-selected" : ""
											}`}
										actions={[
											<Button
												key="edit"
												type="link"
												onClick={() => setEditingItemId(item.id)}
											>
												编辑
											</Button>,
										]}
									>
										<List.Item.Meta
											title={
												<Space wrap>
													<Text strong>{item.name}</Text>
													{!item.isActive ? (
														<Tag className="status-tag">停用</Tag>
													) : null}
												</Space>
											}
											description={
												<Space direction="vertical" size={4}>
													<Text type="secondary">
														{item.code ?? "未设置编码"}
													</Text>
													<Space wrap>
														<Tag className="mono-tag">
															{findOptionName(categoryOptions, item.categoryCode)}
														</Tag>
														<Tag className="mono-tag">
															库存 {item.currentQuantity}{" "}
															{findOptionName(unitOptions, item.unitCode)}
														</Tag>
													</Space>
												</Space>
											}
										/>
									</List.Item>
								)}
							/>
						</Card>

						{editingItem ? (
							<Card title="当前编辑" className="surface-card side-card">
								<Space direction="vertical" size={12} className="status-stack">
									<div>
										<Text type="secondary">物品</Text>
										<div>
											<Text strong>{editingItem.name}</Text>
										</div>
									</div>
									<div>
										<Text type="secondary">当前位置</Text>
										<div>
											<Text>
												{findOptionName(
													locationOptions,
													editingItem.defaultLocationCode
												)}
											</Text>
										</div>
									</div>
									<div>
										<Text type="secondary">当前库存</Text>
										<div>
											<Text>
												{editingItem.currentQuantity}{" "}
												{findOptionName(unitOptions, editingItem.unitCode)}
											</Text>
										</div>
									</div>
									<div>
										<Text type="secondary">默认保质期</Text>
										<div>
											<Text>
												{editingItem.defaultShelfLifeDays
													? `${editingItem.defaultShelfLifeDays} 天`
													: "未设置"}
											</Text>
										</div>
									</div>
								</Space>
							</Card>
						) : (
							<Card title="维护说明" className="surface-card side-card">
								<Space direction="vertical" size={12} className="status-stack">
									<Text>1. 先维护物品档案，再进行入库。</Text>
									<Text>2. 默认位置和默认保质期会在新增库存时自动复用。</Text>
									<Text>3. 低库存提醒值用于总览中的缺货预警。</Text>
								</Space>
							</Card>
						)}
					</Space>
				</Col>
			</Row>
		</div>
	);
}

export default ItemMaintenancePage;
