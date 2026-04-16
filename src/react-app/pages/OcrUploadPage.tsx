import { CameraOutlined, ScanOutlined, UploadOutlined } from "@ant-design/icons";
import {
	Alert,
	App as AntdApp,
	Button,
	Card,
	Checkbox,
	Grid,
	Input,
	Select,
	Space,
	Typography,
} from "antd";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, requestJson } from "../lib/api";
import type {
	ApiResponse,
	BaseOption,
	BaseOptionGroups,
	InventoryItem,
	OcrFieldLine,
	OcrItemLine,
	OcrReceiptResult,
} from "../lib/types";

const { useBreakpoint } = Grid;
const { Text, Title } = Typography;
const RECEIPT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type EditableOcrItemLine = OcrItemLine & {
	selected: boolean;
	matchedItemId: string | null;
	importStatus?: "success" | "failed" | "skipped";
	importMessage?: string;
};

function formatFileSize(size: number) {
	if (size < 1024) {
		return `${size} B`;
	}

	if (size < 1024 * 1024) {
		return `${(size / 1024).toFixed(1)} KB`;
	}

	return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function normalizeMatchText(value: string) {
	return value.toLocaleLowerCase().replace(/[\s\-_/,，。.:：;；()（）【】[\]{}|]+/g, "");
}

function matchInventoryItemId(product: string, allItems: InventoryItem[]) {
	const normalizedProduct = normalizeMatchText(product);
	if (!normalizedProduct) {
		return null;
	}

	let bestScore = -1;
	let matchedItemId: string | null = null;

	for (const item of allItems) {
		const normalizedName = normalizeMatchText(item.name);
		const normalizedCode = normalizeMatchText(item.code ?? "");
		let score = 0;

		if (normalizedCode && normalizedProduct === normalizedCode) {
			score = 1000;
		} else if (normalizedName && normalizedProduct === normalizedName) {
			score = 900;
		} else if (normalizedCode && normalizedProduct.includes(normalizedCode)) {
			score = 800 + normalizedCode.length;
		} else if (normalizedName && normalizedProduct.includes(normalizedName)) {
			score = 700 + normalizedName.length;
		} else if (normalizedName && normalizedName.includes(normalizedProduct)) {
			score = 600 + normalizedProduct.length;
		}

		if (score > bestScore) {
			bestScore = score;
			matchedItemId = item.id;
		}
	}

	return bestScore >= 600 ? matchedItemId : null;
}

function parsePositiveQuantity(value: string) {
	const normalized = value.replace(/,/g, "").trim();
	if (normalized.length === 0) {
		return null;
	}

	const parsed = Number(normalized);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}

	return Number.parseFloat(parsed.toFixed(3));
}

function parseOptionalNonNegativeNumber(value: string) {
	const normalized = value.replace(/,/g, "").trim();
	if (normalized.length === 0) {
		return null;
	}

	const parsed = Number(normalized);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}

	return Number.parseFloat(parsed.toFixed(3));
}

function resolveReceiptDate(fieldLines: OcrFieldLine[]) {
	const dateValue =
		fieldLines.find((line) => line.key === "consumption_date")?.value.trim() ??
		fieldLines.find((line) => line.key === "print_date")?.value.trim() ??
		"";

	if (RECEIPT_DATE_PATTERN.test(dateValue)) {
		return dateValue;
	}

	return new Date().toISOString().slice(0, 10);
}

function pickDefaultOptionCode(options: BaseOption[] | undefined, current?: string) {
	if (!options || options.length === 0) {
		return undefined;
	}

	if (current && options.some((option) => option.code === current)) {
		return current;
	}

	return options[0]?.code;
}

function toEditableItemLines(lines: OcrItemLine[], allItems: InventoryItem[]) {
	return lines.map((line) => ({
		...line,
		selected: false,
		matchedItemId: matchInventoryItemId(line.product, allItems),
	}));
}

