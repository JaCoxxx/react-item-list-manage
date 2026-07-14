// 百度 OCR + OpenAI/DeepSeek AI 集成, 从原 worker/index.ts 迁移
// secrets 从 process.env 读取 (uniCloud 云函数环境变量)

const { ApiError } = require("./helpers.js");

const BAIDU_OAUTH_URL = "https://aip.baidubce.com/oauth/2.0/token";
const DEFAULT_BAIDU_OCR_RECEIPT_URL =
	"https://aip.baidubce.com/rest/2.0/ocr/v1/shopping_receipt";
const BAIDU_OCR_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const BAIDU_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const BAIDU_RECEIPT_FIELD_LABELS = {
	shop_name: "店铺名称",
	receipt_num: "小票号",
	machine_num: "机号",
	employee_num: "员工号",
	consumption_date: "消费日期",
	consumption_time: "消费时间",
	total_amount: "总金额",
	change: "找零",
	currency: "币种",
	paid_amount: "实付金额",
	discount: "优惠金额",
	print_date: "打印日期",
	print_time: "打印时间",
};
let baiduTokenCache = null;

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";
const OPENAI_COMMAND_SYSTEM_PROMPT = `你是库存系统的操作意图解析器。你必须把用户自然语言解析成一个 JSON。
你只能识别以下 action：
- stock_in（入库）
- stock_out（出库）
- create_item（新增物品）
如果无法确定，action 必须是 unsupported。

输出 JSON 格式：
{
	"action": "stock_in|stock_out|create_item|unsupported",
	"confidence": 0到1之间数字,
	"reply": "给用户的简短中文回复",
	"params": {
		"itemName": "物品名",
		"itemCode": "物品编码",
		"quantity": 数字,
		"reasonCode": "出库原因编码",
		"categoryCode": "分类编码",
		"unitCode": "单位编码",
		"locationCode": "位置编码",
		"note": "备注"
	}
}

规则：
1) 只输出 JSON，不要输出其他文本。
2) 如果没有字段，不要编造；缺失字段可省略。
3) quantity 必须是正数；若用户未提及则省略。
4) 对于非库存操作（如删除、修改价格、查询天气），action=unsupported。`;
const OPENAI_RECEIPT_SYSTEM_PROMPT = `你是一个购物小票信息提取助手。用户会上传一张购物小票图片，你需要从中提取结构化数据。
请返回一个 JSON 对象，格式如下：
{
  "fieldLines": [
    { "id": "field_1", "key": "shop_name", "label": "店铺名称", "value": "..." },
    { "id": "field_2", "key": "consumption_date", "label": "消费日期", "value": "YYYY-MM-DD 格式" },
    { "id": "field_3", "key": "total_amount", "label": "总金额", "value": "..." }
  ],
  "itemLines": [
    { "id": "item_1", "product": "商品名称", "quantity": "数量（纯数字）", "unitPrice": "单价（纯数字）", "subtotalAmount": "小计（纯数字）" }
  ]
}
fieldLines 包括：shop_name（店铺名称）、receipt_num（小票号）、consumption_date（消费日期，格式 YYYY-MM-DD）、consumption_time（消费时间）、total_amount（总金额）、paid_amount（实付金额）、discount（优惠金额）中存在的字段。
itemLines 中每个商品单独一行，quantity/unitPrice/subtotalAmount 只填写纯数字字符串，如果无法识别则填写空字符串。
只返回 JSON，不要有任何额外说明。`;

// ---------- 通用 ----------
function requireEnvValue(value, fieldName) {
	const normalized = value?.trim();
	if (!normalized) {
		throw new ApiError(503, `${fieldName} is not configured.`);
	}
	return normalized;
}

// ---------- AI 提供商 ----------
function parseAiProvider(value) {
	return value === "deepseek" ? "deepseek" : "gpt";
}

