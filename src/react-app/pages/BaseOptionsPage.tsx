import { ArrowLeftOutlined } from "@ant-design/icons";
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
import type { ApiResponse, BaseOption, BaseOptionGroups } from "../lib/types";
import { displayTypeName, normalizeOptionalText } from "../lib/utils";

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type BaseOptionsPageProps = {
	baseOptions: BaseOptionGroups;
	reloadCoreData: (showToast?: boolean) => Promise<void>;
};

type BaseOptionFormValues = {
	optionType: string;
	optionCode: string;
	optionName: string;
	sortOrder?: number;
	remark?: string;
	isActive: boolean;
};

type OptionTypeSummary = {
	type: string;
	total: number;
	active: number;
	inactive: number;
};

const KNOWN_BASE_OPTION_TYPES = ["category", "location", "unit", "outbound_reason"];

const DEFAULT_FORM_VALUES: BaseOptionFormValues = {
	optionType: "",
	optionCode: "",
	optionName: "",
	sortOrder: 0,
	remark: undefined,
	isActive: true,
};

function BaseOptionsPage({ baseOptions, reloadCoreData }: BaseOptionsPageProps) {
	const { message } = AntdApp.useApp();
	const screens = useBreakpoint();
	const isMobile = !screens.md;
	const [optionForm] = Form.useForm<BaseOptionFormValues>();
	const [options, setOptions] = useState<BaseOption[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
	const [selectedType, setSelectedType] = useState<string | null>(null);
	const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
	const [detailOptionId, setDetailOptionId] = useState<string | null>(null);
	const [formDrawerOpen, setFormDrawerOpen] = useState(false);
	const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [actionKey, setActionKey] = useState<string | null>(null);

	const typeOptions = useMemo(() => {
		const allTypes = new Set<string>(KNOWN_BASE_OPTION_TYPES);
		Object.keys(baseOptions).forEach((type) => allTypes.add(type));
		options.forEach((option) => allTypes.add(option.type));
		return Array.from(allTypes).sort().map((type) => ({
			label: displayTypeName(type),
			value: type,
		}));
	}, [baseOptions, options]);

	const typeSummaryList = useMemo(() => {
		const summaryMap = new Map<string, OptionTypeSummary>();
		typeOptions.forEach(({ value }) => {
			summaryMap.set(value, {
				type: value,
				total: 0,
				active: 0,
				inactive: 0,
			});
		});

		options.forEach((option) => {
			const current = summaryMap.get(option.type) ?? {
				type: option.type,
				total: 0,
				active: 0,
				inactive: 0,
			};
			current.total += 1;
			if (option.isActive) {
				current.active += 1;
			} else {
				current.inactive += 1;
			}
			summaryMap.set(option.type, current);
		});

		return Array.from(summaryMap.values()).sort((a, b) =>
			a.type.localeCompare(b.type, "en")
		);
	}, [options, typeOptions]);

	const editingOption = useMemo(
		() => options.find((option) => option.id === editingOptionId) ?? null,
		[options, editingOptionId]
	);
	const detailOption = useMemo(
		() => options.find((option) => option.id === detailOptionId) ?? null,
		[options, detailOptionId]
	);

	const loadOptions = useCallback(async () => {
		setLoading(true);
		try {
			const response = await fetchJson<ApiResponse<Record<string, BaseOption[]>>>(
				"/api/base-options?includeInactive=true"
			);
			const merged = Object.values(response.data).flat();
			merged.sort((a, b) => {
				if (a.type !== b.type) {
					return a.type.localeCompare(b.type);
				}
				if (a.sortOrder !== b.sortOrder) {
					return a.sortOrder - b.sortOrder;
				}
				return a.name.localeCompare(b.name, "zh-Hans-CN");
			});
			setOptions(merged);
		} catch (requestError) {
			message.error(
				requestError instanceof Error ? requestError.message : "加载基础数据失败"
			);
		} finally {
			setLoading(false);
		}
	}, [message]);

	useEffect(() => {
		void loadOptions();
	}, [loadOptions]);

	const filteredOptions = useMemo(() => {
		if (!selectedType) {
			return [];
		}

		const keyword = search.trim().toLowerCase();
		return options.filter((option) => {
			if (option.type !== selectedType) {
				return false;
			}
			if (statusFilter === "active" && !option.isActive) {
				return false;
			}
			if (statusFilter === "inactive" && option.isActive) {
				return false;
			}
			if (!keyword) {
				return true;
			}
			return (
				option.name.toLowerCase().includes(keyword) ||
				option.code.toLowerCase().includes(keyword)
			);
		});
	}, [options, search, selectedType, statusFilter]);

	const openCreateDrawer = useCallback(
		(defaultType?: string) => {
			setEditingOptionId(null);
			optionForm.resetFields();
			optionForm.setFieldsValue({
				...DEFAULT_FORM_VALUES,
				optionType: defaultType ?? selectedType ?? typeOptions[0]?.value ?? "",
			});
			setFormDrawerOpen(true);
		},
		[optionForm, selectedType, typeOptions]
	);

	const openEditDrawer = useCallback(
		(option: BaseOption) => {
			setEditingOptionId(option.id);
			optionForm.resetFields();
			optionForm.setFieldsValue({
				optionType: option.type,
				optionCode: option.code,
				optionName: option.name,
				sortOrder: option.sortOrder,
				remark: option.remark ?? undefined,
				isActive: option.isActive,
			});
			setFormDrawerOpen(true);
		},
		[optionForm]
	);

	const openDetailDrawer = useCallback((option: BaseOption) => {
		setDetailOptionId(option.id);
		setDetailDrawerOpen(true);
	}, []);

	const closeDetailDrawer = useCallback(() => {
		setDetailDrawerOpen(false);
		setDetailOptionId(null);
	}, []);

	const submitOption = useCallback(
		async (values: BaseOptionFormValues) => {
			setSubmitting(true);
			try {
				if (editingOption) {
					await requestJson<ApiResponse<{ id: string; updated: boolean }>>(
						`/api/base-options/${editingOption.type}/${editingOption.id}`,
						{
							method: "PATCH",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								optionCode: values.optionCode.trim(),
								optionName: values.optionName.trim(),
								sortOrder: values.sortOrder ?? 0,
								remark: normalizeOptionalText(values.remark),
								isActive: values.isActive,
							}),
						}
					);
					message.success("基础数据已更新");
				} else {
					await requestJson<ApiResponse<{ id: string; created: boolean }>>(
						"/api/base-options",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								optionType: values.optionType,
								optionCode: values.optionCode.trim(),
								optionName: values.optionName.trim(),
								sortOrder: values.sortOrder ?? 0,
								remark: normalizeOptionalText(values.remark),
								isActive: values.isActive,
							}),
						}
					);
					message.success("基础数据已创建");
				}
				setFormDrawerOpen(false);
				await Promise.all([loadOptions(), reloadCoreData(false)]);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "保存基础数据失败"
				);
			} finally {
				setSubmitting(false);
			}
		},
		[editingOption, loadOptions, message, reloadCoreData]
	);

	const toggleOptionStatus = useCallback(
		async (option: BaseOption, nextIsActive: boolean) => {
			const key = `${option.id}:toggle`;
			setActionKey(key);
			try {
				await requestJson<ApiResponse<{ id: string; updated: boolean }>>(
					`/api/base-options/${option.type}/${option.id}`,
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
				message.success(nextIsActive ? "已启用" : "已禁用");
				await Promise.all([loadOptions(), reloadCoreData(false)]);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "更新状态失败"
				);
			} finally {
				setActionKey(null);
			}
		},
		[loadOptions, message, reloadCoreData]
	);

	const deleteOption = useCallback(
		async (option: BaseOption) => {
			const key = `${option.id}:delete`;
			setActionKey(key);
			try {
				await requestJson<ApiResponse<{ id: string; deleted: boolean }>>(
					`/api/base-options/${option.type}/${option.id}`,
					{
						method: "DELETE",
					}
				);
				message.success("已删除");
				if (detailOptionId === option.id) {
					closeDetailDrawer();
				}
				await Promise.all([loadOptions(), reloadCoreData(false)]);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "删除失败"
				);
			} finally {
				setActionKey(null);
			}
		},
		[closeDetailDrawer, detailOptionId, loadOptions, message, reloadCoreData]
	);

	const rowActions = useCallback(
		(option: BaseOption) => (
			<Space wrap className="base-option-actions">
				<Button
					size="small"
					onClick={(event) => {
						event.stopPropagation();
						openEditDrawer(option);
					}}
				>
					编辑
				</Button>
				<Popconfirm
					title="确认删除该基础数据？"
					description="被其他记录引用时无法删除。"
					okText="删除"
					cancelText="取消"
					onConfirm={() => void deleteOption(option)}
				>
					<Button
						size="small"
						danger
						loading={actionKey === `${option.id}:delete`}
						onClick={(event) => event.stopPropagation()}
					>
						删除
					</Button>
				</Popconfirm>
				{option.isActive ? (
					<Button
						size="small"
						loading={actionKey === `${option.id}:toggle`}
						onClick={(event) => {
							event.stopPropagation();
							void toggleOptionStatus(option, false);
						}}
					>
						禁用
					</Button>
				) : (
					<Button
						size="small"
						type="primary"
						loading={actionKey === `${option.id}:toggle`}
						onClick={(event) => {
							event.stopPropagation();
							void toggleOptionStatus(option, true);
						}}
					>
						启用
					</Button>
				)}
			</Space>
		),
		[actionKey, deleteOption, openEditDrawer, toggleOptionStatus]
	);

	const optionColumns: TableColumnsType<BaseOption> = useMemo(
		() => [
			{
				title: "编码",
				dataIndex: "code",
				key: "code",
			},
			{
				title: "名称",
				dataIndex: "name",
				key: "name",
			},
			{
				title: "排序",
				dataIndex: "sortOrder",
				key: "sortOrder",
				align: "right",
			},
			{
				title: "状态",
				key: "status",
				render: (_, option) =>
					option.isActive ? (
						<Tag className="mono-tag">启用</Tag>
					) : (
						<Tag className="status-tag">停用</Tag>
					),
			},
			{
				title: "操作",
				key: "actions",
				width: 270,
				render: (_, option) => rowActions(option),
			},
		],
		[rowActions]
	);

	const typeColumns: TableColumnsType<OptionTypeSummary> = useMemo(
		() => [
			{
				title: "类型",
				key: "type",
				render: (_, entry) => displayTypeName(entry.type),
			},
			{
				title: "编码值数量",
				dataIndex: "total",
				key: "total",
				align: "right",
			},
			{
				title: "启用/停用",
				key: "status",
				render: (_, entry) => (
					<Text>
						{entry.active}/{entry.inactive}
					</Text>
				),
			},
			{
				title: "操作",
				key: "actions",
				width: 140,
				render: (_, entry) => (
					<Button size="small" onClick={() => setSelectedType(entry.type)}>
						进入列表
					</Button>
				),
			},
		],
		[]
	);

	return (
		<div className="page-stack page-shell">
			<div className="page-title-row">
				<div className="page-title-copy">
					{selectedType ? (
						<ArrowLeftOutlined
							className="page-back-trigger"
							onClick={() => {
								setSelectedType(null);
								setSearch("");
								setStatusFilter("all");
							}}
						/>
					) : null}
					<div>
						<Title level={4} className="page-title">
							{selectedType ? `${displayTypeName(selectedType)} 列表` : "基础数据类型"}
						</Title>
					</div>
				</div>
				<Space className="page-header-actions">
					<Button
						type="primary"
						className="page-action-button"
						onClick={() => openCreateDrawer(selectedType ?? undefined)}
					>
						新增基础数据
					</Button>
				</Space>
			</div>

			{selectedType ? (
				<Card className="surface-card">
					<Space wrap className="base-option-filters">
						<Input
							allowClear
							placeholder="搜索名称/编码"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="base-option-search"
						/>
						<Select
							value={statusFilter}
							options={[
								{ label: "全部状态", value: "all" },
								{ label: "仅启用", value: "active" },
								{ label: "仅停用", value: "inactive" },
							]}
							onChange={(value) =>
								setStatusFilter(value as "all" | "active" | "inactive")
							}
							className="base-option-select"
						/>
					</Space>

					{isMobile ? (
						<List
							className="base-option-mobile-list"
							loading={loading}
							dataSource={filteredOptions}
							locale={{ emptyText: "该类型下暂无基础数据" }}
							renderItem={(option) => (
								<List.Item
									className="base-option-mobile-item"
									onClick={() => openDetailDrawer(option)}
								>
									<div className="base-option-mobile-main">
										<Text strong>{option.name}</Text>
										<Text type="secondary">{option.code}</Text>
									</div>
									<Space size={8}>
										{option.isActive ? (
											<Tag className="mono-tag">启用</Tag>
										) : (
											<Tag className="status-tag">停用</Tag>
										)}
									</Space>
									<div className="base-option-mobile-actions">{rowActions(option)}</div>
								</List.Item>
							)}
						/>
					) : (
						<Table<BaseOption>
							rowKey="id"
							loading={loading}
							columns={optionColumns}
							dataSource={filteredOptions}
							pagination={{ pageSize: 12, showSizeChanger: false }}
							scroll={{ x: 980 }}
							onRow={(option) => ({
								onClick: () => openDetailDrawer(option),
							})}
							rowClassName={() => "item-list-row"}
							className="item-list-table"
						/>
					)}
				</Card>
			) : (
				<Card className="surface-card">
					{isMobile ? (
						<List
							className="base-option-type-list"
							loading={loading}
							dataSource={typeSummaryList}
							renderItem={(entry) => (
								<List.Item
									className="base-option-type-item"
									onClick={() => setSelectedType(entry.type)}
								>
									<div className="base-option-type-main">
										<Text strong>{displayTypeName(entry.type)}</Text>
										<Text type="secondary">
											共 {entry.total} 项，启用 {entry.active}，停用 {entry.inactive}
										</Text>
									</div>
									<Button size="small">进入</Button>
								</List.Item>
							)}
						/>
					) : (
						<Table<OptionTypeSummary>
							rowKey="type"
							loading={loading}
							columns={typeColumns}
							dataSource={typeSummaryList}
							pagination={false}
							onRow={(entry) => ({
								onClick: () => setSelectedType(entry.type),
							})}
							rowClassName={() => "item-list-row"}
							className="item-list-table"
						/>
					)}
				</Card>
			)}

			<Drawer
				title="基础数据详情"
				placement="right"
				size={isMobile ? "100%" : 520}
				open={detailDrawerOpen}
				onClose={closeDetailDrawer}
				className="item-detail-drawer"
			>
				{detailOption ? (
					<>
						<Descriptions column={1} size="small">
							<Descriptions.Item label="类型">
								{displayTypeName(detailOption.type)}
							</Descriptions.Item>
							<Descriptions.Item label="编码">{detailOption.code}</Descriptions.Item>
							<Descriptions.Item label="名称">{detailOption.name}</Descriptions.Item>
							<Descriptions.Item label="排序">{detailOption.sortOrder}</Descriptions.Item>
							<Descriptions.Item label="状态">
								{detailOption.isActive ? "启用" : "停用"}
							</Descriptions.Item>
							<Descriptions.Item label="备注">
								{detailOption.remark ?? "无"}
							</Descriptions.Item>
							<Descriptions.Item label="创建时间">
								{detailOption.createdAt}
							</Descriptions.Item>
							<Descriptions.Item label="更新时间">
								{detailOption.updatedAt}
							</Descriptions.Item>
						</Descriptions>
						<div className="stock-drawer-actions">
							<Button onClick={() => openCreateDrawer(detailOption.type)}>新增</Button>
							<Button onClick={() => openEditDrawer(detailOption)}>编辑</Button>
							<Popconfirm
								title="确认删除该基础数据？"
								description="被其他记录引用时无法删除。"
								okText="删除"
								cancelText="取消"
								onConfirm={() => void deleteOption(detailOption)}
							>
								<Button
									danger
									loading={actionKey === `${detailOption.id}:delete`}
								>
									删除
								</Button>
							</Popconfirm>
							{detailOption.isActive ? (
								<Button
									loading={actionKey === `${detailOption.id}:toggle`}
									onClick={() => void toggleOptionStatus(detailOption, false)}
								>
									禁用
								</Button>
							) : (
								<Button
									type="primary"
									loading={actionKey === `${detailOption.id}:toggle`}
									onClick={() => void toggleOptionStatus(detailOption, true)}
								>
									启用
								</Button>
							)}
						</div>
					</>
				) : (
					<Text type="secondary">未找到该基础数据详情。</Text>
				)}
			</Drawer>

			<Drawer
				title={editingOption ? "编辑基础数据" : "新增基础数据"}
				placement="right"
				size={isMobile ? "100%" : 520}
				open={formDrawerOpen}
				onClose={() => {
					setFormDrawerOpen(false);
					setEditingOptionId(null);
				}}
				className="item-form-drawer"
			>
				<Form<BaseOptionFormValues>
					form={optionForm}
					layout="vertical"
					initialValues={DEFAULT_FORM_VALUES}
					onFinish={(values) => void submitOption(values)}
				>
					<Form.Item
						label="类型"
						name="optionType"
						rules={[{ required: true, message: "请选择类型" }]}
					>
						<Select
							disabled={Boolean(editingOption) || Boolean(selectedType)}
							options={typeOptions}
							placeholder="选择类型"
						/>
					</Form.Item>
					<Form.Item
						label="编码"
						name="optionCode"
						rules={[{ required: true, message: "请输入编码" }]}
					>
						<Input placeholder="例如 kitchen、bottle、consume" />
					</Form.Item>
					<Form.Item
						label="名称"
						name="optionName"
						rules={[{ required: true, message: "请输入名称" }]}
					>
						<Input placeholder="例如 厨房、瓶、食用/使用" />
					</Form.Item>
					<Form.Item label="排序" name="sortOrder">
						<InputNumber
							min={0}
							precision={0}
							step={1}
							className="full-width-input"
						/>
					</Form.Item>
					<Form.Item label="启用状态" name="isActive" valuePropName="checked">
						<Switch checkedChildren="启用" unCheckedChildren="停用" />
					</Form.Item>
					<Form.Item label="备注" name="remark">
						<Input.TextArea rows={4} />
					</Form.Item>
					<div className="stock-drawer-actions">
						<Button
							onClick={() => {
								if (editingOption) {
									optionForm.setFieldsValue({
										optionType: editingOption.type,
										optionCode: editingOption.code,
										optionName: editingOption.name,
										sortOrder: editingOption.sortOrder,
										remark: editingOption.remark ?? undefined,
										isActive: editingOption.isActive,
									});
									return;
								}
								optionForm.resetFields();
								optionForm.setFieldsValue({
									...DEFAULT_FORM_VALUES,
									optionType: selectedType ?? typeOptions[0]?.value ?? "",
								});
							}}
						>
							重置
						</Button>
						<Button type="primary" htmlType="submit" loading={submitting}>
							{editingOption ? "保存修改" : "创建"}
						</Button>
					</div>
				</Form>
			</Drawer>
		</div>
	);
}

export default BaseOptionsPage;
