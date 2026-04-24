/**
 * @Author zhiyuan.wu zhiyuan.wu@hand-china.com
 * @Date 2026-04-24 15:06:28
 * @LastEditTime 2026-04-24 15:06:30
 * @LastEditors zhiyuan.wu zhiyuan.wu@hand-china.com
 * @Description 
 */
import { AudioOutlined, DeleteOutlined, MessageOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Card, Checkbox, Divider, Input, InputNumber, Modal, Select, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, requestJson } from "../lib/api";
import type { AiProvider, ApiResponse, BaseOption, BaseOptionGroups, InventoryItem } from "../lib/types";

const { Text, Title } = Typography;

type ActionType = "stock_in" | "stock_out" | "create_item" | "unsupported";

type ParsedAction = {
	action: ActionType;
	confidence: number;
	reply: string;
	params: {
		itemName?: string;
		itemCode?: string;
		quantity?: number;
		reasonCode?: string;
		categoryCode?: string;
		unitCode?: string;
		locationCode?: string;
		note?: string;
	};
};

type QueuedAction = ParsedAction & {
	queueId: string;
	selected: boolean;
};

type ChatMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	text: string;
};

type SpeechRecognitionLike = {
	lang: string;
	interimResults: boolean;
	continuous: boolean;
	onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
	onerror: ((event: { error?: string }) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
};

type SpeechRecognitionCtorLike = new () => SpeechRecognitionLike;

function normalizeText(value: string) {
	return value.toLocaleLowerCase().replace(/[\s\-_/,，。.:：;；()（）【】[\]{}|]+/g, "");
}

function actionLabel(action: ActionType) {
	switch (action) {
		case "stock_in":
			return "入库";
		case "stock_out":
			return "出库";
		case "create_item":
			return "新增物品";
		default:
			return "不支持";
	}
}

function pickDefaultOptionCode(options: BaseOption[] | undefined) {
	if (!options || options.length === 0) {
		return undefined;
	}

	return options[0]?.code;
}

type ActionHint = "stock_in" | "stock_out" | "create_item";

const STOCK_IN_HINT_PATTERN = /(入库|买了|购买|购入|进货|补货|收了|到了|拿了|囤了)/;
const STOCK_OUT_HINT_PATTERN = /(出库|用了|用掉|消耗|耗了|卖了|卖出|领用|吃了|喝了|取用)/;
const CREATE_ITEM_HINT_PATTERN = /(新增物品|新增|添加物品|添加|新建物品|新建)/;
const NOISE_PREFIX_PATTERN = /^(今天|今日|刚刚|刚才|我|我们|家里|帮我|请|麻烦|然后|再|还有|并且|并|和)+/;

function detectActionHint(text: string): ActionHint | null {
	if (CREATE_ITEM_HINT_PATTERN.test(text)) {
		return "create_item";
	}
	if (STOCK_OUT_HINT_PATTERN.test(text)) {
		return "stock_out";
	}
	if (STOCK_IN_HINT_PATTERN.test(text)) {
		return "stock_in";
	}

	return null;
}

function stripNoisePrefix(text: string) {
	return text.replace(NOISE_PREFIX_PATTERN, "").trim();
}

function splitNaturalCommands(text: string) {
	const sourceLines = text
		.split(/\n+/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const commands: string[] = [];

	for (const sourceLine of sourceLines) {
		const parts = sourceLine
			.split(/[，,、；;。!！?？]+/)
			.map((part) => stripNoisePrefix(part))
			.filter((part) => part.length > 0);

		let lastHint: ActionHint | null = null;
		for (const part of parts) {
			const currentHint = detectActionHint(part);
			if (currentHint) {
				commands.push(part);
				lastHint = currentHint;
				continue;
			}

			if (lastHint === "stock_in") {
				commands.push(`买${part}`);
				continue;
			}
			if (lastHint === "stock_out") {
				commands.push(`用${part}`);
				continue;
			}
			if (lastHint === "create_item") {
				commands.push(`新增物品 ${part}`);
				continue;
			}

			commands.push(part);
		}
	}

	return commands;
}

type AiOpsChatPageProps = {
	aiProvider: AiProvider;
};

function AiOpsChatPage({ aiProvider }: AiOpsChatPageProps) {
	const { message } = AntdApp.useApp();
	const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
	const [textInput, setTextInput] = useState("");
	const [loadingParse, setLoadingParse] = useState(false);
	const [executing, setExecuting] = useState(false);
	const [listening, setListening] = useState(false);
	const [baseOptions, setBaseOptions] = useState<BaseOptionGroups>({});
	const [allItems, setAllItems] = useState<InventoryItem[]>([]);
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
		{
			id: crypto.randomUUID(),
			role: "assistant",
			text: "请输入或语音输入，例如：\"入库两包牛奶\"、\"出库苹果 3 个\"、\"新增物品 蓝莓\"。",
		},
	]);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [queuedActions, setQueuedActions] = useState<QueuedAction[]>([]);
	const [draftParamsMap, setDraftParamsMap] = useState<Record<string, ParsedAction["params"]>>({});

	const itemOptions = useMemo(
		() =>
			allItems.map((item) => ({
				label: `${item.name}${item.code ? ` (${item.code})` : ""}`,
				value: item.id,
			})),
		[allItems]
	);
	const reasonOptions = useMemo(
		() =>
			(baseOptions.outbound_reason ?? []).map((option) => ({
				label: `${option.name} (${option.code})`,
				value: option.code,
			})),
		[baseOptions]
	);
	const categoryOptions = useMemo(
		() =>
			(baseOptions.category ?? []).map((option) => ({
				label: `${option.name} (${option.code})`,
				value: option.code,
			})),
		[baseOptions]
	);
	const unitOptions = useMemo(
		() =>
			(baseOptions.unit ?? []).map((option) => ({
				label: `${option.name} (${option.code})`,
				value: option.code,
			})),
		[baseOptions]
	);
	const locationOptions = useMemo(
		() =>
			(baseOptions.location ?? []).map((option) => ({
				label: `${option.name} (${option.code})`,
				value: option.code,
			})),
		[baseOptions]
	);

	const loadReference = useCallback(async () => {
		const [itemsResponse, optionsResponse] = await Promise.all([
			fetchJson<ApiResponse<InventoryItem[]>>("/api/items?limit=200&isActive=true"),
			fetchJson<ApiResponse<BaseOptionGroups>>("/api/base-options"),
		]);
		setAllItems(itemsResponse.data);
		setBaseOptions(optionsResponse.data);
	}, []);

	useEffect(() => {
		void loadReference();
	}, [loadReference]);

	useEffect(() => {
		return () => {
			recognitionRef.current?.stop();
		};
	}, []);

	const appendChat = useCallback((role: ChatMessage["role"], text: string) => {
		setChatMessages((previous) => [
			...previous,
			{ id: crypto.randomUUID(), role, text },
		]);
	}, []);

	const findItemIdByNameOrCode = useCallback(
		(itemName?: string, itemCode?: string) => {
			const normalizedName = normalizeText(itemName ?? "");
			const normalizedCode = normalizeText(itemCode ?? "");
			if (!normalizedName && !normalizedCode) {
				return undefined;
			}

			const matched = allItems.find((item) => {
				const code = normalizeText(item.code ?? "");
				const name = normalizeText(item.name);
				if (normalizedCode && code && normalizedCode === code) {
					return true;
				}
				if (normalizedName && name === normalizedName) {
					return true;
				}
				if (normalizedName && name.includes(normalizedName)) {
					return true;
				}
				return false;
			});

			return matched?.id;
		},
		[allItems]
	);

	const parseCommand = useCallback(async () => {
		const text = textInput.trim();
		if (!text) {
			message.warning("请先输入指令");
			return;
		}

		appendChat("user", text);
		setLoadingParse(true);
		try {
			const lines = splitNaturalCommands(text);

			const nextQueued: QueuedAction[] = [];
			const nextParamsMap: Record<string, ParsedAction["params"]> = {};
			const replies: string[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				try {
					const response = await requestJson<ApiResponse<ParsedAction>>(
						"/api/ai/command/parse",
						{
							method: "POST",
							headers: {
								"content-type": "application/json",
							},
							body: JSON.stringify({ text: line, provider: aiProvider }),
						}
					);
					const queueId = crypto.randomUUID();
					nextQueued.push({
						...response.data,
						queueId,
						selected: true,
					});
					nextParamsMap[queueId] = response.data.params ?? {};
					replies.push(
						`[${i + 1}] ${response.data.reply}（${actionLabel(response.data.action)}，置信度 ${(response.data.confidence * 100).toFixed(0)}%）`
					);
				} catch (lineError) {
					const lineErrorMsg = lineError instanceof Error ? lineError.message : "解析失败";
					replies.push(`[${i + 1}] 解析失败：${lineErrorMsg}`);
				}
			}

			setQueuedActions((previous) => [...previous, ...nextQueued]);
			setDraftParamsMap((previous) => ({
				...previous,
				...nextParamsMap,
			}));
			appendChat("assistant", replies.join("\n"));
			setTextInput("");
		} catch (requestError) {
			const nextError =
				requestError instanceof Error ? requestError.message : "AI 解析失败";
			appendChat("system", nextError);
			message.error(nextError);
		} finally {
			setLoadingParse(false);
		}
	}, [aiProvider, appendChat, message, textInput]);

	// 删除队列中的操作
	const removeAction = useCallback((queueId: string) => {
		setQueuedActions((prev) => prev.filter((action) => action.queueId !== queueId));
		setDraftParamsMap((prev) => {
			const next = { ...prev };
			delete next[queueId];
			return next;
		});
	}, []);

	// 更新操作的参数
	const updateActionParams = useCallback(
		(queueId: string, params: ParsedAction["params"]) => {
			setDraftParamsMap((prev) => ({
				...prev,
				[queueId]: params,
			}));
		},
		[]
	);

	// 更新操作的选中状态
	const updateActionSelected = useCallback((queueId: string, selected: boolean) => {
		setQueuedActions((prev) =>
			prev.map((action) =>
				action.queueId === queueId ? { ...action, selected } : action
			)
		);
	}, []);

	// 获取所有需要执行的操作数量
	const selectedCount = useMemo(
		() =>
			queuedActions.filter(
				(action) => action.selected && action.action !== "unsupported"
			).length,
		[queuedActions]
	);

	const updateAllActionSelected = useCallback((selected: boolean) => {
		setQueuedActions((previous) =>
			previous.map((action) =>
				action.action === "unsupported" ? action : { ...action, selected }
			)
		);
	}, []);

	const executeQueuedAction = useCallback(
		async (action: QueuedAction, params: ParsedAction["params"]) => {
			if (action.action === "unsupported") {
				throw new Error("当前指令不支持执行");
			}

			if (action.action === "create_item") {
				const itemName = params.itemName?.trim();
				if (!itemName) {
					throw new Error("新增物品需要提供物品名");
				}

				const categoryCode = params.categoryCode ?? pickDefaultOptionCode(baseOptions.category);
				const unitCode = params.unitCode ?? pickDefaultOptionCode(baseOptions.unit);
				if (!categoryCode || !unitCode) {
					throw new Error("缺少分类或单位基础数据，无法新增物品");
				}

				await requestJson<ApiResponse<{ id: string }>>("/api/items", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						itemName,
						itemCode: params.itemCode,
						categoryCode,
						unitCode,
						defaultLocationCode: params.locationCode,
						note: params.note,
					}),
				});

				return `新增物品 ${itemName}`;
			}

			const quantity = params.quantity;
			if (!quantity || quantity <= 0) {
				throw new Error("请提供有效数量");
			}

			const itemId = findItemIdByNameOrCode(params.itemName, params.itemCode);
			if (!itemId) {
				throw new Error("未找到对应物品，请先新增物品或补充准确名称/编码");
			}

			if (action.action === "stock_in") {
				await requestJson("/api/stock/in", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						itemId,
						quantity,
						movementDate: new Date().toISOString().slice(0, 10),
						locationCode: params.locationCode,
						note: params.note,
					}),
				});

				return `入库 ${params.itemName ?? params.itemCode ?? "物品"} x ${quantity}`;
			}

			const reasonCode = params.reasonCode ?? pickDefaultOptionCode(baseOptions.outbound_reason);
			if (!reasonCode) {
				throw new Error("缺少出库原因，请先维护 outbound_reason 基础数据");
			}

			await requestJson("/api/stock/out", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					itemId,
					quantity,
					reasonCode,
					movementDate: new Date().toISOString().slice(0, 10),
					locationCode: params.locationCode,
					note: params.note,
				}),
			});

			return `出库 ${params.itemName ?? params.itemCode ?? "物品"} x ${quantity}`;
		},
		[
			baseOptions.category,
			baseOptions.outbound_reason,
			baseOptions.unit,
			findItemIdByNameOrCode,
		]
	);

	const executeBatchActions = useCallback(async () => {
		const actionsToRun = queuedActions.filter(
			(action) => action.selected && action.action !== "unsupported"
		);
		if (actionsToRun.length === 0) {
			message.warning("请至少选择一个可执行操作");
			return;
		}

		setExecuting(true);
		let successCount = 0;
		let failedCount = 0;

		try {
			for (let index = 0; index < actionsToRun.length; index += 1) {
				const action = actionsToRun[index];
				const params = draftParamsMap[action.queueId] ?? action.params ?? {};

				try {
					const resultText = await executeQueuedAction(action, params);
					appendChat("assistant", `✓ [${index + 1}] 已执行：${resultText}`);
					successCount += 1;
				} catch (requestError) {
					const nextError = requestError instanceof Error ? requestError.message : "执行失败";
					appendChat("system", `✗ [${index + 1}] ${nextError}`);
					failedCount += 1;
				}
			}

			if (successCount > 0) {
				await loadReference();
			}

			if (failedCount === 0) {
				message.success(`批量执行完成，共 ${successCount} 条成功`);
			} else if (successCount === 0) {
				message.error(`批量执行失败，共 ${failedCount} 条失败`);
			} else {
				message.warning(`批量执行完成，成功 ${successCount} 条，失败 ${failedCount} 条`);
			}

			setQueuedActions([]);
			setDraftParamsMap({});
		} finally {
			setConfirmOpen(false);
			setExecuting(false);
		}
	}, [appendChat, draftParamsMap, executeQueuedAction, loadReference, message, queuedActions]);

	const confirmSummary = useMemo(() => {
		const actionsToRun = queuedActions.filter(
			(action) => action.selected && action.action !== "unsupported"
		);
		if (actionsToRun.length === 0) {
			return "当前没有可执行的已选操作";
		}

		return actionsToRun
			.map((action, index) => {
				const params = draftParamsMap[action.queueId] ?? action.params ?? {};
				const lines = [`[${index + 1}] 操作：${actionLabel(action.action)}`];

				if (params.itemName) {
					lines.push(`物品名：${params.itemName}`);
				}
				if (params.itemCode) {
					lines.push(`物品编码：${params.itemCode}`);
				}
				if (typeof params.quantity === "number") {
					lines.push(`数量：${params.quantity}`);
				}
				if (params.reasonCode) {
					lines.push(`出库原因：${params.reasonCode}`);
				}
				if (params.categoryCode) {
					lines.push(`分类：${params.categoryCode}`);
				}
				if (params.unitCode) {
					lines.push(`单位：${params.unitCode}`);
				}
				if (params.locationCode) {
					lines.push(`位置：${params.locationCode}`);
				}
				if (params.note) {
					lines.push(`备注：${params.note}`);
				}

				return lines.join("\n");
			})
			.join("\n\n");
	}, [draftParamsMap, queuedActions]);

	const startVoiceInput = useCallback(() => {
		const anyWindow = window as unknown as {
			SpeechRecognition?: SpeechRecognitionCtorLike;
			webkitSpeechRecognition?: SpeechRecognitionCtorLike;
		};
		const Ctor = anyWindow.SpeechRecognition ?? anyWindow.webkitSpeechRecognition;
		if (!Ctor) {
			message.error("当前浏览器不支持语音识别");
			return;
		}

		const recognition = new Ctor();
		recognition.lang = "zh-CN";
		recognition.interimResults = false;
		recognition.continuous = false;
		recognition.onresult = (event) => {
			const transcript = Array.from(event.results)
				.slice(event.resultIndex)
				.map((result) => result[0].transcript)
				.join("")
				.trim();
			if (transcript) {
				setTextInput((previous) => (previous ? `${previous} ${transcript}` : transcript));
			}
		};
		recognition.onerror = () => {
			message.error("语音识别失败，请重试");
		};
		recognition.onend = () => {
			setListening(false);
			recognitionRef.current = null;
		};

		recognitionRef.current = recognition;
		recognition.start();
		setListening(true);
	}, [message]);

	const stopVoiceInput = useCallback(() => {
		recognitionRef.current?.stop();
		setListening(false);
	}, []);

	return (
		<div className="page-stack page-shell">
			<div className="page-title-row">
				<div className="page-title-copy">
					<div>
						<Title level={4} className="page-title">
							AI 对话操作
						</Title>
						<Text type="secondary" className="page-lead-text">
							支持文本或语音输入。AI 仅识别并执行三类操作：入库、出库、新增物品。
						</Text>
					</div>
				</div>
			</div>

			<Card className="surface-card">
				<Space direction="vertical" size={12} style={{ width: "100%" }}>
					<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
						<MessageOutlined />
						<Text strong>对话区</Text>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{chatMessages.map((msg) => (
							<div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
								<div
									style={{
										maxWidth: "86%",
										padding: "8px 12px",
										borderRadius: 10,
										background: msg.role === "user" ? "#111" : msg.role === "system" ? "#fff2f0" : "#f5f5f5",
										color: msg.role === "user" ? "#fff" : "#111",
										whiteSpace: "pre-wrap",
									}}
								>
									{msg.text}
								</div>
							</div>
						))}
					</div>
					<Input.TextArea
						value={textInput}
						autoSize={{ minRows: 2, maxRows: 5 }}
						placeholder="可输入口语句子或多行，例如：今天买了2箱牛奶，1袋盐，1袋鸡精，用了一瓶蚝油"
						onChange={(event) => setTextInput(event.target.value)}
						onPressEnter={(event) => {
							if (!event.shiftKey) {
								event.preventDefault();
								void parseCommand();
							}
						}}
					/>
					<Space wrap>
						<Button
							type="primary"
							icon={<SendOutlined />}
							loading={loadingParse}
							onClick={() => void parseCommand()}
						>
							发送并识别
						</Button>
						{listening ? (
							<Button icon={<StopOutlined />} onClick={stopVoiceInput}>
								停止语音
							</Button>
						) : (
							<Button icon={<AudioOutlined />} onClick={startVoiceInput}>
								语音输入
							</Button>
						)}
					</Space>
				</Space>
			</Card>

			{queuedActions.length > 0 ? (
				<Card className="surface-card" title="识别结果与批量执行">
					<Space direction="vertical" size={12} style={{ width: "100%" }}>
						<Space wrap>
							<Button onClick={() => updateAllActionSelected(true)}>全选</Button>
							<Button onClick={() => updateAllActionSelected(false)}>取消全选</Button>
							<Button
								type="primary"
								disabled={selectedCount === 0}
								loading={executing}
								onClick={() => setConfirmOpen(true)}
							>
								执行选中的 {selectedCount} 个操作
							</Button>
						</Space>
						<Divider style={{ margin: 0 }} />
						{queuedActions.map((action, index) => {
							const params = draftParamsMap[action.queueId] ?? action.params ?? {};
							return (
								<Card
									key={action.queueId}
									type="inner"
									title={`操作 ${index + 1}`}
									extra={
										<Button
											type="text"
											icon={<DeleteOutlined />}
											onClick={() => removeAction(action.queueId)}
										/>
									}
								>
									<Space direction="vertical" size={12} style={{ width: "100%" }}>
										<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
											<Checkbox
												checked={action.selected}
												disabled={action.action === "unsupported"}
												onChange={(event) =>
													updateActionSelected(action.queueId, event.target.checked)
												}
											>
												选择执行
											</Checkbox>
											<Tag color={action.action === "unsupported" ? "default" : "blue"}>
												{actionLabel(action.action)}
											</Tag>
											<Text type="secondary">置信度 {(action.confidence * 100).toFixed(0)}%</Text>
										</div>

										{action.action === "unsupported" ? (
											<Alert
												type="warning"
												showIcon
												message="该指令不在支持范围内"
												description="目前只支持入库、出库、新增物品。"
											/>
										) : null}

										<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
											<Input
												placeholder="物品名"
												value={params.itemName}
												onChange={(event) =>
													updateActionParams(action.queueId, {
														...params,
														itemName: event.target.value,
													})
												}
											/>
											<Input
												placeholder="物品编码（可选）"
												value={params.itemCode}
												onChange={(event) =>
													updateActionParams(action.queueId, {
														...params,
														itemCode: event.target.value,
													})
												}
											/>
											<InputNumber
												style={{ width: "100%" }}
												min={0.001}
												step={1}
												placeholder="数量"
												value={params.quantity}
												onChange={(value) =>
													updateActionParams(action.queueId, {
														...params,
														quantity: typeof value === "number" ? value : undefined,
													})
												}
											/>
											<Select
												allowClear
												placeholder="出库原因"
												options={reasonOptions}
												value={params.reasonCode}
												onChange={(value) =>
													updateActionParams(action.queueId, {
														...params,
														reasonCode: value,
													})
												}
											/>
											<Select
												allowClear
												placeholder="分类（新增物品时）"
												options={categoryOptions}
												value={params.categoryCode}
												onChange={(value) =>
													updateActionParams(action.queueId, {
														...params,
														categoryCode: value,
													})
												}
											/>
											<Select
												allowClear
												placeholder="单位（新增物品时）"
												options={unitOptions}
												value={params.unitCode}
												onChange={(value) =>
													updateActionParams(action.queueId, {
														...params,
														unitCode: value,
													})
												}
											/>
											<Select
												allowClear
												placeholder="位置（可选）"
												options={locationOptions}
												value={params.locationCode}
												onChange={(value) =>
													updateActionParams(action.queueId, {
														...params,
														locationCode: value,
													})
												}
											/>
										</div>

										<Input.TextArea
											autoSize={{ minRows: 2, maxRows: 4 }}
											placeholder="备注（可选）"
											value={params.note}
											onChange={(event) =>
												updateActionParams(action.queueId, {
													...params,
													note: event.target.value,
												})
											}
										/>
									</Space>
								</Card>
							);
						})}
						<Text type="secondary">提示：执行前可逐条修正 AI 识别出的参数，并选择要执行的操作。</Text>
						<Text type="secondary">当前可用物品数：{itemOptions.length}</Text>
					</Space>
				</Card>
			) : null}

			<Modal
				open={confirmOpen}
				title="批量执行确认"
				okText="确认执行"
				cancelText="取消"
				onOk={() => void executeBatchActions()}
				onCancel={() => {
					if (!executing) {
						setConfirmOpen(false);
					}
				}}
				confirmLoading={executing}
				maskClosable={!executing}
			>
				<Text>请确认以下执行内容：</Text>
				<Input.TextArea value={confirmSummary} autoSize={{ minRows: 6, maxRows: 10 }} readOnly style={{ marginTop: 10 }} />
			</Modal>
		</div>
	);
}

export default AiOpsChatPage;