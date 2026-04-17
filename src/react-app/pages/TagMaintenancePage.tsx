import {
	App as AntdApp,
	Button,
	Card,
	Drawer,
	Form,
	Grid,
	Input,
	List,
	Popconfirm,
	Space,
	Table,
	Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, requestJson } from "../lib/api";
import type { ApiResponse, ItemTagSummary } from "../lib/types";

const { Text } = Typography;

type TagMaintenancePageProps = {
	reloadCoreData: (showToast?: boolean) => Promise<void>;
};

type RenameTagFormValues = {
	newTagName: string;
};

type CreateTagFormValues = {
	tagName: string;
};

function TagMaintenancePage({ reloadCoreData }: TagMaintenancePageProps) {
	const { message } = AntdApp.useApp();
	const screens = Grid.useBreakpoint();
	const isMobile = !screens.md;
	const [renameForm] = Form.useForm<RenameTagFormValues>();
	const [createForm] = Form.useForm<CreateTagFormValues>();
	const [tags, setTags] = useState<ItemTagSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [appliedSearch, setAppliedSearch] = useState("");
	const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
	const [renameDrawerOpen, setRenameDrawerOpen] = useState(false);
	const [editingTagName, setEditingTagName] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [actionKey, setActionKey] = useState<string | null>(null);

	const loadTags = useCallback(
		async (showToast = false) => {
			setLoading(true);
			try {
				const query = new URLSearchParams();
				query.set("limit", "300");
				if (appliedSearch) {
					query.set("search", appliedSearch);
				}
				const response = await fetchJson<ApiResponse<ItemTagSummary[]>>(
					`/api/tags?${query.toString()}`
				);
				setTags(response.data);
				if (showToast) {
					message.success("标签已刷新");
				}
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "加载标签失败"
				);
			} finally {
				setLoading(false);
			}
		},
		[appliedSearch, message]
	);

	useEffect(() => {
		void loadTags();
	}, [loadTags]);

	const openCreateDrawer = useCallback(() => {
		createForm.resetFields();
		setCreateDrawerOpen(true);
	}, [createForm]);

	const closeCreateDrawer = useCallback(() => {
		setCreateDrawerOpen(false);
	}, []);

	const submitCreate = useCallback(
		async (values: CreateTagFormValues) => {
			setCreating(true);
			try {
				await requestJson<ApiResponse<{ tagName: string; created: boolean }>>("/api/tags", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						tagName: values.tagName.trim(),
					}),
				});
				message.success("标签已新增");
				closeCreateDrawer();
				await Promise.all([loadTags(), reloadCoreData(false)]);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "新增标签失败"
				);
			} finally {
				setCreating(false);
			}
		},
		[closeCreateDrawer, loadTags, message, reloadCoreData]
	);

	const openRenameDrawer = useCallback(
		(tag: ItemTagSummary) => {
			setEditingTagName(tag.tagName);
			renameForm.resetFields();
			renameForm.setFieldsValue({
				newTagName: tag.tagName,
			});
			setRenameDrawerOpen(true);
		},
		[renameForm]
	);

	const closeRenameDrawer = useCallback(() => {
		setRenameDrawerOpen(false);
		setEditingTagName(null);
	}, []);

	const deleteTag = useCallback(
		async (tag: ItemTagSummary) => {
			const nextActionKey = `${tag.tagName}:delete`;
			setActionKey(nextActionKey);
			try {
				await requestJson<ApiResponse<{ tagName: string; deleted: boolean }>>(
					`/api/tags/${encodeURIComponent(tag.tagName)}`,
					{
						method: "DELETE",
					}
				);
				message.success("标签已删除");
				if (editingTagName === tag.tagName) {
					closeRenameDrawer();
				}
				await Promise.all([loadTags(), reloadCoreData(false)]);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "删除标签失败"
				);
			} finally {
				setActionKey(null);
			}
		},
		[closeRenameDrawer, editingTagName, loadTags, message, reloadCoreData]
	);

	const submitRename = useCallback(
		async (values: RenameTagFormValues) => {
			if (!editingTagName) {
				return;
			}

			setSubmitting(true);
			try {
				await requestJson<ApiResponse<{ tagName: string; updated: boolean }>>(
					`/api/tags/${encodeURIComponent(editingTagName)}`,
					{
						method: "PATCH",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							newTagName: values.newTagName.trim(),
						}),
					}
				);
				message.success("标签已更新");
				closeRenameDrawer();
				await Promise.all([loadTags(), reloadCoreData(false)]);
			} catch (requestError) {
				message.error(
					requestError instanceof Error ? requestError.message : "更新标签失败"
				);
			} finally {
				setSubmitting(false);
			}
		},
		[closeRenameDrawer, editingTagName, loadTags, message, reloadCoreData]
	);

	const rowActions = useCallback(
		(tag: ItemTagSummary) => (
			<Space wrap>
				<Button
					size="small"
					onClick={(event) => {
						event.stopPropagation();
						openRenameDrawer(tag);
					}}
				>
					重命名
				</Button>
				<Popconfirm
					title="确认删除该标签？"
					description="删除后会从所有物品中移除该标签。"
					okText="删除"
					cancelText="取消"
					onConfirm={() => void deleteTag(tag)}
				>
					<Button
						size="small"
						danger
						loading={actionKey === `${tag.tagName}:delete`}
						onClick={(event) => event.stopPropagation()}
					>
						删除
					</Button>
				</Popconfirm>
			</Space>
		),
		[actionKey, deleteTag, openRenameDrawer]
	);

	const columns: TableColumnsType<ItemTagSummary> = useMemo(
		() => [
			{
				title: "标签",
				dataIndex: "tagName",
				key: "tagName",
			},
			{
				title: "关联物品数",
				dataIndex: "itemCount",
				key: "itemCount",
				align: "right",
			},
			{
				title: "操作",
				key: "actions",
				width: 220,
				render: (_, tag) => rowActions(tag),
			},
		],
		[rowActions]
	);

	return (
		<div className="page-stack page-shell">
			<div className="tag-maint-toolbar">
				<Input
					allowClear
					placeholder="搜索标签"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					onPressEnter={() => setAppliedSearch(search.trim())}
					className="tag-maint-search"
				/>
				<Space className="tag-maint-actions">
					<Button onClick={() => setAppliedSearch(search.trim())}>查询</Button>
					<Button
						onClick={() => {
							setSearch("");
							setAppliedSearch("");
						}}
					>
						重置
					</Button>
					<Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
						新增标签
					</Button>
					<Button className="page-action-button" onClick={() => void loadTags(true)}>
						刷新列表
					</Button>
				</Space>
			</div>

			<Card className="surface-card">
				{isMobile ? (
					<List
						className="base-option-mobile-list"
						loading={loading}
						dataSource={tags}
						locale={{ emptyText: "暂无标签" }}
						renderItem={(tag) => (
							<List.Item className="base-option-mobile-item">
								<div className="base-option-mobile-main">
									<Text strong>{tag.tagName}</Text>
									<Text type="secondary">关联物品：{tag.itemCount}</Text>
								</div>
								<div className="base-option-mobile-actions">{rowActions(tag)}</div>
							</List.Item>
						)}
					/>
				) : (
					<Table<ItemTagSummary>
						rowKey="tagName"
						loading={loading}
						columns={columns}
						dataSource={tags}
						pagination={{ pageSize: 12, showSizeChanger: false }}
						scroll={{ x: 800 }}
						className="item-list-table"
					/>
				)}
			</Card>

			<Drawer
				title="新增标签"
				placement="right"
				size={isMobile ? "100%" : 420}
				open={createDrawerOpen}
				onClose={closeCreateDrawer}
				className="item-form-drawer"
			>
				<Form<CreateTagFormValues>
					form={createForm}
					layout="vertical"
					onFinish={(values) => void submitCreate(values)}
				>
					<Form.Item
						label="标签名"
						name="tagName"
						rules={[{ required: true, message: "请输入标签名" }]}
					>
						<Input placeholder="例如 调料、应急、早餐" />
					</Form.Item>
					<div className="stock-drawer-actions">
						<Button onClick={closeCreateDrawer}>取消</Button>
						<Button type="primary" htmlType="submit" loading={creating}>
							创建
						</Button>
					</div>
				</Form>
			</Drawer>

			<Drawer
				title="重命名标签"
				placement="right"
				size={isMobile ? "100%" : 420}
				open={renameDrawerOpen}
				onClose={closeRenameDrawer}
				className="item-form-drawer"
			>
				<Form<RenameTagFormValues>
					form={renameForm}
					layout="vertical"
					onFinish={(values) => void submitRename(values)}
				>
					<Form.Item label="当前标签">
						<Input value={editingTagName ?? ""} disabled />
					</Form.Item>
					<Form.Item
						label="新标签名"
						name="newTagName"
						rules={[{ required: true, message: "请输入新标签名" }]}
					>
						<Input placeholder="请输入新标签名" />
					</Form.Item>
					<div className="stock-drawer-actions">
						<Button onClick={closeRenameDrawer}>取消</Button>
						<Button type="primary" htmlType="submit" loading={submitting}>
							保存
						</Button>
					</div>
				</Form>
			</Drawer>
		</div>
	);
}

export default TagMaintenancePage;
