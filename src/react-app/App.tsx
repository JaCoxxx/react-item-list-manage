import {
	AppstoreOutlined,
	CameraOutlined,
	DatabaseOutlined,
	InboxOutlined,
	MenuOutlined,
	RocketOutlined,
	TagsOutlined,
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
	Menu,
	Space,
	Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { fetchJson } from "./lib/api";
import type { ApiResponse, BaseOptionGroups, InventoryItem } from "./lib/types";
import BaseOptionsPage from "./pages/BaseOptionsPage";
import InventoryPage from "./pages/InventoryPage";
import ItemMaintenancePage from "./pages/ItemMaintenancePage";
import OcrUploadPage from "./pages/OcrUploadPage";
import OverviewPage from "./pages/OverviewPage";
import QuickStockPage from "./pages/QuickStockPage";
import TagMaintenancePage from "./pages/TagMaintenancePage";
import ToolsPage from "./pages/ToolsPage";

const { Header, Content } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;
const APP_PATHS = ["/overview", "/inventory", "/quick-stock", "/items", "/tags", "/base-options", "/ocr-upload", "/tools"] as const;

function getCurrentPath() {
	if (typeof window === "undefined") {
		return "/overview";
	}

	return window.location.pathname === "/stock-in"
		? "/inventory"
		: window.location.pathname;
}

function App() {
	const { message } = AntdApp.useApp();
	const screens = useBreakpoint();
	const isMobile = !screens.md;
	const [refreshing, setRefreshing] = useState(false);
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
				label: "首页统计",
				icon: <AppstoreOutlined />,
			},
			{
				key: "/inventory",
				label: "库存列表",
				icon: <InboxOutlined />,
			},
			{
				key: "/quick-stock",
				label: "快速操作",
				icon: <RocketOutlined />,
			},
			{
				key: "/items",
				label: "物品列表",
				icon: <UnorderedListOutlined />,
			},
			{
				key: "/tags",
				label: "标签维护",
				icon: <TagsOutlined />,
			},
			{
				key: "/base-options",
				label: "基础数据",
				icon: <DatabaseOutlined />,
			},
			{
				key: "/ocr-upload",
				label: "OCR上传",
				icon: <CameraOutlined />,
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
	const handleDesktopMenuClick = useCallback((menuKey: string) => {
		if (!APP_PATHS.includes(menuKey as (typeof APP_PATHS)[number])) {
			return;
		}

		navigateTo(menuKey as (typeof APP_PATHS)[number]);
	}, [navigateTo]);

	const currentPage = useMemo(() => {
		switch (resolvedPath) {
			case "/inventory":
				return (
					<InventoryPage
						baseOptions={baseOptions}
					/>
				);
			case "/items":
				return (
					<ItemMaintenancePage
						baseOptions={baseOptions}
						reloadCoreData={reloadCoreData}
					/>
				);
			case "/quick-stock":
				return (
					<QuickStockPage
						baseOptions={baseOptions}
						reloadCoreData={reloadCoreData}
					/>
				);
			case "/base-options":
				return (
					<BaseOptionsPage
						baseOptions={baseOptions}
						reloadCoreData={reloadCoreData}
					/>
				);
			case "/tags":
				return <TagMaintenancePage reloadCoreData={reloadCoreData} />;
			case "/tools":
				return (
					<ToolsPage
						baseOptions={baseOptions}
						allItems={allItems}
						refreshing={refreshing}
						reloadCoreData={reloadCoreData}
					/>
				);
			case "/ocr-upload":
				return <OcrUploadPage />;
			case "/overview":
			default:
				return (
					<OverviewPage
						baseOptions={baseOptions}
						onOpenInventory={() => navigateTo("/inventory")}
						onOpenOcrUpload={() => navigateTo("/ocr-upload")}
					/>
				);
		}
	}, [allItems, baseOptions, navigateTo, refreshing, reloadCoreData, resolvedPath]);

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
						) : (
							<Menu
								mode="horizontal"
								className="app-nav-menu"
								items={navItems}
								selectedKeys={[resolvedPath]}
								onClick={({ key }) => handleDesktopMenuClick(key)}
							/>
						)}
					</div>
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
				size={280}
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