function resolveAiProviderConfig(provider) {
	if (provider === "deepseek") {
		const apiKey = process.env.DEEPSEEK_API_KEY;
		if (!apiKey) {
			throw new ApiError(503, "DeepSeek API Key 未配置，请在环境变量中设置 DEEPSEEK_API_KEY。");
		}
		return {
			provider,
			providerName: "DeepSeek",
			apiUrl: DEEPSEEK_CHAT_URL,
			apiKey,
			receiptModel: "deepseek-chat",
			commandModel: "deepseek-chat",
		};
	}
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new ApiError(503, "OpenAI API Key 未配置，请在环境变量中设置 OPENAI_API_KEY。");
	}
	return {
		provider,
		providerName: "OpenAI",
		apiUrl: OPENAI_CHAT_URL,
		apiKey,
		receiptModel: "gpt-4o",
		commandModel: "gpt-4o-mini",
	};
}

function buildProviderErrorMessage(providerName, status, message) {
	return message ? message : `${providerName} API error: ${status}`;
}

async function parseChatJsonContent(response, providerName, emptyMessage, invalidJsonMessage) {
	if (!response.ok) {
		let errorMessage = buildProviderErrorMessage(providerName, response.status);
		try {
			const errorBody = await response.json();
			errorMessage = buildProviderErrorMessage(
				providerName,
				response.status,
				errorBody.error?.message
			);
		} catch {
			// ignore
		}
		throw new ApiError(502, errorMessage);
	}
	const result = await response.json();
	const content = result.choices?.[0]?.message?.content;
	if (!content) {
		throw new ApiError(502, emptyMessage);
	}
	const jsonText = content
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```\s*$/i, "")
		.trim();
	try {
		return JSON.parse(jsonText);
	} catch {
		throw new ApiError(502, invalidJsonMessage);
	}
}

async function requestAiReceiptOcr(providerConfig, imageBase64, mimeType) {
	const response = await fetch(providerConfig.apiUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${providerConfig.apiKey}`,
		},
		body: JSON.stringify({
			model: providerConfig.receiptModel,
			max_tokens: 2048,
			messages: [
				{ role: "system", content: OPENAI_RECEIPT_SYSTEM_PROMPT },
				{
					role: "user",
					content: [
						{
							type: "image_url",
							image_url: {
								url: `data:${mimeType};base64,${imageBase64}`,
								detail: "high",
							},
						},
						{ type: "text", text: "请识别这张购物小票并返回结构化 JSON。" },
					],
				},
			],
		}),
	});
	const parsed = await parseChatJsonContent(
		response,
		providerConfig.providerName,
		`${providerConfig.providerName} 返回了空的响应内容`,
		`${providerConfig.providerName} 返回的内容无法解析为 JSON`
	);
	return {
		fieldLines: Array.isArray(parsed.fieldLines) ? parsed.fieldLines : [],
		itemLines: Array.isArray(parsed.itemLines) ? parsed.itemLines : [],
	};
}

