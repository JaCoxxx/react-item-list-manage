<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout.vue";
import { loadBaseOptions, loadItems } from "@/shared/data";
import { getAiProvider, getPageLayoutMode, setAiProvider, setPageLayoutMode } from "@/shared/storage";
import type { AiProvider, BaseOptionGroups, InventoryItem, PageLayoutMode } from "@/shared/types";
import { baseOptionCount, navigateTo, showSuccess } from "@/shared/utils";

const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const baseOptions = ref<BaseOptionGroups>({});
const items = ref<InventoryItem[]>([]);
const layoutMode = ref<PageLayoutMode>(getPageLayoutMode());
const aiProvider = ref<AiProvider>(getAiProvider());

async function loadData(showToast = false) {
	error.value = "";
	refreshing.value = showToast;
	try {
		const [baseOptionsResponse, itemsResponse] = await Promise.all([
			loadBaseOptions(),
			loadItems({ pageSize: 200 }),
		]);
		baseOptions.value = baseOptionsResponse.data;
		items.value = itemsResponse.data.list;
		if (showToast) {
			showSuccess("基础数据已刷新");
		}
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载工具数据失败";
	} finally {
		loading.value = false;
		refreshing.value = false;
	}
}

function updateLayoutMode(value: PageLayoutMode) {
	layoutMode.value = value;
	setPageLayoutMode(value);
	showSuccess("页面布局已保存");
}

function updateAiProvider(value: AiProvider) {
	aiProvider.value = value;
	setAiProvider(value);
	showSuccess("AI 提供商已保存");
}

onShow(() => {
	void loadData(false);
});
</script>

<template>
	<PageLayout title="工具页" sub-title="查看全局数据概况，并设置列表布局和 AI 提供商。">
		<template #actions>
			<button class="button-secondary" @click="navigateTo('/pages/overview/index')">功能导航</button>
			<button class="button-primary" :loading="refreshing" @click="loadData(true)">刷新基础数据</button>
		</template>

		<uni-notice-bar v-if="error" :text="error" type="error" :speed="0" />

		<uni-card title="当前数据概况">
			<view class="stats-grid">
				<view class="stat-card">
					<text class="stat-value">{{ loading ? "--" : baseOptionCount(baseOptions) }}</text>
					<text class="stat-label">基础数据项</text>
				</view>
				<view class="stat-card">
					<text class="stat-value">{{ loading ? "--" : items.length }}</text>
					<text class="stat-label">物品档案数</text>
				</view>
			</view>
		</uni-card>

		<uni-card title="页面布局">
			<view class="row-wrap">
				<button
					:class="layoutMode === 'row' ? 'button-primary' : 'button-secondary'"
					@click="updateLayoutMode('row')"
				>
					行排列
				</button>
				<button
					:class="layoutMode === 'two-column' ? 'button-primary' : 'button-secondary'"
					@click="updateLayoutMode('two-column')"
				>
					双列排列
				</button>
				<button
					:class="layoutMode === 'three-column' ? 'button-primary' : 'button-secondary'"
					@click="updateLayoutMode('three-column')"
				>
					三列排列
				</button>
			</view>
		</uni-card>

		<uni-card title="AI 提供商">
			<view class="row-wrap">
				<button
					:class="aiProvider === 'gpt' ? 'button-primary' : 'button-secondary'"
					@click="updateAiProvider('gpt')"
				>
					GPT
				</button>
				<button
					:class="aiProvider === 'deepseek' ? 'button-primary' : 'button-secondary'"
					@click="updateAiProvider('deepseek')"
				>
					DeepSeek
				</button>
			</view>
			<text class="field-hint">OCR AI 页面和对话操作页面会复用这里保存的默认提供商。</text>
		</uni-card>
	</PageLayout>
</template>