function OcrUploadPage() {
	const { message } = AntdApp.useApp();
	const screens = useBreakpoint();
	const isMobile = !screens.md;
	const cameraInputRef = useRef<HTMLInputElement | null>(null);
	const albumInputRef = useRef<HTMLInputElement | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [recognizing, setRecognizing] = useState(false);
	const [importingStock, setImportingStock] = useState(false);
	const [referenceLoading, setReferenceLoading] = useState(false);
	const [baseOptions, setBaseOptions] = useState<BaseOptionGroups>({});
	const [allItems, setAllItems] = useState<InventoryItem[]>([]);
	const [defaultCategoryCode, setDefaultCategoryCode] = useState<string | undefined>(
		undefined
	);
	const [defaultUnitCode, setDefaultUnitCode] = useState<string | undefined>(undefined);
	const [defaultLocationCode, setDefaultLocationCode] = useState<string | undefined>(
		undefined
	);
	const [ocrResult, setOcrResult] = useState<OcrReceiptResult | null>(null);
	const [ocrError, setOcrError] = useState<string | null>(null);
	const [editableFieldLines, setEditableFieldLines] = useState<OcrFieldLine[]>([]);
	const [editableItemLines, setEditableItemLines] = useState<EditableOcrItemLine[]>([]);

	const categoryOptions = useMemo(
		() =>
			(baseOptions.category ?? []).map((option) => ({
				label: option.name,
				value: option.code,
			})),
		[baseOptions]
	);
	const unitOptions = useMemo(
		() =>
			(baseOptions.unit ?? []).map((option) => ({
				label: option.name,
				value: option.code,
			})),
		[baseOptions]
	);
	const locationOptions = useMemo(
		() =>
			(baseOptions.location ?? []).map((option) => ({
				label: option.name,
				value: option.code,
			})),
		[baseOptions]
	);
	const itemOptions = useMemo(
		() =>
			allItems.map((item) => ({
				label: `${item.name}${item.code ? ` (${item.code})` : ""}`,
				value: item.id,
			})),
		[allItems]
	);
	const selectedItemCount = useMemo(
		() => editableItemLines.filter((item) => item.selected).length,
		[editableItemLines]
	);

	const loadReferenceData = useCallback(async () => {
		setReferenceLoading(true);
		try {
			const [itemsResponse, baseOptionsResponse] = await Promise.all([
				fetchJson<ApiResponse<InventoryItem[]>>("/api/items?limit=200&isActive=true"),
				fetchJson<ApiResponse<BaseOptionGroups>>("/api/base-options"),
			]);
			setAllItems(itemsResponse.data);
			setBaseOptions(baseOptionsResponse.data);
			setDefaultCategoryCode((previousCode) =>
				pickDefaultOptionCode(baseOptionsResponse.data.category, previousCode)
			);
			setDefaultUnitCode((previousCode) =>
				pickDefaultOptionCode(baseOptionsResponse.data.unit, previousCode)
			);
			setDefaultLocationCode((previousCode) =>
				pickDefaultOptionCode(baseOptionsResponse.data.location, previousCode)
			);
		} catch (requestError) {
			const nextError =
				requestError instanceof Error ? requestError.message : "加载基础数据失败";
			message.error(nextError);
		} finally {
			setReferenceLoading(false);
		}
	}, [message]);

	useEffect(() => {
		void loadReferenceData();
	}, [loadReferenceData]);

	useEffect(() => {
		if (allItems.length === 0) {
			return;
		}

		setEditableItemLines((previousItems) =>
			previousItems.map((item) =>
				item.matchedItemId
					? item
					: {
							...item,
							matchedItemId: matchInventoryItemId(item.product, allItems),
					  }
			)
		);
	}, [allItems]);

	const handleFileChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const nextFile = event.target.files?.[0];
			event.target.value = "";
			if (!nextFile) {
				return;
			}

			if (!nextFile.type.startsWith("image/")) {
				message.error("仅支持上传图片文件");
				return;
			}

			setSelectedFile(nextFile);
			setOcrResult(null);
			setOcrError(null);
			setEditableFieldLines([]);
			setEditableItemLines([]);
			setPreviewUrl((previousUrl) => {
				if (previousUrl) {
					URL.revokeObjectURL(previousUrl);
				}
				return URL.createObjectURL(nextFile);
			});
		},
		[message]
	);

	const clearSelectedFile = useCallback(() => {
		setSelectedFile(null);
		setOcrResult(null);
		setOcrError(null);
		setEditableFieldLines([]);
		setEditableItemLines([]);
		setPreviewUrl((previousUrl) => {
			if (previousUrl) {
				URL.revokeObjectURL(previousUrl);
			}
			return null;
		});
	}, []);

	useEffect(() => {
		return () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl]);

	const recognizeReceipt = useCallback(async () => {
		if (!selectedFile) {
			message.warning("请先选择图片");
			return;
		}

		setRecognizing(true);
		setOcrResult(null);
		setOcrError(null);
		try {
			const formData = new FormData();
			formData.append("image", selectedFile, selectedFile.name);
			const response = await requestJson<ApiResponse<OcrReceiptResult>>(
				"/api/ocr/baidu/receipt",
				{
					method: "POST",
					body: formData,
				}
			);
			setOcrResult(response.data);
			setEditableFieldLines(response.data.fieldLines.map((line) => ({ ...line })));
			setEditableItemLines(toEditableItemLines(response.data.itemLines, allItems));
			message.success("购物小票识别完成");
		} catch (requestError) {
			const nextError =
				requestError instanceof Error ? requestError.message : "OCR识别失败";
			setOcrError(nextError);
			message.error(nextError);
		} finally {
			setRecognizing(false);
		}
	}, [allItems, message, selectedFile]);

	const restoreRecognizedResult = useCallback(() => {
		if (!ocrResult) {
			return;
		}

		setEditableFieldLines(ocrResult.fieldLines.map((line) => ({ ...line })));
		setEditableItemLines(toEditableItemLines(ocrResult.itemLines, allItems));
	}, [allItems, ocrResult]);

	const updateItemLineValue = useCallback(
		(
			id: string,
			field: "product" | "quantity" | "unitPrice" | "subtotalAmount",
			value: string
		) => {
			setEditableItemLines((previousItems) =>
				previousItems.map((item) => {
					if (item.id !== id) {
						return item;
					}

					const updatedItem = {
						...item,
						[field]: value,
						importStatus: undefined,
						importMessage: undefined,
					};

					if (field === "product" && !item.matchedItemId) {
						updatedItem.matchedItemId = matchInventoryItemId(value, allItems);
					}

					return updatedItem;
				})
			);
		},
		[allItems]
	);

	const updateMatchedItem = useCallback((id: string, matchedItemId?: string) => {
		setEditableItemLines((previousItems) =>
			previousItems.map((item) =>
				item.id === id
					? {
							...item,
							matchedItemId: matchedItemId ?? null,
							importStatus: undefined,
							importMessage: undefined,
					  }
					: item
			)
		);
	}, []);

	const updateSelectedItem = useCallback((id: string, selected: boolean) => {
		setEditableItemLines((previousItems) =>
			previousItems.map((item) =>
				item.id === id
					? {
							...item,
							selected,
							importStatus: undefined,
							importMessage: undefined,
					  }
					: item
			)
		);
	}, []);

	const importRecognizedItems = useCallback(async () => {
		const selectedRows = editableItemLines.filter((item) => item.selected);
		if (selectedRows.length === 0) {
			message.warning("请先勾选要入库的明细");
			return;
		}

		const movementDate = resolveReceiptDate(editableFieldLines);
		const createdItemsByName = new Map<string, string>();
		const nextItems = editableItemLines.map((item) => ({ ...item }));
		let successCount = 0;
		let failedCount = 0;
		let skippedCount = 0;
		let createdCount = 0;

		setImportingStock(true);
		try {
			for (const item of nextItems.filter((entry) => entry.selected)) {
				const quantity = parsePositiveQuantity(item.quantity);
				if (quantity === null) {
					skippedCount += 1;
					item.importStatus = "skipped";
					item.importMessage = "数量无效";
					continue;
				}

				let itemId = item.matchedItemId;
				const itemName = item.product.trim();
				if (!itemId) {
					if (!itemName) {
						skippedCount += 1;
						item.importStatus = "skipped";
						item.importMessage = "未匹配物品且未填写物品名";
						continue;
					}

					const key = normalizeMatchText(itemName);
					const cachedItemId = key ? createdItemsByName.get(key) : undefined;
					if (cachedItemId) {
						itemId = cachedItemId;
					} else {
						if (!defaultCategoryCode || !defaultUnitCode) {
							failedCount += 1;
							item.importStatus = "failed";
							item.importMessage = "缺少默认分类或单位，无法新建物品";
							continue;
						}

						try {
							const createPayload: Record<string, unknown> = {
								itemName,
								categoryCode: defaultCategoryCode,
								unitCode: defaultUnitCode,
							};
							if (defaultLocationCode) {
								createPayload.defaultLocationCode = defaultLocationCode;
							}
							const createResponse = await requestJson<ApiResponse<{ id: string }>>(
								"/api/items",
								{
									method: "POST",
									headers: {
										"content-type": "application/json",
									},
									body: JSON.stringify(createPayload),
								}
							);
							itemId = createResponse.data.id;
							if (key) {
								createdItemsByName.set(key, itemId);
							}
							createdCount += 1;
							item.matchedItemId = itemId;
						} catch (requestError) {
							failedCount += 1;
							item.importStatus = "failed";
							item.importMessage =
								requestError instanceof Error ? requestError.message : "新建物品失败";
							continue;
						}
					}
				}

				try {
					const unitPrice = parseOptionalNonNegativeNumber(item.unitPrice);
					const stockInPayload: Record<string, unknown> = {
						itemId,
						quantity,
						movementDate,
						purchasedAt: movementDate,
						note: `OCR小票导入：${item.product || "未命名商品"}`,
					};
					if (unitPrice !== null) {
						stockInPayload.unitPrice = unitPrice;
					}

					await requestJson("/api/stock/in", {
						method: "POST",
						headers: {
							"content-type": "application/json",
						},
						body: JSON.stringify(stockInPayload),
					});
					successCount += 1;
					item.importStatus = "success";
					item.importMessage = "入库成功";
				} catch (requestError) {
					failedCount += 1;
					item.importStatus = "failed";
					item.importMessage =
						requestError instanceof Error ? requestError.message : "入库失败";
				}
			}
		} finally {
			setImportingStock(false);
			setEditableItemLines(nextItems);
		}

		if (createdCount > 0) {
			void loadReferenceData();
		}

		if (successCount > 0) {
			message.success(`已入库 ${successCount} 条`);
		}

		if (failedCount > 0) {
			message.error(`${failedCount} 条处理失败`);
		}

		if (skippedCount > 0) {
			message.warning(`${skippedCount} 条已跳过`);
		}
	}, [
		defaultCategoryCode,
		defaultLocationCode,
		defaultUnitCode,
		editableFieldLines,
		editableItemLines,
		loadReferenceData,
		message,
	]);

	return (
		<div className="page-stack page-shell">
			<div className="page-title-row">
				<div className="page-title-copy">
					<div>
						<Title level={4} className="page-title">
							OCR图片上传
						</Title>
						<Text type="secondary" className="page-lead-text">
							识别后仅保留购买明细。勾选的行才会入库；未匹配时可填写物品名，入库时自动新建物品。
						</Text>
					</div>
				</div>
			</div>

			<Card className="surface-card">
				<Space wrap className="ocr-upload-actions">
					{isMobile ? (
						<Button
							type="primary"
							icon={<CameraOutlined />}
							className="page-action-button"
							onClick={() => cameraInputRef.current?.click()}
						>
							拍照上传
						</Button>
					) : null}
					<Button
						type={isMobile ? "default" : "primary"}
						icon={<UploadOutlined />}
						className="page-action-button"
						onClick={() => albumInputRef.current?.click()}
					>
						相册上传
					</Button>
					<Button
						type="primary"
						icon={<ScanOutlined />}
						className="page-action-button"
						onClick={() => void recognizeReceipt()}
						loading={recognizing}
						disabled={!selectedFile}
					>
						识别购物小票
					</Button>
				</Space>
				<input
					ref={cameraInputRef}
					type="file"
					accept="image/*"
					capture="environment"
					className="ocr-upload-input"
					onChange={handleFileChange}
				/>
				<input
					ref={albumInputRef}
					type="file"
					accept="image/*"
					className="ocr-upload-input"
					onChange={handleFileChange}
				/>
			</Card>

			<Card className="surface-card">
				{selectedFile && previewUrl ? (
					<div className="ocr-preview-panel">
						<img className="ocr-preview-image" src={previewUrl} alt={selectedFile.name} />
						<div className="ocr-preview-meta">
							<Text strong>文件名：{selectedFile.name}</Text>
							<Text type="secondary">类型：{selectedFile.type}</Text>
							<Text type="secondary">大小：{formatFileSize(selectedFile.size)}</Text>
							<Button onClick={clearSelectedFile}>清除图片</Button>
						</div>
					</div>
				) : (
					<Text type="secondary">请选择图片后，这里会显示预览与文件信息。</Text>
				)}
			</Card>

			<Card className="surface-card">
				<Space direction="vertical" size={12} className="ocr-result-stack">
					{ocrError ? <Alert type="error" showIcon message={ocrError} /> : null}
					{ocrResult ? (
						<>
							<div className="ocr-result-head">
								<Text strong>
									购买明细 {editableItemLines.length} 条，已勾选 {selectedItemCount} 条
								</Text>
								<Space>
									<Button size="small" onClick={restoreRecognizedResult}>
										恢复识别结果
									</Button>
									<Button
										type="primary"
										size="small"
										onClick={() => void importRecognizedItems()}
										loading={importingStock}
										disabled={selectedItemCount === 0}
									>
										将勾选商品入库
									</Button>
								</Space>
							</div>

							<div className="ocr-defaults-panel">
								<Text type="secondary">未匹配时新建物品默认设置</Text>
								<div className="ocr-item-edit-grid">
									<Select
										placeholder="默认分类"
										value={defaultCategoryCode}
										options={categoryOptions}
										loading={referenceLoading}
										onChange={(value) => setDefaultCategoryCode(value)}
									/>
									<Select
										placeholder="默认单位"
										value={defaultUnitCode}
										options={unitOptions}
										loading={referenceLoading}
										onChange={(value) => setDefaultUnitCode(value)}
									/>
									<Select
										allowClear
										placeholder="默认位置（可选）"
										value={defaultLocationCode}
										options={locationOptions}
										loading={referenceLoading}
										onChange={(value) => setDefaultLocationCode(value)}
									/>
								</div>
							</div>

							{editableItemLines.length > 0 ? (
								<div className="ocr-item-edit-list">
									{editableItemLines.map((item, index) => (
										<div className="ocr-item-edit-row" key={item.id}>
											<div className="ocr-item-row-head">
												<Checkbox
													checked={item.selected}
													onChange={(event) =>
														updateSelectedItem(item.id, event.target.checked)
													}
												>
													商品 {index + 1}
												</Checkbox>
												{item.importMessage ? (
													<Text className={`ocr-item-status is-${item.importStatus ?? "skipped"}`}>
														{item.importMessage}
													</Text>
												) : null}
											</div>
											<div className="ocr-item-edit-grid">
												<Select
													showSearch
													allowClear
													placeholder="匹配库里物品（可留空）"
													value={item.matchedItemId ?? undefined}
													options={itemOptions}
													loading={referenceLoading}
													optionFilterProp="label"
													onChange={(value) => updateMatchedItem(item.id, value)}
												/>
												<Input
													placeholder="物品名（未匹配时将用于新建）"
													value={item.product}
													onChange={(event) =>
														updateItemLineValue(item.id, "product", event.target.value)
													}
												/>
												<Input
													placeholder="数量"
													value={item.quantity}
													onChange={(event) =>
														updateItemLineValue(item.id, "quantity", event.target.value)
													}
												/>
												<Input
													placeholder="单价（可选）"
													value={item.unitPrice}
													onChange={(event) =>
														updateItemLineValue(item.id, "unitPrice", event.target.value)
													}
												/>
												<Input
													placeholder="小计（可选）"
													value={item.subtotalAmount}
													onChange={(event) =>
														updateItemLineValue(
															item.id,
															"subtotalAmount",
															event.target.value
														)
													}
												/>
											</div>
										</div>
									))}
								</div>
							) : (
								<Text type="secondary">未提取到购买明细。</Text>
							)}
						</>
					) : (
						<Text type="secondary">识别完成后，这里会展示购买明细。</Text>
					)}
				</Space>
			</Card>
		</div>
	);
}

export default OcrUploadPage;
