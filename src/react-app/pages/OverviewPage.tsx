import { ReloadOutlined } from "@ant-design/icons";
import {
	Alert,
	App as AntdApp,
	Button,
	Card,
	Col,
	Grid,
	Input,
	List,
	Row,
	Select,
	Space,
	Statistic,
	Table,
	Tag,
	Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import { displayTypeName, EMPTY_OPTIONS, findOptionName } from "../lib/utils";
import type {
	ApiResponse,
	BaseOptionGroups,
	DashboardData,
	InventoryItem,
	SetupStatus,
} from "../lib/types";

const { useBreakpoint } = Grid;
const { Title, Text } = Typography;

type OverviewPageProps = {
	baseOptions: BaseOptionGroups;
	coreLoading: boolean;
};

function OverviewPage({ baseOptions, coreLoading }: OverviewPageProps) {
	const { message } = AntdApp.useApp();
	const screens = useBreakpoint();
	const isMobile = !screens.md;
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
	const [dashboard, setDashboard] = useState<DashboardData | null>(null);
	const [items, setItems] = useState<InventoryItem[]>([]);
	const [search, setSearch] = useState("");
	const [appliedSearch, setAppliedSearch] = useState("");
	const [categoryCode, setCategoryCode] = useState<string | undefined>();
	const [locationCode, setLocationCode] = useState<string | undefined>();

	const categoryOptions = baseOptions.category ?? EMPTY_OPTIONS;
	const locationOptions = baseOptions.location ?? EMPTY_OPTIONS;
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

				const [setupResponse, dashboardResponse, itemsResponse] = await Promise.all([
					fetchJson<ApiResponse<SetupStatus>>("/api/setup/status"),
					fetchJson<ApiResponse<DashboardData>>("/api/dashboard"),
					fetchJson<ApiResponse<InventoryItem[]>>(`/api/items?${query.toString()}`),
				]);

				setSetupStatus(setupResponse.data);
				setDashboard(dashboardResponse.data);
				setItems(itemsResponse.data);

				if (showToast) {
					message.success("页面已刷新");
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
		[appliedSearch, categoryCode, locationCode, message]
	);

	useEffect(() => {
		void loadData(false);
	}, [loadData]);

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
				title: "分类/位置",
				key: "categoryLocation",
				render: (_, record) => (
					<Space wrap>
						<Tag className="mono-tag">
							{findOptionName(categoryOptions, record.categoryCode)}
						</Tag>
						<Tag className="mono-tag">
							{findOptionName(locationOptions, record.defaultLocationCode)}
						</Tag>
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
			{
				title: "补货线",
				dataIndex: "minStockAlert",
				key: "minStockAlert",
				align: "right",
				render: (value, record) =>
					value > 0
						? `${value} ${findOptionName(unitOptions, record.unitCode)}`
						: "未设置",
			},
		],
		[categoryOptions, locationOptions, unitOptions]
	);

	const baseOptionCards = useMemo(
		() =>
			Object.entries(baseOptions).map(([type, options]) => ({
				type,
				count: options.length,
			})),
		[baseOptions]
	);
	const summaryStats = useMemo(
		() => [
			{ title: "物品总数", value: dashboard?.totalItems ?? 0 },
			{ title: "有库存", value: dashboard?.itemsInStock ?? 0 },
			{ title: "低库存", value: dashboard?.itemsBelowMinStock ?? 0 },
			{
				title: "临期/过期",
				value: dashboard
					? dashboard.itemsExpiringSoon + dashboard.itemsWithExpiredStock
					: 0,
			},
		],
		[dashboard]
	);

	return (
		<div className="page-stack page-shell">
			<div className="page-title-row">
				<div>
					<Title level={4} className="page-title">
						库存总览
					</Title>
					<Text type="secondary">
						查看库存状态、临期情况和基础数据概览，支持按名称、分类和位置筛选。
					</Text>
				</div>
				<Button
					icon={<ReloadOutlined />}
					onClick={() => void loadData(true)}
					loading={refreshing}
					className="page-action-button"
				>
					刷新本页
				</Button>
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

			{setupStatus && !setupStatus.ready ? (
				<Alert
					className="page-alert"
					type="warning"
					showIcon
					message="D1 尚未完成初始化"
					description={`缺少表：${setupStatus.missingTables.join(", ") || "无"}；缺少视图：${setupStatus.missingViews.join(", ") || "无"}。`}
				/>
			) : null}

			{isMobile ? (
				<div className="summary-strip" aria-label="汇总数据">
					{summaryStats.map((stat) => (
						<div className="summary-strip-item" key={stat.title}>
							<Text type="secondary" className="summary-strip-label">
								{stat.title}
							</Text>
							<Text strong className="summary-strip-value">
								{loading ? "--" : stat.value}
							</Text>
						</div>
					))}
				</div>
			) : (
				<Row gutter={[20, 20]} className="summary-row">
					{loading || !dashboard
						? Array.from({ length: 4 }).map((_, index) => (
								<Col xs={12} sm={12} lg={6} key={index}>
									<Card loading className="surface-card stat-card" />
								</Col>
						  ))
						: summaryStats.map((stat) => (
								<Col xs={12} sm={12} lg={6} key={stat.title}>
									<Card className="surface-card stat-card">
										<Statistic title={stat.title} value={stat.value} />
									</Card>
								</Col>
						  ))}
				</Row>
			)}

			<Row gutter={[20, 20]} className="section-row">
				<Col xs={24} xl={17} className="page-main-col">
					<Card title="库存清单" className="surface-card">
						<div className="inventory-toolbar">
							<Input.Search
								allowClear
								placeholder="搜索名称或编码"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								onSearch={(value) => setAppliedSearch(value.trim())}
								className="inventory-search"
							/>
							<Select
								allowClear
								placeholder="分类"
								value={categoryCode}
								options={categoryOptions.map((option) => ({
									label: option.name,
									value: option.code,
								}))}
								onChange={(value) => setCategoryCode(value)}
								className="inventory-select"
							/>
							<Select
								allowClear
								placeholder="位置"
								value={locationCode}
								options={locationOptions.map((option) => ({
									label: option.name,
									value: option.code,
								}))}
								onChange={(value) => setLocationCode(value)}
								className="inventory-select"
							/>
							<Button
								type="primary"
								onClick={() => setAppliedSearch(search.trim())}
								className="filter-button"
							>
								筛选
							</Button>
						</div>

						{isMobile ? (
							<List
								loading={loading}
								dataSource={items}
								className="inventory-mobile-list"
								locale={{ emptyText: "暂无物品" }}
								renderItem={(item) => (
									<List.Item className="inventory-mobile-item">
										<Card size="small" className="inventory-mobile-card">
											<Space
												direction="vertical"
												size={12}
												className="inventory-mobile-stack"
											>
												<div className="inventory-mobile-header">
													<div>
														<Text strong>{item.name}</Text>
														<div>
															<Text type="secondary">
																{item.code ?? "未设置编码"}
															</Text>
														</div>
													</div>
													<Text strong>
														{item.currentQuantity}{" "}
														{findOptionName(unitOptions, item.unitCode)}
													</Text>
												</div>

												<Space wrap>
													<Tag className="mono-tag">
														{findOptionName(categoryOptions, item.categoryCode)}
													</Tag>
													<Tag className="mono-tag">
														{findOptionName(
															locationOptions,
															item.defaultLocationCode
														)}
													</Tag>
													{renderExpiryStatus(item)}
												</Space>

												<div className="inventory-mobile-meta">
													<div className="inventory-mobile-meta-item">
														<Text type="secondary">最近到期</Text>
														<Text>{item.nearestExpiryDate ?? "未设置"}</Text>
													</div>
													<div className="inventory-mobile-meta-item">
														<Text type="secondary">补货线</Text>
														<Text>
															{item.minStockAlert > 0
																? `${item.minStockAlert} ${findOptionName(unitOptions, item.unitCode)}`
																: "未设置"}
														</Text>
													</div>
												</div>
											</Space>
										</Card>
									</List.Item>
								)}
							/>
						) : (
							<Table<InventoryItem>
								rowKey="id"
								loading={loading}
								columns={itemColumns}
								dataSource={items}
								pagination={{ pageSize: 8, showSizeChanger: false }}
								scroll={{ x: 900 }}
							/>
						)}
					</Card>
				</Col>

				<Col xs={24} xl={7} className="page-side-col">
					<Space direction="vertical" size={16} className="side-stack">
						<Card title="基础数据" className="surface-card side-card">
							<List
								dataSource={baseOptionCards}
								loading={coreLoading}
								renderItem={(entry) => (
									<List.Item>
										<List.Item.Meta
											title={displayTypeName(entry.type)}
											description={`${entry.count} 个可选项`}
										/>
									</List.Item>
								)}
							/>
						</Card>

						<Card title="当前状态" className="surface-card side-card">
							<Space direction="vertical" size={12} className="status-stack">
								<Statistic
									title="基础数据项"
									value={setupStatus?.baseOptionCount ?? 0}
								/>
								<Statistic
									title="无库存物品"
									value={dashboard?.itemsOutOfStock ?? 0}
								/>
								<Statistic
									title="总库存数量"
									value={dashboard?.totalQuantity ?? 0}
								/>
							</Space>
						</Card>
					</Space>
				</Col>
			</Row>
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

export default OverviewPage;
