<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout.vue";
import { loadBaseOptions, invalidateItems, loadItems } from "@/shared/data";
import { requestJson } from "@/shared/api";
import type { ApiResponse, BaseOptionGroups, InventoryItem } from "@/shared/types";
import {
	EMPTY_OPTIONS,
	confirmAction,
	findOptionName,
	formatTags,
	getDefaultCategory,
	getDefaultUnit,
	navigateTo,
	parseTagInput,
	showSuccess,
} from "@/shared/utils";

const loading = ref(true);
const saving = ref(false);
const error = ref("");
const search = ref("");
const items = ref<InventoryItem[]>([]);
const baseOptions = ref<BaseOptionGroups>({});
const editingId = ref("");
const form = ref({
	itemName: "",
	itemCode: "",
	categoryCode: "",
	unitCode: "",
	defaultLocationCode: "",
	defaultShelfLifeDays: "",
	minStockAlert: "0",
	tagInput: "",
	remark: "",
	isActive: true,
});

const categoryOptions = computed(() => baseOptions.value.category ?? EMPTY_OPTIONS);
const unitOptions = computed(() => baseOptions.value.unit ?? EMPTY_OPTIONS);
const locationOptions = computed(() => baseOptions.value.location ?? EMPTY_OPTIONS);

const categoryIndex = computed(() => {
	const index = categoryOptions.value.findIndex((option) => option.code === form.value.categoryCode);
	return index >= 0 ? index : 0;
});
const unitIndex = computed(() => {
	const index = unitOptions.value.findIndex((option) => option.code === form.value.unitCode);
	return index >= 0 ? index : 0;
});
const locationIndex = computed(() => {
	const index = locationOptions.value.findIndex(
		(option) => option.code === form.value.defaultLocationCode,
	);
	return index >= 0 ? index : 0;
});

function resetForm() {
	editingId.value = "";
	form.value = {
		itemName: "",
		itemCode: "",
		categoryCode: getDefaultCategory(baseOptions.value),
		unitCode: getDefaultUnit(baseOptions.value),
		defaultLocationCode: "",
		defaultShelfLifeDays: "",
		minStockAlert: "0",
		tagInput: "",
		remark: "",
		isActive: true,
	};
}

async function loadData(showToast = false) {
	error.value = "";
	try {
		const [baseOptionsResponse, itemsResponse] = await Promise.all([
			loadBaseOptions(),
			loadItems({
				search: search.value.trim(),
				pageSize: 200,
			}),
		]);
		baseOptions.value = baseOptionsResponse.data;
		items.value = itemsResponse.data.list;
		if (!form.value.categoryCode || !form.value.unitCode) {
			resetForm();
		}
		if (showToast) {
			showSuccess("物品数据已刷新");
		}
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载物品失败";
	} finally {
		loading.value = false;
	}
}

function startEdit(item: InventoryItem) {
	editingId.value = item.id;
	form.value = {
		itemName: item.name,
		itemCode: item.code ?? "",
		categoryCode: item.categoryCode,
		unitCode: item.unitCode,
		defaultLocationCode: item.defaultLocationCode ?? "",
		defaultShelfLifeDays:
			item.defaultShelfLifeDays === null ? "" : String(item.defaultShelfLifeDays),
		minStockAlert: String(item.minStockAlert),
		tagInput: item.tagNames.join(", "),
		remark: item.remark ?? "",
		isActive: item.isActive,
	};
	uni.pageScrollTo({ scrollTop: 0, duration: 200 });
}

async function submitItem() {
	if (!form.value.itemName.trim() || !form.value.categoryCode || !form.value.unitCode) {
		error.value = "请填写物品名称，并选择分类和单位";
		return;
	}

	saving.value = true;
	error.value = "";
	const payload = {
		itemName: form.value.itemName.trim(),
		itemCode: form.value.itemCode.trim() || undefined,
		categoryCode: form.value.categoryCode,
		unitCode: form.value.unitCode,
		defaultLocationCode: form.value.defaultLocationCode || undefined,
		defaultShelfLifeDays: form.value.defaultShelfLifeDays
			? Number.parseInt(form.value.defaultShelfLifeDays, 10)
			: undefined,
		minStockAlert: Number.parseFloat(form.value.minStockAlert || "0") || 0,
		tagNames: parseTagInput(form.value.tagInput),
		remark: form.value.remark.trim() || undefined,
		isActive: form.value.isActive,
	};

	try {
		if (editingId.value) {
			await requestJson<ApiResponse<{ id: string; updated: boolean }>>(`/api/items/${editingId.value}`, {
				method: "PATCH",
				data: payload,
			});
			showSuccess("物品已更新");
		} else {
			await requestJson<ApiResponse<{ id: string; created: boolean }>>("/api/items", {
				method: "POST",
				data: payload,
			});
			showSuccess("物品已创建");
		}
		resetForm();
		invalidateItems();
		await loadData(false);
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "保存物品失败";
	} finally {
		saving.value = false;
	}
}

async function removeItem(item: InventoryItem) {
	const confirmed = await confirmAction(`确定删除物品“${item.name}”吗？`);
	if (!confirmed) {
		return;
	}

	try {
		await requestJson<ApiResponse<{ id: string; deleted: boolean }>>(`/api/items/${item.id}`, {
			method: "DELETE",
		});
		showSuccess("物品已删除");
		if (editingId.value === item.id) {
			resetForm();
		}
		invalidateItems();
		await loadData(false);
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "删除物品失败";
	}
}

