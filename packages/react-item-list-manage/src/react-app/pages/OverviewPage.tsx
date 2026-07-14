import { ReloadOutlined, ScanOutlined } from "@ant-design/icons";
import {
	Alert,
	App as AntdApp,
	Button,
	Card,
	Col,
	Grid,
	Row,
	Space,
	Statistic,
	Typography,
} from "antd";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import { displayTypeName, EMPTY_OPTIONS } from "../lib/utils";
import type {
	ApiResponse,
	BaseOptionGroups,
	DashboardData,
	SetupStatus,
} from "../lib/types";

const { useBreakpoint } = Grid;
const { Text } = Typography;

type OverviewPageProps = {
	baseOptions: BaseOptionGroups;
	onOpenInventory: () => void;
	onOpenOcrUpload: () => void;
};

function OverviewPage({ baseOptions, onOpenInventory, onOpenOcrUpload }: OverviewPageProps) {
	const { message } = AntdApp.useApp();
	const screens = useBreakpoint();
	const isMobile = !screens.md;
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
	const [dashboard, setDashboard] = useState<DashboardData | null>(null);

	const loadData = useCallback(
		async (showToast: boolean) => {
			setError(null);
			setRefreshing(showToast);

			try {
				const [setupResponse, dashboardResponse] = await Promise.all([
					fetchJson<ApiResponse<SetupStatus>>("/api/setup/status"),
					fetchJson<ApiResponse<DashboardData>>("/api/dashboard"),
				]);

				setSetupStatus(setupResponse.data);
				setDashboard(dashboardResponse.data);

				if (showToast) {
					message.success("统计已刷新");
				}
			} catch (requestError) {
				const nextError =
					requestError instanceof Error ? requestError.message : "加载统计失败";
				setError(nextError);

				if (showToast) {
					message.error(nextError);
				}
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[message]
	);

	useEffect(() => {
		void loadData(false);
	}, [loadData]);

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

	const optionStats = useMemo(() => {
		const categories = baseOptions.category ?? EMPTY_OPTIONS;
		const locations = baseOptions.location ?? EMPTY_OPTIONS;
		const units = baseOptions.unit ?? EMPTY_OPTIONS;
		const total = Object.values(baseOptions).reduce(
			(sum, options) => sum + options.length,
			0
		);

		return [
			{ title: "基础数据总项", value: total },
			{ title: "分类数量", value: categories.length },
			{ title: "位置数量", value: locations.length },
			{ title: "单位数量", value: units.length },
		];
	}, [baseOptions]);

	const optionTypeStats = useMemo(
		() =>
			Object.entries(baseOptions).map(([type, options]) => ({
				type,
				count: options.length,
			})),
		[baseOptions]
	);

	const handleSummaryKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}

		event.preventDefault();
		onOpenInventory();
	}, [onOpenInventory]);

	return (
		<div className="page-stack page-shell">
			<div className="page-title-row">
				<Space className="page-header-actions">
					<Button
						type="primary"
						icon={<ScanOutlined />}
						onClick={onOpenOcrUpload}
						className="page-action-button"
					>
						OCR上传
					</Button>
					<Button
						icon={<ReloadOutlined />}
						onClick={() => void loadData(true)}
						loading={refreshing}
						className="page-action-button"
					>
						刷新统计
					</Button>
				</Space>
			</div>

			{error ? (
				<Alert
					className="page-alert"
					type="error"
					showIcon
					message="统计接口加载失败"
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
				<div
					className="summary-strip summary-strip-clickable"
					aria-label="首页汇总数据，点击跳转库存列表"
					role="button"
					tabIndex={0}
					onClick={onOpenInventory}
					onKeyDown={handleSummaryKeyDown}
				>
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
				<Row
					gutter={[20, 20]}
					className="overview-summary-grid"
					aria-label="首页汇总数据，点击跳转库存列表"
					role="button"
					tabIndex={0}
					onClick={onOpenInventory}
					onKeyDown={handleSummaryKeyDown}
				>
					{loading
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

			<Row gutter={[20, 20]}>
				{optionStats.map((stat) => (
					<Col xs={12} sm={12} lg={6} key={stat.title}>
						<Card className="surface-card stat-card">
							<Statistic title={stat.title} value={stat.value} />
						</Card>
					</Col>
				))}
			</Row>

			<Card className="surface-card">
				<Space wrap size={12}>
					{optionTypeStats.map((entry) => (
						<Text key={entry.type}>
							{displayTypeName(entry.type)}：{entry.count}
						</Text>
					))}
				</Space>
			</Card>
		</div>
	);
}

export default OverviewPage;
