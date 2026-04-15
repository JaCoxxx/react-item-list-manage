import { ReloadOutlined, ToolOutlined } from "@ant-design/icons";
import { Button, Card, Col, Row, Space, Typography } from "antd";
import type { BaseOptionGroups, InventoryItem } from "../lib/types";

const { Title, Text } = Typography;

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
				<div>
					<Title level={4} className="page-title">
						工具页
					</Title>
					<Text type="secondary">
						集中放置全局操作，避免把常用页面的顶部挤满按钮。
					</Text>
				</div>
			</div>

			<Row gutter={[20, 20]}>
				<Col xs={24} xl={16} className="page-main-col">
					<Card
						title="数据工具"
						className="surface-card form-card"
						extra={<ToolOutlined />}
					>
						<Space direction="vertical" size={18} className="status-stack">
							<Text>
								刷新会重新拉取基础数据和物品列表，适合在新增、编辑后手动同步全局数据。
							</Text>
							<Button
								type="primary"
								icon={<ReloadOutlined />}
								loading={refreshing}
								className="tools-primary-button"
								onClick={() => void reloadCoreData(true)}
							>
								刷新基础数据
							</Button>
						</Space>
					</Card>
				</Col>

				<Col xs={24} xl={8} className="page-side-col">
					<Space direction="vertical" size={16} className="side-stack">
						<Card title="当前数据概况" className="surface-card side-card">
							<Space direction="vertical" size={12} className="status-stack">
								<div>
									<Text type="secondary">基础数据项</Text>
									<div>
										<Text strong>{baseOptionCount}</Text>
									</div>
								</div>
								<div>
									<Text type="secondary">物品档案数</Text>
									<div>
										<Text strong>{allItems.length}</Text>
									</div>
								</div>
							</Space>
						</Card>
					</Space>
				</Col>
			</Row>
		</div>
	);
}

export default ToolsPage;
