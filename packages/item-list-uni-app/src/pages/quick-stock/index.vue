<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout.vue";
import { loadBaseOptions, invalidateItems, loadItems } from "@/shared/data";
import { requestJson } from "@/shared/api";
import { getPageLayoutMode } from "@/shared/storage";
import type { ApiResponse, BaseOptionGroups, InventoryItem } from "@/shared/types";
import {
	EMPTY_OPTIONS,
	getDefaultCategory,
	getDefaultLocation,
	getDefaultOutboundReason,
	getDefaultUnit,
	getLayoutClass,
	navigateTo,
	parseTagInput,
	showSuccess,
	todayDate,
} from "@/shared/utils";

const loading = ref(true);
const rowActionKey = ref("");
const creating = ref(false);
const error = ref("");
const tagInput = ref("");
const newItemName = ref("");
const baseOptions = ref<BaseOptionGroups>({});
const items = ref<InventoryItem[]>([]);
const layoutMode = ref(getPageLayoutMode());

const layoutClass = computed(() => getLayoutClass(layoutMode.value));

async function loadData(showToast = false) {
	error.value = "";
	try {
		const tagNames = parseTagInput(tagInput.value);
		const [baseOptionsResponse, itemsResponse] = await Promise.all([
			loadBaseOptions(),
			loadItems({
				tagNames,
				isActive: true,
				pageSize: 200,
			}),
		]);
		baseOptions.value = baseOptionsResponse.data;
		items.value = [...itemsResponse.data.list].sort((left, right) =>
			left.name.localeCompare(right.name, "zh-Hans-CN"),
		);
		if (showToast) {
			showSuccess("快捷列表已刷新");
		}
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载快速操作数据失败";
	} finally {
		loading.value = false;
	}
}

async function adjustStock(item: InventoryItem, direction: "in" | "out") {
	const actionKey = `${item.id}:${direction}`;
	rowActionKey.value = actionKey;
	error.value = "";
	try {
		if (direction === "in") {
			await requestJson("/api/stock/in", {
				method: "POST",
				data: {
					itemId: item.id,
					quantity: 1,
					movementDate: todayDate(),
					purchasedAt: todayDate(),
					note: "uni-app 快速操作 +1",
				},
			});
			showSuccess(`${item.name} 已 +1`);
		} else {
			const reasonCode = getDefaultOutboundReason(baseOptions.value);
			if (!reasonCode) {
				throw new Error("缺少出库原因，请先在基础数据中配置。");
			}
			await requestJson("/api/stock/out", {
				method: "POST",
				data: {
					itemId: item.id,
					quantity: 1,
					movementDate: todayDate(),
					reasonCode,
					note: "uni-app 快速操作 -1",
				},
			});
			showSuccess(`${item.name} 已 -1`);
		}
		await loadData(false);
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "调整库存失败";
	} finally {
		rowActionKey.value = "";
	}
}

async function createItemWithStock() {
	const itemName = newItemName.value.trim();
	if (!itemName) {
		error.value = "请输入物品名称";
		return;
	}

	creating.value = true;
	error.value = "";
	try {
		const categoryCode = getDefaultCategory(baseOptions.value);
		const unitCode = getDefaultUnit(baseOptions.value);
		const defaultLocationCode = getDefaultLocation(baseOptions.value) || undefined;
		if (!categoryCode || !unitCode) {
			throw new Error("缺少分类或单位基础数据，无法新建物品。");
		}

		let itemId = items.value.find((item) => item.name === itemName)?.id;
		if (!itemId) {
			const createResponse = await requestJson<ApiResponse<{ id: string }>>("/api/items", {
				method: "POST",
				data: {
					itemName,
					categoryCode,
					unitCode,
					defaultLocationCode,
				},
			});
			itemId = createResponse.data.id;
		}

		await requestJson("/api/stock/in", {
			method: "POST",
			data: {
				itemId,
				quantity: 1,
				movementDate: todayDate(),
				purchasedAt: todayDate(),
				note: "uni-app 快速新增默认入库 1",
			},
		});
		newItemName.value = "";
		showSuccess("物品已新增并入库");
		await loadData(false);
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "新增物品并入库失败";
	} finally {
		creating.value = false;
	}
}

onShow(() => {
	layoutMode.value = getPageLayoutMode();
	void loadData(false);
});
</script>

<template>
	<PageLayout title="快速操作" sub-title="适合在手机上快速增减库存，也可以直接新增物品并默认入库 1。">
		<template #actions>
			<button class="button-secondary" @click="navigateTo('/pages/overview/index')">功能导航</button>
			<button class="button-primary" @click="loadData(true)">刷新列表</button>
		</template>

		<uni-notice-bar v-if="error" :text="error" type="error" :speed="0" />
		<uni-notice-bar v-if="!(baseOptions.outbound_reason ?? EMPTY_OPTIONS).length" text="未配置出库原因，-1 操作不可用。" type="warning" :speed="0" />

		<uni-card title="标签筛选">
			<view class="stack-sm">
				<uni-easyinput v-model="tagInput" placeholder="多个标签用逗号或换行分隔" />
				<button class="button-secondary" @click="loadData(false)">按标签刷新</button>
			</view>
		</uni-card>

		<uni-card title="快速库存调整">
			<view v-if="loading" class="empty-state">加载中...</view>
			<view v-else-if="items.length === 0" class="empty-state">暂无可操作物品</view>
			<view v-else class="item-grid" :class="layoutClass">
				<view v-for="item in items" :key="item.id" class="item-card">
					<view class="stack-sm">
						<text class="item-title">{{ item.name }}</text>
						<text class="muted">当前库存：{{ item.currentQuantity }}</text>
						<text class="muted">标签：{{ item.tagNames.join(" / ") || "暂无标签" }}</text>
					</view>
					<view class="inline-actions" style="margin-top: 16rpx">
						<button
							class="button-secondary"
							:disabled="item.currentQuantity <= 0 || !(baseOptions.outbound_reason ?? EMPTY_OPTIONS).length"
							:loading="rowActionKey === `${item.id}:out`"
							@click="adjustStock(item, 'out')"
						>
							-1
						</button>
						<button
							class="button-primary"
							:loading="rowActionKey === `${item.id}:in`"
							@click="adjustStock(item, 'in')"
						>
							+1
						</button>
					</view>
				</view>
			</view>
		</uni-card>

		<uni-card title="新增物品并默认入库">
			<view class="stack-sm">
				<uni-easyinput v-model="newItemName" placeholder="输入物品名称" />
				<button class="button-primary" :loading="creating" @click="createItemWithStock">
					新增物品 + 入库 1
				</button>
			</view>
		</uni-card>
	</PageLayout>
</template>
