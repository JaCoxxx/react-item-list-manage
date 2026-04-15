import {
	AppstoreOutlined,
	InboxOutlined,
	MenuOutlined,
	ToolOutlined,
	UnorderedListOutlined,
} from "@ant-design/icons";
import {
	Alert,
	App as AntdApp,
	Button,
	Drawer,
	Grid,
	Layout,
	Space,
	Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { fetchJson } from "./lib/api";
import type { ApiResponse, BaseOptionGroups, InventoryItem } from "./lib/types";
import ItemMaintenancePage from "./pages/ItemMaintenancePage";
import OverviewPage from "./pages/OverviewPage";
import StockInPage from "./pages/StockInPage";
import ToolsPage from "./pages/ToolsPage";

const { Header, Content } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;
const APP_PATHS = ["/overview", "/stock-in", "/items", "/tools"] as const;

function getCurrentPath() {
	if (typeof window === "undefined") {
		return "/overview";
	}

	return window.location.pathname;
}

function App() {
	const { message } = AntdApp.useApp();
	const screens = useBreakpoint();
	const isMobile = !screens.md;
	const [refreshing, setRefreshing] = useState(false);
	const [coreLoading, setCoreLoading] = useState(true);
	const [coreError, setCoreError] = useState<string | null>(null);
	const [baseOptions, setBaseOptions] = useState<BaseOptionGroups>({});
	const [allItems, setAllItems] = useState<InventoryItem[]>([]);
	const [currentPath, setCurrentPath] = useState(getCurrentPath);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	const reloadCoreData = useCallback(
		async (showToast = false) => {
			setRefreshing(showToast);
			setCoreError(null);

			try {
				const [baseOptionsResponse, allItemsResponse] = await Promise.all([
					fetchJson<ApiResponse<BaseOptionGroups>>("/api/base-options"),
					fetchJson<ApiResponse<InventoryItem[]>>("/api/items?limit=200"),
				]);

				setBaseOptions(baseOptionsResponse.data);
				setAllItems(allItemsResponse.data);

				if (showToast) {
					message.success("基础数据已刷新");
				}

			} catch (requestError) {
				const nextError =
					requestError instanceof Error ? requestError.message : "加载基础数据失败";
				setCoreError(nextError);

				if (showToast) {
					message.error(nextError);
				}
			} finally {
				setCoreLoading(false);
				setRefreshing(false);
			}
		},
		[message]
	);

	useEffect(() => {
		void reloadCoreData(false);
	}, [reloadCoreData]);

	useEffect(() => {
		const handlePopState = () => {
			setCurrentPath(getCurrentPath());
		};

		window.addEventListener("popstate", handlePopState);

		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, []);

	const navItems = useMemo(
		() => [
			{
				key: "/overview",
				label: "库存总览",
				icon: <AppstoreOutlined />,
			},
			{
				key: "/stock-in",
				label: "新增库存",
				icon: <InboxOutlined />,
			},
			{
				key: "/items",
				label: "物品维护",
				icon: <UnorderedListOutlined />,
			},
			{
				key: "/tools",
				label: "工具页",
				icon: <ToolOutlined />,
			},
		],
		[]
	);
	const resolvedPath = APP_PATHS.includes(currentPath as (typeof APP_PATHS)[number])
		? currentPath
		: "/overview";
	const activeNavItem = navItems.find((item) => item.key === resolvedPath) ?? navItems[0];

	useEffect(() => {
		if (currentPath === resolvedPath) {
			return;
		}

		window.history.replaceState({}, "", resolvedPath);
		setCurrentPath(resolvedPath);
	}, [currentPath, resolvedPath]);

	const navigateTo = useCallback((nextPath: (typeof APP_PATHS)[number]) => {
		if (nextPath === currentPath) {
			setMobileMenuOpen(false);
			return;
		}

		window.history.pushState({}, "", nextPath);
		setCurrentPath(nextPath);
		setMobileMenuOpen(false);
	}, [currentPath]);

	const currentPage = useMemo(() => {
		switch (resolvedPath) {
			case "/stock-in":
				return (
					<StockInPage
						baseOptions={baseOptions}
						allItems={allItems}
						coreLoading={coreLoading}
						reloadCoreData={reloadCoreData}
					/>
				);
			case "/items":
				return (
					<ItemMaintenancePage
						baseOptions={baseOptions}
						allItems={allItems}
						coreLoading={coreLoading}
						reloadCoreData={reloadCoreData}
					/>
				);
			case "/tools":
				return (
					<ToolsPage
						baseOptions={baseOptions}
						allItems={allItems}
						refreshing={refreshing}
						reloadCoreData={reloadCoreData}
					/>
				);
			case "/overview":
			default:
				return (
					<OverviewPage
						baseOptions={baseOptions}
						coreLoading={coreLoading}
					/>
				);
		}
	}, [allItems, baseOptions, coreLoading, refreshing, reloadCoreData, resolvedPath]);

	return (
		<Layout className="app-layout">
			<Header className="app-header">
				<div className="app-shell">
					<div className={`app-header-top${isMobile ? " is-mobile" : ""}`}>
						<div className="app-header-copy">
							<Title level={3} className="app-title">
								{activeNavItem.label ?? "家庭物品清单"}
							</Title>
						</div>
						{isMobile ? (
							<div className="app-header-actions">
								<Button
									type="primary"
									icon={<MenuOutlined />}
									onClick={() => setMobileMenuOpen(true)}
								>
									菜单
								</Button>
							</div>
						) : null}
					</div>

					{isMobile ? null : (
						<Space wrap className="app-nav">
							{navItems.map((item) => (
								<Button
									key={item.key}
									type={resolvedPath === item.key ? "primary" : "default"}
									icon={item.icon}
									onClick={() => navigateTo(item.key as (typeof APP_PATHS)[number])}
								>
									{item.label}
								</Button>
							))}
						</Space>
					)}
				</div>
			</Header>

			<Content className="app-content">
				<div className="app-shell">
					{coreError ? (
						<Alert
							className="page-alert"
							type="error"
							showIcon
							message="基础数据加载失败"
							description={coreError}
						/>
					) : null}

					{currentPage}
				</div>
			</Content>

			<Drawer
				title="页面导航"
				placement="right"
				width={280}
				open={isMobile && mobileMenuOpen}
				onClose={() => setMobileMenuOpen(false)}
				className="app-mobile-drawer"
			>
				<Space direction="vertical" size={12} className="mobile-menu-stack">
					{navItems.map((item) => (
						<Button
							key={item.key}
							type={resolvedPath === item.key ? "primary" : "default"}
							icon={item.icon}
							className="mobile-menu-button"
							onClick={() => navigateTo(item.key as (typeof APP_PATHS)[number])}
						>
							{item.label}
						</Button>
					))}
				</Space>
			</Drawer>
		</Layout>
	);
}

export default App;
