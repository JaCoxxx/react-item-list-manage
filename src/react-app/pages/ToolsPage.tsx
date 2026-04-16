import { ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Col, Row, Space, Statistic, Typography } from "antd";
import type { BaseOptionGroups, InventoryItem } from "../lib/types";

const { Text } = Typography;

type ToolsPageProps = {
	baseOptions: BaseOptionGroups;
	allItems: InventoryItem[];
	refreshing: boolean;
	reloadCoreData: (showToast?: boolean) => Promise<void>;
};

function ToolsPage({
	baseOptions,
	allItems,
	refreshing,
	reloadCoreData,
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