async function requestAiCommandParse(providerConfig, text) {
	const response = await fetch(providerConfig.apiUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${providerConfig.apiKey}`,
		},
		body: JSON.stringify({
			model: providerConfig.commandModel,
			max_tokens: 600,
			messages: [
				{ role: "system", content: OPENAI_COMMAND_SYSTEM_PROMPT },
				{ role: "user", content: text },
			],
		}),
	});
	const parsed = await parseChatJsonContent(
		response,
		providerConfig.providerName,
		`${providerConfig.providerName} 返回了空的响应内容`,
		`${providerConfig.providerName} 返回的内容无法解析为 JSON`
	);
	const validActions = ["stock_in", "stock_out", "create_item", "unsupported"];
	const action = validActions.includes(parsed.action) ? parsed.action : "unsupported";
	const confidence =
		typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
			? Math.max(0, Math.min(1, parsed.confidence))
			: 0;
	const params = parsed.params ?? {};
	return {
		action,
		confidence,
		reply:
			typeof parsed.reply === "string" && parsed.reply.trim().length > 0
				? parsed.reply.trim()
				: "已解析你的指令。",
		params: {
			itemName: typeof params.itemName === "string" ? params.itemName.trim() : undefined,
			itemCode: typeof params.itemCode === "string" ? params.itemCode.trim() : undefined,
			quantity:
				typeof params.quantity === "number" &&
				Number.isFinite(params.quantity) &&
				params.quantity > 0
					? params.quantity
					: undefined,
			reasonCode: typeof params.reasonCode === "string" ? params.reasonCode.trim() : undefined,
			categoryCode: typeof params.categoryCode === "string" ? params.categoryCode.trim() : undefined,
			unitCode: typeof params.unitCode === "string" ? params.unitCode.trim() : undefined,
			locationCode: typeof params.locationCode === "string" ? params.locationCode.trim() : undefined,
			note: typeof params.note === "string" ? params.note.trim() : undefined,
		},
	};
}

function validateOpenAiFieldLines(raw) {
	return raw
		.filter((item) => typeof item === "object" && item !== null)
		.map((item, index) => ({
			id: typeof item.id === "string" ? item.id : `field_${index + 1}`,
			key: typeof item.key === "string" ? item.key : `field_${index + 1}`,
			label: typeof item.label === "string" ? item.label : String(item.key ?? `字段${index + 1}`),
			value: typeof item.value === "string" ? item.value : String(item.value ?? ""),
		}));
}

function validateOpenAiItemLines(raw) {
	return raw
		.filter((item) => typeof item === "object" && item !== null)
		.map((item, index) => ({
			id: typeof item.id === "string" ? item.id : `item_${index + 1}`,
			product: typeof item.product === "string" ? item.product : String(item.product ?? ""),
			quantity: typeof item.quantity === "string" ? item.quantity : String(item.quantity ?? ""),
			unitPrice: typeof item.unitPrice === "string" ? item.unitPrice : String(item.unitPrice ?? ""),
			subtotalAmount:
				typeof item.subtotalAmount === "string"
					? item.subtotalAmount
					: String(item.subtotalAmount ?? ""),
		}));
}

// ---------- 百度 OCR ----------
function getBaiduReceiptApiUrl() {
	const configured = process.env.BAIDU_OCR_RECEIPT_API_URL?.trim();
	return configured && configured.length > 0 ? configured : DEFAULT_BAIDU_OCR_RECEIPT_URL;
}

function toBaiduError(payload) {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}
	const errorCode = payload.error_code;
	const errorMessage = payload.error_msg;
	if (typeof errorCode !== "number" || typeof errorMessage !== "string") {
		return null;
	}
	return { code: errorCode, message: errorMessage };
}

function isBaiduAccessTokenExpired(payload) {
	const error = toBaiduError(payload);
	return Boolean(error && (error.code === 110 || error.code === 111));
}

async function readJsonObjectResponse(response) {
	const text = await response.text();
	if (text.length === 0) {
		return null;
	}
	try {
		const parsed = JSON.parse(text);
		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function arrayBufferToBase64(buffer) {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = "";
	for (let index = 0; index < bytes.length; index += chunkSize) {
		const chunk = bytes.subarray(index, index + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

async function getBaiduAccessToken() {
	const now = Date.now();
	if (baiduTokenCache && baiduTokenCache.expiresAt > now) {
		return baiduTokenCache.accessToken;
	}
	const apiKey = requireEnvValue(process.env.BAIDU_OCR_API_KEY, "BAIDU_OCR_API_KEY");
	const secretKey = requireEnvValue(process.env.BAIDU_OCR_SECRET_KEY, "BAIDU_OCR_SECRET_KEY");
	const tokenUrl = `${BAIDU_OAUTH_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;
	const response = await fetch(tokenUrl, { method: "POST" });
	const payload = await readJsonObjectResponse(response);
	const baiduError = toBaiduError(payload);
	if (!response.ok || baiduError) {
		throw new ApiError(502, "Failed to fetch Baidu OCR access token.", {
			status: response.status,
			baiduError,
		});
	}
	const accessToken = payload.access_token;
	if (typeof accessToken !== "string" || accessToken.length === 0) {
		throw new ApiError(502, "Invalid Baidu OCR access token response.");
	}
	const expiresInSeconds =
		typeof payload.expires_in === "number" && payload.expires_in > 0
			? payload.expires_in
			: 60 * 60;
	const ttlMs = Math.max(30 * 1000, expiresInSeconds * 1000 - BAIDU_TOKEN_REFRESH_BUFFER_MS);
	baiduTokenCache = { accessToken, expiresAt: now + ttlMs };
	return accessToken;
}

async function doBaiduReceiptOcrRequest(imageBase64, accessToken) {
	const response = await fetch(
		`${getBaiduReceiptApiUrl()}?access_token=${encodeURIComponent(accessToken)}`,
		{
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ image: imageBase64, detect_direction: "true" }),
		}
	);
	const payload = await readJsonObjectResponse(response);
	return { response, payload };
}