onShow(() => {
	void loadData(false);
});
</script>

<template>
	<PageLayout title="物品维护" sub-title="新增、编辑、停用和删除物品档案，并维护默认分类、单位、位置和标签。">
		<template #actions>
			<button class="button-secondary" @click="navigateTo('/pages/overview/index')">功能导航</button>
			<button class="button-primary" @click="loadData(true)">刷新列表</button>
		</template>

		<uni-notice-bar v-if="error" :text="error" type="error" :speed="0" />

		<uni-card title="搜索物品">
			<view class="stack-sm">
				<uni-easyinput v-model="search" placeholder="按物品名或编码搜索" />
				<button class="button-secondary" @click="loadData(false)">执行搜索</button>
			</view>
		</uni-card>

		<uni-card :title="editingId ? '编辑物品' : '新增物品'">
			<view class="form-grid">
				<view class="form-field">
					<text class="field-label">物品名称</text>
					<uni-easyinput v-model="form.itemName" placeholder="例如：牛奶 / 鸡蛋 / 洗衣液" />
				</view>
				<view class="form-field">
					<text class="field-label">物品编码</text>
					<uni-easyinput v-model="form.itemCode" placeholder="可选" />
				</view>
				<view class="form-field">
					<text class="field-label">分类</text>
					<picker
						:range="categoryOptions"
						range-key="name"
						:value="categoryIndex"
						@change="form.categoryCode = categoryOptions[$event.detail.value]?.code ?? ''"
					>
						<view class="picker-display" :class="{ placeholder: !form.categoryCode }">
							{{ findOptionName(categoryOptions, form.categoryCode || null) }}
						</view>
					</picker>
				</view>
				<view class="form-field">
					<text class="field-label">单位</text>
					<picker
						:range="unitOptions"
						range-key="name"
						:value="unitIndex"
						@change="form.unitCode = unitOptions[$event.detail.value]?.code ?? ''"
					>
						<view class="picker-display" :class="{ placeholder: !form.unitCode }">
							{{ findOptionName(unitOptions, form.unitCode || null) }}
						</view>
					</picker>
				</view>
				<view class="form-field">
					<text class="field-label">默认位置</text>
					<picker
						:range="locationOptions"
						range-key="name"
						:value="locationIndex"
						@change="form.defaultLocationCode = locationOptions[$event.detail.value]?.code ?? ''"
					>
						<view class="picker-display" :class="{ placeholder: !form.defaultLocationCode }">
							{{ form.defaultLocationCode ? findOptionName(locationOptions, form.defaultLocationCode) : "未设置" }}
						</view>
					</picker>
				</view>
				<view class="form-field">
					<text class="field-label">默认保质期（天）</text>
					<uni-easyinput v-model="form.defaultShelfLifeDays" type="number" placeholder="可选" />
				</view>
				<view class="form-field">
					<text class="field-label">最低库存提醒</text>
					<uni-easyinput v-model="form.minStockAlert" type="number" placeholder="0" />
				</view>
				<view class="form-field">
					<text class="field-label">标签</text>
					<uni-easyinput type="textarea" v-model="form.tagInput" placeholder="多个标签用逗号或换行分隔" />
				</view>
				<view class="form-field">
					<text class="field-label">备注</text>
					<uni-easyinput type="textarea" v-model="form.remark" placeholder="补充说明" />
				</view>
				<view class="row-wrap">
					<button
						:class="form.isActive ? 'button-primary' : 'button-secondary'"
						@click="form.isActive = true"
					>
						启用
					</button>
					<button
						:class="!form.isActive ? 'button-primary' : 'button-secondary'"
						@click="form.isActive = false"
					>
						停用
					</button>
				</view>
				<view class="inline-actions">
					<button class="button-primary" :loading="saving" @click="submitItem">
						{{ editingId ? "保存修改" : "新增物品" }}
					</button>
					<button class="button-secondary" @click="resetForm">重置</button>
				</view>
			</view>
		</uni-card>

		<uni-card title="物品列表">
			<view v-if="loading" class="empty-state">加载中...</view>
			<view v-else-if="items.length === 0" class="empty-state">暂无物品</view>
			<view v-else class="stack-sm">
				<view v-for="item in items" :key="item.id" class="list-row">
					<view class="stack-sm">
						<text class="item-title">{{ item.name }}</text>
						<text class="muted mono">{{ item.code || "未设置编码" }}</text>
						<text class="muted">
							{{ findOptionName(categoryOptions, item.categoryCode) }} ·
							{{ findOptionName(unitOptions, item.unitCode) }} ·
							{{ item.isActive ? "启用" : "停用" }}
						</text>
						<text class="muted">库存：{{ item.currentQuantity }} · 标签：{{ formatTags(item.tagNames) }}</text>
						<text v-if="item.remark" class="muted">{{ item.remark }}</text>
					</view>
					<view class="inline-actions">
						<button class="button-secondary" @click="startEdit(item)">编辑</button>
						<button class="button-danger" @click="removeItem(item)">删除</button>
					</view>
				</view>
			</view>
		</uni-card>
	</PageLayout>
</template>
