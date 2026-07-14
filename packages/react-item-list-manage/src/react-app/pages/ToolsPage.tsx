import { ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Col, Radio, Row, Space, Statistic, Typography } from "antd";
import type {
	AiProvider,
	BaseOptionGroups,
	InventoryItem,
	PageLayoutMode,
} from "../lib/types";

const { Text } = Typography;

type ToolsPageProps = {
	baseOptions: BaseOptionGroups;
	allItems: InventoryItem[];
	refreshing: boolean;
	reloadCoreData: (showToast?: boolean) => Promise<void>;
	pageLayoutMode: PageLayoutMode;
	onPageLayoutModeChange: (mode: PageLayoutMode) => void;
	aiProvider: AiProvider;
	onAiProviderChange: (provider: AiProvider) => void;
};

function ToolsPage({
	baseOptions,
	allItems,
	refreshing,
	reloadCoreData,
	pageLayoutMode,
	onPageLayoutModeChange,
	aiProvider,
	onAiProviderChange,
}: ToolsPageProps) {
	const baseOptionCount = Object.values(baseOptions).reduce(
		(total, options) => total + options.length,
		0,
	);

	return (
		<div className="page-stack page-shell">
			<div className="page-title-row">
				<Space className="page-header-actions">
					<Button
						type="primary"
						icon={<ReloadOutlined />}
						loading={refreshing}
						className="page-action-button"
						onClick={() => void reloadCoreData(true)}
					>
						刷新基础数据
					</Button>
				</Space>
			</div>

			<Card title="数据工具" className="surface-card">
				<Text>
					刷新会重新拉取基础数据和物品列表，适合在新增、编辑后手动同步全局数据。
				</Text>
			</Card>

			<Card title="页面布局" className="surface-card">
				<Space direction="vertical" size={12}>
					<Radio.Group
						optionType="button"
						buttonStyle="solid"
						value={pageLayoutMode}
						options={[
							{ label: "行排列", value: "row" },
							{ label: "双列排列", value: "two-column" },
							{ label: "三列排列", value: "three-column" },
						]}
						onChange={(event) =>
							onPageLayoutModeChange(event.target.value as PageLayoutMode)
						}
					/>
					<Text type="secondary">设置会同步到各页面的列表区域，并保存在当前浏览器。</Text>
				</Space>
			</Card>

			<Card title="AI 提供商" className="surface-card">
				<Space direction="vertical" size={12}>
					<Radio.Group
						optionType="button"
						buttonStyle="solid"
						value={aiProvider}
						options={[
							{ label: "GPT", value: "gpt" },
							{ label: "DeepSeek", value: "deepseek" },
						]}
						onChange={(event) =>
							onAiProviderChange(event.target.value as AiProvider)
						}
					/>
					<Text type="secondary">AI 小票与对话操作会使用当前选择的提供商。</Text>
				</Space>
			</Card>

			<Card title="当前数据概况" className="surface-card">
				<Row gutter={[16, 16]}>
					<Col xs={12}>
						<Statistic title="基础数据项" value={baseOptionCount} />
					</Col>
					<Col xs={12}>
						<Statistic title="物品档案数" value={allItems.length} />
					</Col>
				</Row>
			</Card>
		</div>
	);
}

export default ToolsPage;