async function requestBaiduShoppingReceiptOcr(imageBuffer) {
	const imageBase64 = arrayBufferToBase64(imageBuffer);
	let accessToken = await getBaiduAccessToken();
	let { response, payload } = await doBaiduReceiptOcrRequest(imageBase64, accessToken);
	if (isBaiduAccessTokenExpired(payload)) {
		baiduTokenCache = null;
		accessToken = await getBaiduAccessToken();
		const retried = await doBaiduReceiptOcrRequest(imageBase64, accessToken);
		response = retried.response;
		payload = retried.payload;
	}
	const baiduError = toBaiduError(payload);
	if (!response.ok || baiduError) {
		throw new ApiError(502, "Baidu OCR request failed.", {
			status: response.status,
			baiduError,
		});
	}
	if (!payload) {
		throw new ApiError(502, "Baidu OCR returned an empty response.");
	}
	return payload;
}

function parseBaiduReceiptResult(payload) {
	const fieldLines = extractBaiduReceiptFieldLines(payload);
	const itemLines = extractBaiduReceiptItemLines(payload);
	const lines = [
		...fieldLines.map((field) => `${field.label}：${field.value}`),
		...itemLines.map(
			(item, index) => `商品${index + 1}：${item.product || "-"}，数量 ${item.quantity || "-"}`
		),
	];
	if (lines.length === 0) {
		lines.push(...extractBaiduFallbackTextLines(payload));
	}
	return { fieldLines, itemLines, lines };
}

function extractBaiduReceiptFieldLines(payload) {
	const receipts = getBaiduReceiptRecords(payload);
	const lines = [];
	receipts.forEach((receipt, receiptIndex) => {
		Object.entries(receipt).forEach(([fieldKey, fieldValue]) => {
			if (fieldKey === "table" || fieldKey === "table_row_num") {
				return;
			}
			const value = extractFirstWord(fieldValue);
			if (value === null) {
				return;
			}
			lines.push({
				id: `field-${receiptIndex}-${fieldKey}-${lines.length}`,
				key: fieldKey,
				label: BAIDU_RECEIPT_FIELD_LABELS[fieldKey] ?? fieldKey,
				value,
			});
		});
	});
	return lines;
}

function extractBaiduReceiptItemLines(payload) {
	const receipts = getBaiduReceiptRecords(payload);
	const items = [];
	receipts.forEach((receipt, receiptIndex) => {
		const tableValue = receipt.table;
		if (!Array.isArray(tableValue)) {
			return;
		}
		const rows = tableValue
			.map(normalizeBaiduReceiptTableRow)
			.filter(
				(row) =>
					row.product.length > 0 ||
					row.quantity.length > 0 ||
					row.unitPrice.length > 0 ||
					row.subtotalAmount.length > 0
			);
		const mergedRows = mergeBaiduReceiptRows(rows);
		mergedRows.forEach((row, rowIndex) => {
			items.push({ id: `item-${receiptIndex}-${rowIndex}`, ...row });
		});
	});
	return items;
}

function normalizeBaiduReceiptTableRow(value) {
	if (typeof value !== "object" || value === null) {
		return { product: "", quantity: "", unitPrice: "", subtotalAmount: "" };
	}
	const row = value;
	return {
		product:
			extractFirstWord(row.product) ??
			extractFirstWord(row.item_name) ??
			extractFirstWord(row.name) ??
			"",
		quantity: extractFirstWord(row.quantity) ?? extractFirstWord(row.qty) ?? "",
		unitPrice: extractFirstWord(row.unit_price) ?? extractFirstWord(row.price) ?? "",
		subtotalAmount: extractFirstWord(row.subtotal_amount) ?? extractFirstWord(row.amount) ?? "",
	};
}

