import {
	Alert,
	App as AntdApp,
	Button,
	Card,
	Col,
	DatePicker,
	Form,
	Input,
	InputNumber,
	Row,
	Select,
	Space,
	Typography,
} from "antd";
import { useCallback, useState } from "react";
import { requestJson } from "../lib/api";
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
	StockInFormValues,
} from "../lib/types";

const { Text } = Typography;

type StockInPageProps = {
	baseOptions: BaseOptionGroups;
	allItems: InventoryItem[];
	coreLoading: boolean;
	reloadCoreData: (showToast?: boolean) => Promise<void>;
};

function StockInPage({
	baseOptions,
	allItems,
	coreLoading,
	reloadCoreData,
}: StockInPageProps) {
	const { message } = AntdApp.useApp();
	const [stockInForm] = Form.useForm<StockInFormValues>();
	const [submittingStock, setSubmittingStock] = useState(false);
	const selectedStockItemId = Form.useWatch("itemId", stockInForm);
	const selectedStockItem =
		allItems.find((item) => item.id === selectedStockItemId) ?? null;
	const locationOptions = baseOptions.location ?? EMPTY_OPTIONS;
	const unitOptions = baseOptions.unit ?? EMPTY_OPTIONS;
	const itemOptions = allItems.map((item) => ({
		label: `${item.name}${item.code ? ` (${item.code})` : ""}`,
		value: item.id,
	}));

	const submitStockIn = useCallback(
		async (values: StockInFormValues) => {
			setSubmittingStock(true);

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
				stockInForm.resetFields();
				stockInForm.setFieldsValue(getDefaultStockInValues());
				await reloadCoreData(false);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "新增库存失败"
				);
			} finally {
				setSubmittingStock(false);
			}
		},
		[message, reloadCoreData, stockInForm]
	);

	return (
		<div className="page-stack page-shell">

			<Row gutter={[20, 20]}>
				<Col xs={24} xl={17} className="page-main-col">
					<Card title="新增入库批次" className="surface-card form-card">
						{allItems.length === 0 ? (
							<Alert
								type="info"
								showIcon
								message="暂无可入库物品"
								description="当前还没有物品档案，请先前往“物品维护”页面创建物品。"
							/>
						) : (
							<Form<StockInFormValues>
								form={stockInForm}
								layout="vertical"
								initialValues={getDefaultStockInValues()}
								onFinish={(values) => void submitStockIn(values)}
							>
								<Row gutter={[16, 0]}>
									<Col xs={24} md={12}>
										<Form.Item
											label="物品"
											name="itemId"
											rules={[{ required: true, message: "请选择物品" }]}
										>
											<Select
												showSearch
												placeholder="选择已有物品"
												options={itemOptions}
												optionFilterProp="label"
											/>
										</Form.Item>
									</Col>
									<Col xs={24} md={12}>
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
												placeholder="例如 2"
											/>
										</Form.Item>
									</Col>
									<Col xs={24} md={12}>
										<Form.Item
											label="入库日期"
											name="movementDate"
											rules={[{ required: true, message: "请选择入库日期" }]}
										>
											<DatePicker className="full-width-input" />
										</Form.Item>
									</Col>
									<Col xs={24} md={12}>
										<Form.Item
											label="采购日期"
											name="purchasedAt"
											rules={[{ required: true, message: "请选择采购日期" }]}
										>
											<DatePicker className="full-width-input" />
										</Form.Item>
									</Col>
									<Col xs={24} md={12}>
										<Form.Item label="生产日期" name="productionDate">
											<DatePicker className="full-width-input" />
										</Form.Item>
									</Col>
									<Col xs={24} md={12}>
										<Form.Item label="保质截止日期" name="expiryDate">
											<DatePicker className="full-width-input" />
										</Form.Item>
									</Col>
									<Col xs={24} md={12}>
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
									</Col>
									<Col xs={24} md={12}>
										<Form.Item label="采购渠道" name="supplier">
											<Input placeholder="例如 盒马、京东、超市" />
										</Form.Item>
									</Col>
									<Col xs={24} md={12}>
										<Form.Item label="单价" name="unitPrice">
											<InputNumber
												min={0}
												step={0.01}
												precision={2}
												className="full-width-input"
												placeholder="可选"
											/>
										</Form.Item>
									</Col>
									<Col xs={24}>
										<Form.Item label="备注" name="note">
											<Input.TextArea
												rows={4}
												placeholder="补充说明，例如规格、活动价、批次备注"
											/>
										</Form.Item>
									</Col>
								</Row>

								<div className="stock-form-actions">
									<Button
										onClick={() => {
											stockInForm.resetFields();
											stockInForm.setFieldsValue(getDefaultStockInValues());
										}}
									>
										重置
									</Button>
									<Button
										type="primary"
										htmlType="submit"
										loading={submittingStock}
									>
										保存入库
									</Button>
								</div>
							</Form>
						)}
					</Card>
				</Col>

				<Col xs={24} xl={7} className="page-side-col">
					<Space direction="vertical" size={16} className="side-stack">
						<Card title="填写提示" loading={coreLoading} className="surface-card side-card">
							<Space direction="vertical" size={12} className="status-stack">
								<Text>1. 优先选择已有物品档案，数量支持小数。</Text>
								<Text>
									2. 如果填写生产日期且物品设置了默认保质天数，后端会自动计算截止日期。
								</Text>
								<Text>3. 位置不填时，会优先使用物品的默认位置。</Text>
							</Space>
						</Card>

						{selectedStockItem ? (
							<Card title="当前物品信息" className="surface-card side-card">
								<Space direction="vertical" size={12} className="status-stack">
									<div>
										<Text type="secondary">物品</Text>
										<div>
											<Text strong>{selectedStockItem.name}</Text>
										</div>
									</div>
									<div>
										<Text type="secondary">当前库存</Text>
										<div>
											<Text>
												{selectedStockItem.currentQuantity}{" "}
												{findOptionName(unitOptions, selectedStockItem.unitCode)}
											</Text>
										</div>
									</div>
									<div>
										<Text type="secondary">默认位置</Text>
										<div>
											<Text>
												{findOptionName(
													locationOptions,
													selectedStockItem.defaultLocationCode
												)}
											</Text>
										</div>
									</div>
									<div>
										<Text type="secondary">默认保质期</Text>
										<div>
											<Text>
												{selectedStockItem.defaultShelfLifeDays
													? `${selectedStockItem.defaultShelfLifeDays} 天`
													: "未设置"}
											</Text>
										</div>
									</div>
								</Space>
							</Card>
						) : null}
					</Space>
				</Col>
			</Row>
		</div>
	);
}

export default StockInPage;
