import {
	AppstoreOutlined,
	CameraOutlined,
	DatabaseOutlined,
	InboxOutlined,
	MessageOutlined,
	MenuOutlined,
	RobotOutlined,
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
import type {
	AiProvider,
	ApiResponse,
	BaseOptionGroups,
	InventoryItem,
	PageLayoutMode,
} from "./lib/types";
import BaseOptionsPage from "./pages/BaseOptionsPage";
import InventoryPage from "./pages/InventoryPage";
import ItemMaintenancePage from "./pages/ItemMaintenancePage";
import AiReceiptPage from "./pages/AiReceiptPage";
import AiOpsChatPage from "./pages/AiOpsChatPage";
import OcrUploadPage from "./pages/OcrUploadPage";
import OverviewPage from "./pages/OverviewPage";
import QuickStockPage from "./pages/QuickStockPage";
import TagMaintenancePage from "./pages/TagMaintenancePage";
import ToolsPage from "./pages/ToolsPage";

const { Header, Content } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;
const APP_PATHS = ["/overview", "/inventory", "/quick-stock", "/items", "/tags", "/base-options", "/ocr-upload", "/ai-receipt", "/ai-chat-ops", "/tools"] as const;
const PAGE_LAYOUT_STORAGE_KEY = "item-list-page-layout-mode";
const DEFAULT_PAGE_LAYOUT_MODE: PageLayoutMode = "row";
const AI_PROVIDER_STORAGE_KEY = "item-list-ai-provider";
const DEFAULT_AI_PROVIDER: AiProvider = "gpt";

function parsePageLayoutMode(value: string | null): PageLayoutMode {
	if (value === "two-column" || value === "three-column" || value === "row") {
		return value;
	}

	return DEFAULT_PAGE_LAYOUT_MODE;
}

function getCurrentPath() {
	if (typeof window === "undefined") {
		return "/overview";
	}

	return window.location.pathname === "/stock-in"
		? "/inventory"
		: window.location.pathname;
}

function getInitialPageLayoutMode() {
	if (typeof window === "undefined") {
		return DEFAULT_PAGE_LAYOUT_MODE;
	}

	return parsePageLayoutMode(window.localStorage.getItem(PAGE_LAYOUT_STORAGE_KEY));
}

function parseAiProvider(value: string | null): AiProvider {
	if (value === "deepseek" || value === "gpt") {
		return value;
	}

	return DEFAULT_AI_PROVIDER;
}

function getInitialAiProvider() {
	if (typeof window === "undefined") {
		return DEFAULT_AI_PROVIDER;
	}

	return parseAiProvider(window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY));
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
	const [pageLayoutMode, setPageLayoutMode] = useState<PageLayoutMode>(
		getInitialPageLayoutMode
	);
	const [aiProvider, setAiProvider] = useState<AiProvider>(getInitialAiProvider);

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
				key: "/ai-receipt",
				label: "AI小票",
				icon: <RobotOutlined />,
			},
			{
				key: "/ai-chat-ops",
				label: "对话操作",
				icon: <MessageOutlined />,
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
	useEffect(() => {
		window.localStorage.setItem(PAGE_LAYOUT_STORAGE_KEY, pageLayoutMode);
	}, [pageLayoutMode]);
	useEffect(() => {
		window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, aiProvider);
	}, [aiProvider]);

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
	const handlePageLayoutModeChange = useCallback((nextMode: PageLayoutMode) => {
		setPageLayoutMode(nextMode);
	}, []);
	const handleAiProviderChange = useCallback((nextProvider: AiProvider) => {
		setAiProvider(nextProvider);
	}, []);

	const currentPage = useMemo(() => {
		switch (resolvedPath) {
			case "/inventory":
				return (
					<InventoryPage
						baseOptions={baseOptions}
						pageLayoutMode={pageLayoutMode}
					/>
				);
			case "/items":
				return (
					<ItemMaintenancePage
						baseOptions={baseOptions}
						reloadCoreData={reloadCoreData}
						pageLayoutMode={pageLayoutMode}
					/>
				);
			case "/quick-stock":
				return (
					<QuickStockPage
						baseOptions={baseOptions}
						reloadCoreData={reloadCoreData}
						pageLayoutMode={pageLayoutMode}
					/>
				);
			case "/base-options":
				return (
					<BaseOptionsPage
						baseOptions={baseOptions}
						reloadCoreData={reloadCoreData}
						pageLayoutMode={pageLayoutMode}
					/>
				);
			case "/tags":
				return (
					<TagMaintenancePage
						reloadCoreData={reloadCoreData}
						pageLayoutMode={pageLayoutMode}
					/>
				);
			case "/tools":
				return (
					<ToolsPage
						baseOptions={baseOptions}
						allItems={allItems}
						refreshing={refreshing}
						reloadCoreData={reloadCoreData}
						pageLayoutMode={pageLayoutMode}
						onPageLayoutModeChange={handlePageLayoutModeChange}
						aiProvider={aiProvider}
						onAiProviderChange={handleAiProviderChange}
					/>
				);
			case "/ocr-upload":
				return <OcrUploadPage />;
			case "/ai-receipt":
				return <AiReceiptPage aiProvider={aiProvider} />;
			case "/ai-chat-ops":
				return <AiOpsChatPage aiProvider={aiProvider} />;
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
	}, [
		allItems,
		aiProvider,
		baseOptions,
		handleAiProviderChange,
		handlePageLayoutModeChange,
		navigateTo,
		pageLayoutMode,
		refreshing,
		reloadCoreData,
		resolvedPath,
	]);

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
