<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout.vue";
import { loadBaseOptions, invalidateItems, loadItems } from "@/shared/data";
import { requestJson } from "@/shared/api";
import { getAiProvider, setAiProvider } from "@/shared/storage";
import type {
	AiCommandParseResult,
	AiProvider,
	ApiResponse,
	BaseOptionGroups,
	InventoryItem,
} from "@/shared/types";
import {
	getDefaultCategory,
	getDefaultLocation,
	getDefaultOutboundReason,
	getDefaultUnit,
	navigateTo,
	normalizeParsedCommand,
	showSuccess,
	todayDate,
} from "@/shared/utils";

const provider = ref<AiProvider>(getAiProvider());
const text = ref("");
const loading = ref(true);
const parsing = ref(false);
const executing = ref(false);
const error = ref("");
const baseOptions = ref<BaseOptionGroups>({});
const items = ref<InventoryItem[]>([]);
const parsed = ref<AiCommandParseResult | null>(null);

const resolvedParsed = computed(() =>
	parsed.value ? normalizeParsedCommand(parsed.value, baseOptions.value) : null,
);

async function loadData() {
	try {
		const [baseOptionsResponse, itemsResponse] = await Promise.all([
			loadBaseOptions(),
			loadItems({ pageSize: 200, isActive: true }),
		]);
		baseOptions.value = baseOptionsResponse.data;
		items.value = itemsResponse.data.list;
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载对话操作依赖失败";
	} finally {
		loading.value = false;
	}
}

async function parseCommand() {
	if (!text.value.trim()) {
		error.value = "请输入自然语言指令";
		return;
	}

	parsing.value = true;
	error.value = "";
	try {
		const response = await requestJson<ApiResponse<AiCommandParseResult>>("/api/ai/command/parse", {
			method: "POST",
			data: {
				text: text.value.trim(),
				provider: provider.value,
			},
		});
		parsed.value = response.data;
		setAiProvider(provider.value);
		showSuccess("指令已解析");
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "解析指令失败";
	} finally {
		parsing.value = false;
	}
}

async function ensureItemId(itemName?: string, categoryCode?: string, unitCode?: string, locationCode?: string) {
	if (!itemName) {
		throw new Error("缺少物品名称");
	}

	const existingItem = items.value.find((item) => item.name === itemName);
	if (existingItem) {
		return existingItem.id;
	}

	const createResponse = await requestJson<ApiResponse<{ id: string }>>("/api/items", {
		method: "POST",
		data: {
			itemName,
			categoryCode: categoryCode || getDefaultCategory(baseOptions.value),
			unitCode: unitCode || getDefaultUnit(baseOptions.value),
			defaultLocationCode: locationCode || getDefaultLocation(baseOptions.value) || undefined,
		},
	});
	return createResponse.data.id;
}

async function executeCommand() {
	if (!resolvedParsed.value) {
		error.value = "请先解析指令";
		return;
	}

	executing.value = true;
	error.value = "";
	try {
		const command = resolvedParsed.value;

		if (command.action === "unsupported") {
			throw new Error("当前指令不支持执行，请改写后重试。");
		}

		if (command.action === "create_item") {
			await ensureItemId(
				command.params.itemName,
				command.params.categoryCode,
				command.params.unitCode,
				command.params.locationCode,
			);
			showSuccess("已创建物品");
		}

		if (command.action === "stock_in") {
			const itemId = await ensureItemId(
				command.params.itemName,
				command.params.categoryCode,
				command.params.unitCode,
				command.params.locationCode,
			);
			await requestJson("/api/stock/in", {
				method: "POST",
				data: {
					itemId,
					quantity: command.params.quantity ?? 1,
					movementDate: todayDate(),
					purchasedAt: todayDate(),
					locationCode: command.params.locationCode || undefined,
					note: command.params.note || "AI 对话操作入库",
				},
			});
			showSuccess("已完成入库");
		}

		if (command.action === "stock_out") {
			const item = items.value.find((entry) => entry.name === command.params.itemName);
			if (!item) {
				throw new Error("未找到对应物品，无法出库。");
			}
			await requestJson("/api/stock/out", {
				method: "POST",
				data: {
					itemId: item.id,
					quantity: command.params.quantity ?? 1,
					movementDate: todayDate(),
					reasonCode: command.params.reasonCode || getDefaultOutboundReason(baseOptions.value),
					locationCode: command.params.locationCode || undefined,
					note: command.params.note || "AI 对话操作出库",
				},
			});
			showSuccess("已完成出库");
		}

		invalidateItems();
		const itemsResponse = await loadItems({ pageSize: 200, isActive: true }, true);
		items.value = itemsResponse.data.list;
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "执行指令失败";
	} finally {
		executing.value = false;
	}
}

onShow(() => {
	provider.value = getAiProvider();
	void loadData();
});
</script>

<template>
	<PageLayout title="对话操作" sub-title="将自然语言解析为库存动作，并可直接执行创建、入库或出库。">
		<template #actions>
			<button class="button-secondary" @click="navigateTo('/pages/overview/index')">功能导航</button>
			<button class="button-primary" :loading="parsing" @click="parseCommand">解析指令</button>
		</template>

		<uni-notice-bar v-if="error" :text="error" type="error" :speed="0" />

		<uni-card title="AI 提供商">
			<view class="row-wrap">
				<button :class="provider === 'gpt' ? 'button-primary' : 'button-secondary'" @click="provider = 'gpt'">
					GPT
				</button>
				<button
					:class="provider === 'deepseek' ? 'button-primary' : 'button-secondary'"
					@click="provider = 'deepseek'"
				>
					DeepSeek
				</button>
			</view>
		</uni-card>

		<uni-card title="输入指令">
			<view class="stack-sm">
				<uni-easyinput type="textarea"
					v-model="text"
					placeholder="例如：买了两盒牛奶放进冰箱；把一包鸡胸肉消耗掉；新增一瓶洗洁精"
				/>
				<text class="field-hint">当前已加载 {{ loading ? "--" : items.length }} 个可用物品。</text>
			</view>
		</uni-card>

		<uni-card title="解析结果">
			<view v-if="!resolvedParsed" class="empty-state">暂无解析结果</view>
			<view v-else class="stack-md">
				<uni-notice-bar :text="`动作：${resolvedParsed.action} · 置信度：${resolvedParsed.confidence.toFixed(2)}`" type="success" :speed="0" />
				<text class="item-title">{{ resolvedParsed.reply }}</text>
				<view class="stack-sm">
					<text class="muted">物品：{{ resolvedParsed.params.itemName || "未识别" }}</text>
					<text class="muted">数量：{{ resolvedParsed.params.quantity ?? "未识别" }}</text>
					<text class="muted">分类：{{ resolvedParsed.params.categoryCode || "未识别" }}</text>
					<text class="muted">单位：{{ resolvedParsed.params.unitCode || "未识别" }}</text>
					<text class="muted">位置：{{ resolvedParsed.params.locationCode || "未识别" }}</text>
					<text class="muted">原因：{{ resolvedParsed.params.reasonCode || "未识别" }}</text>
					<text class="muted">备注：{{ resolvedParsed.params.note || "未识别" }}</text>
				</view>
				<button class="button-primary" :loading="executing" @click="executeCommand">执行解析结果</button>
			</view>
		</uni-card>
	</PageLayout>
</template>
