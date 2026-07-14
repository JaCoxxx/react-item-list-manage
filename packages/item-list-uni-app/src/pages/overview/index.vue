<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout.vue";
import { loadBaseOptions, loadDashboard, loadSetupStatus } from "@/shared/data";
import type { BaseOptionGroups, DashboardData, SetupStatus } from "@/shared/types";
import { MENU_ENTRIES, baseOptionCount, displayTypeName, navigateTo, showSuccess } from "@/shared/utils";

const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const baseOptions = ref<BaseOptionGroups>({});
const setupStatus = ref<SetupStatus | null>(null);
const dashboard = ref<DashboardData | null>(null);

const summaryStats = computed(() => [
	{ title: "物品总数", value: dashboard.value?.totalItems ?? 0 },
	{ title: "有库存", value: dashboard.value?.itemsInStock ?? 0 },
	{ title: "低库存", value: dashboard.value?.itemsBelowMinStock ?? 0 },
	{
		title: "临期/过期",
		value: (dashboard.value?.itemsExpiringSoon ?? 0) + (dashboard.value?.itemsWithExpiredStock ?? 0),
	},
]);

const optionStats = computed(() => [
	{ title: "基础数据项", value: baseOptionCount(baseOptions.value) },
	{ title: "分类", value: baseOptions.value.category?.length ?? 0 },
	{ title: "位置", value: baseOptions.value.location?.length ?? 0 },
	{ title: "单位", value: baseOptions.value.unit?.length ?? 0 },
]);

const optionTypes = computed(() =>
	Object.entries(baseOptions.value).map(([type, options]) => ({
		type,
		count: options.length,
	})),
);

async function loadData(showToast = false) {
	error.value = "";
	refreshing.value = showToast;
	try {
		const [setupResponse, dashboardResponse, baseOptionsResponse] = await Promise.all([
			loadSetupStatus(),
			loadDashboard(),
			loadBaseOptions(),
		]);
		setupStatus.value = setupResponse.data;
		dashboard.value = dashboardResponse.data;
		baseOptions.value = baseOptionsResponse.data;
		if (showToast) {
			showSuccess("统计已刷新");
		}
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载统计失败";
	} finally {
		loading.value = false;
		refreshing.value = false;
	}
}

onShow(() => {
	void loadData(false);
});
</script>

<template>
	<PageLayout
		title="家庭物品清单"
		sub-title="移动端 uni-app 版首页，聚合统计信息、基础数据概况和主要页面导航。"
	>
		<template #actions>
			<button class="button-primary" :loading="refreshing" @click="loadData(true)">刷新统计</button>
		</template>

		<uni-notice-bar v-if="error" :text="error" type="error" :speed="0" />
		<uni-notice-bar
			v-if="setupStatus && !setupStatus.ready"
			:text="`D1 尚未完成初始化。缺少表：${setupStatus.missingTables.join('、') || '无'}；缺少视图：${setupStatus.missingViews.join('、') || '无'}。`"
			type="warning"
			:speed="0"
		/>

		<uni-card title="库存概览">
			<view class="stats-grid">
				<view v-for="entry in summaryStats" :key="entry.title" class="stat-card">
					<text class="stat-value">{{ loading ? "--" : entry.value }}</text>
					<text class="stat-label">{{ entry.title }}</text>
				</view>
			</view>
		</uni-card>

		<uni-card title="基础数据概览">
			<view class="stats-grid">
				<view v-for="entry in optionStats" :key="entry.title" class="stat-card">
					<text class="stat-value">{{ entry.value }}</text>
					<text class="stat-label">{{ entry.title }}</text>
				</view>
			</view>
			<view class="divider" style="margin: 20rpx 0" />
			<view class="tag-list">
				<uni-tag
					v-for="entry in optionTypes"
					:key="entry.type"
					:text="`${displayTypeName(entry.type)}：${entry.count}`"
					type="primary"
				/>
			</view>
		</uni-card>

		<uni-card title="功能导航" sub-title="点击卡片进入对应页面。">
			<view class="menu-grid">
				<view
					v-for="entry in MENU_ENTRIES"
					:key="entry.url"
					class="menu-card"
					@click="navigateTo(entry.url)"
				>
					<text class="menu-title">{{ entry.title }}</text>
					<text class="menu-copy">{{ entry.copy }}</text>
				</view>
			</view>
		</uni-card>
	</PageLayout>
</template>