function mergeBaiduReceiptRows(rows) {
	const merged = [];
	let current = null;
	for (const row of rows) {
		if (!current) {
			current = { ...row };
			continue;
		}
		if (shouldMergeBaiduReceiptRows(current, row)) {
			current = mergeBaiduReceiptRow(current, row);
			continue;
		}
		merged.push(current);
		current = { ...row };
	}
	if (current) {
		merged.push(current);
	}
	return merged;
}

function shouldMergeBaiduReceiptRows(current, next) {
	const nextHasOnlyProduct =
		next.product.length > 0 &&
		next.quantity.length === 0 &&
		next.unitPrice.length === 0 &&
		next.subtotalAmount.length === 0;
	const currentHasAmountOrQuantity =
		current.quantity.length > 0 ||
		current.unitPrice.length > 0 ||
		current.subtotalAmount.length > 0;
	if (nextHasOnlyProduct && currentHasAmountOrQuantity) return true;
	if (current.product.length === 0 && next.product.length > 0) return true;
	if (looksLikeSkuCode(current.product) && nextHasOnlyProduct) return true;
	if (current.quantity.length === 0 && next.quantity.length > 0 && next.product.length === 0) return true;
	if (current.unitPrice.length === 0 && next.unitPrice.length > 0 && next.product.length === 0) return true;
	if (current.subtotalAmount.length === 0 && next.subtotalAmount.length > 0 && next.product.length === 0) return true;
	return false;
}

function mergeBaiduReceiptRow(current, next) {
	const merged = { ...current };
	if (next.product.length > 0) {
		if (merged.product.length === 0) {
			merged.product = next.product;
		} else if (looksLikeSkuCode(merged.product) && !looksLikeSkuCode(next.product)) {
			merged.product = next.product;
		}
	}
	if (merged.quantity.length === 0 && next.quantity.length > 0) merged.quantity = next.quantity;
	if (merged.unitPrice.length === 0 && next.unitPrice.length > 0) merged.unitPrice = next.unitPrice;
	if (merged.subtotalAmount.length === 0 && next.subtotalAmount.length > 0)
		merged.subtotalAmount = next.subtotalAmount;
	return merged;
}

function looksLikeSkuCode(value) {
	const trimmed = value.trim();
	if (trimmed.length < 4) return false;
	if (/[一-鿿]/.test(trimmed)) return false;
	return /^[A-Za-z0-9-]+$/.test(trimmed);
}

function getBaiduReceiptRecords(payload) {
	const wordsResult = payload.words_result;
	if (!wordsResult) return [];
	if (Array.isArray(wordsResult)) {
		return wordsResult.filter((entry) => typeof entry === "object" && entry !== null);
	}
	if (typeof wordsResult === "object") {
		return [wordsResult];
	}
	return [];
}

function extractBaiduFallbackTextLines(payload) {
	const wordsResult = payload.words_result;
	if (!wordsResult) return [];
	if (Array.isArray(wordsResult)) {
		return wordsResult.map(extractLineFromWordResult).filter((line) => line !== null);
	}
	if (typeof wordsResult === "object") {
		return Object.values(wordsResult)
			.map(extractLineFromWordResult)
			.filter((line) => line !== null);
	}
	return [];
}

function extractLineFromWordResult(value) {
	return extractFirstWord(value) ?? null;
}

function extractFirstWord(value) {
	if (typeof value === "string") {
		const text = value.trim();
		return text.length > 0 ? text : null;
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const extracted = extractFirstWord(entry);
			if (extracted !== null) return extracted;
		}
		return null;
	}
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const entry = value;
	const directCandidates = [entry.word, entry.words, entry.value, entry.text];
	for (const candidate of directCandidates) {
		if (typeof candidate === "string") {
			const text = candidate.trim();
			if (text.length > 0) return text;
		}
	}
	for (const nestedValue of Object.values(entry)) {
		const extracted = extractFirstWord(nestedValue);
		if (extracted !== null) return extracted;
	}
	return null;
}

module.exports = {
	parseAiProvider,
	resolveAiProviderConfig,
	requestAiReceiptOcr,
	requestAiCommandParse,
	validateOpenAiFieldLines,
	validateOpenAiItemLines,
	requestBaiduShoppingReceiptOcr,
	parseBaiduReceiptResult,
	BAIDU_OCR_IMAGE_MAX_BYTES,
};
