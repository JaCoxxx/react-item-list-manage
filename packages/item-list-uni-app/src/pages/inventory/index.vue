<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout.vue";
import { loadBaseOptions, invalidateItemDetail, invalidateItems, loadItemDetail, loadItems } from "@/shared/data";
import { requestJson } from "@/shared/api";
import { getPageLayoutMode } from "@/shared/storage";
import type {
	ApiResponse,
	BaseOptionGroups,
	ItemDetailResponse,
	InventoryItem,
	StockBatch,
} from "@/shared/types";
import {
	EMPTY_OPTIONS,
	findOptionName,
	formatTags,
	getDefaultOutboundReason,
	getLayoutClass,
	navigateTo,
	parseTagInput,
	showSuccess,
	todayDate,
} from "@/shared/utils";

const loading = ref(true);
const detailLoading = ref(false);
const error = ref("");
const savingStockIn = ref(false);
const savingStockOut = ref(false);
const savingBatch = ref(false);
const search = ref("");
const tagInput = ref("");
const categoryCode = ref("");
const locationCode = ref("");
const items = ref<InventoryItem[]>([]);
const baseOptions = ref<BaseOptionGroups>({});
const selectedItemId = ref("");
const detail = ref<ItemDetailResponse | null>(null);
const editingBatchId = ref("");
const layoutMode = ref(getPageLayoutMode());
const filterPopup = ref();
const stockInPopup = ref();
const stockOutPopup = ref();
const detailPopup = ref();

const stockInForm = ref({
	quantity: "1",
	movementDate: todayDate(),
	purchasedAt: todayDate(),
	productionDate: "",
	expiryDate: "",
	locationCode: "",
	supplier: "",
	unitPrice: "",
	note: "",
});

const stockOutForm = ref({
	quantity: "1",
	movementDate: todayDate(),
	reasonCode: "",
	locationCode: "",
	note: "",
});

const batchForm = ref({
	quantity: "",
	purchasedAt: "",
	productionDate: "",
	expiryDate: "",
	locationCode: "",
	supplier: "",
	unitPrice: "",
	note: "",
});

const categoryOptions = computed(() => baseOptions.value.category ?? EMPTY_OPTIONS);
const locationOptions = computed(() => baseOptions.value.location ?? EMPTY_OPTIONS);
const outboundReasonOptions = computed(() => baseOptions.value.outbound_reason ?? EMPTY_OPTIONS);
const unitOptions = computed(() => baseOptions.value.unit ?? EMPTY_OPTIONS);
const layoutClass = computed(() => getLayoutClass(layoutMode.value));
const selectedItem = computed(
	() => items.value.find((item) => item.id === selectedItemId.value) ?? detail.value?.item ?? null,
);

const categoryIndex = computed(() => {
	const index = categoryOptions.value.findIndex((option) => option.code === categoryCode.value);
	return index >= 0 ? index : 0;
});

const locationIndex = computed(() => {
	const index = locationOptions.value.findIndex((option) => option.code === locationCode.value);
	return index >= 0 ? index : 0;
});

async function loadData(showToast = false) {
	error.value = "";
	try {
		const [baseOptionsResponse, itemsResponse] = await Promise.all([
			loadBaseOptions(),
			loadItems({
				search: search.value.trim(),
				categoryCode: categoryCode.value || undefined,
				locationCode: locationCode.value || undefined,
				tagNames: parseTagInput(tagInput.value),
				pageSize: 200,
			}),
		]);
		baseOptions.value = baseOptionsResponse.data;
		items.value = itemsResponse.data.list;
		if (!stockOutForm.value.reasonCode) {
			stockOutForm.value.reasonCode = getDefaultOutboundReason(baseOptions.value);
		}
		if (selectedItemId.value) {
			await loadDetail(selectedItemId.value, false);
		}
		if (showToast) {
			showSuccess("库存已刷新");
		}
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载库存失败";
	} finally {
		loading.value = false;
	}
}

async function loadDetail(itemId: string, showToast = false) {
	detailLoading.value = true;
	try {
		const response = await loadItemDetail(itemId);
		selectedItemId.value = itemId;
		detail.value = response.data;
		if (!stockInForm.value.locationCode) {
			stockInForm.value.locationCode = response.data.item.defaultLocationCode ?? "";
		}
		if (!stockOutForm.value.locationCode) {
			stockOutForm.value.locationCode = response.data.item.defaultLocationCode ?? "";
		}
		if (showToast) {
			showSuccess("物品详情已刷新");
		}
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载物品详情失败";
	} finally {
		detailLoading.value = false;
	}
}

function selectItem(item: InventoryItem) {
	void loadDetail(item.id, false);
	detailPopup.value?.open();
}

function startEditBatch(batch: StockBatch) {
	editingBatchId.value = batch.id;
	batchForm.value = {
		quantity: String(batch.quantity),
		purchasedAt: batch.purchasedAt,
		productionDate: batch.productionDate ?? "",
		expiryDate: batch.expiryDate ?? "",
		locationCode: batch.locationCode ?? "",
		supplier: batch.supplier ?? "",
		unitPrice: batch.unitPrice === null ? "" : String(batch.unitPrice),
		note: batch.note ?? "",
	};
}

async function submitStockIn() {
	if (!selectedItemId.value) {
		error.value = "请先选择一个物品";
		return;
	}

	savingStockIn.value = true;
	error.value = "";
	try {
		await requestJson<ApiResponse<{ batchId: string }>>("/api/stock/in", {
			method: "POST",
			data: {
				itemId: selectedItemId.value,
				quantity: Number.parseFloat(stockInForm.value.quantity),
				movementDate: stockInForm.value.movementDate,
				purchasedAt: stockInForm.value.purchasedAt,
				productionDate: stockInForm.value.productionDate || undefined,
				expiryDate: stockInForm.value.expiryDate || undefined,
				locationCode: stockInForm.value.locationCode || undefined,
				supplier: stockInForm.value.supplier.trim() || undefined,
				unitPrice: stockInForm.value.unitPrice
					? Number.parseFloat(stockInForm.value.unitPrice)
					: undefined,
				note: stockInForm.value.note.trim() || undefined,
			},
		});
		showSuccess("已新增入库批次");
		invalidateItems();
		invalidateItemDetail(selectedItemId.value);
		await Promise.all([loadData(false), loadDetail(selectedItemId.value, false)]);
		stockInPopup.value?.close();
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "新增入库失败";
	} finally {
		savingStockIn.value = false;
	}
}

async function submitStockOut() {
	if (!selectedItemId.value) {
		error.value = "请先选择一个物品";
		return;
	}

	savingStockOut.value = true;
	error.value = "";
	try {
		await requestJson("/api/stock/out", {
			method: "POST",
			data: {
				itemId: selectedItemId.value,
				quantity: Number.parseFloat(stockOutForm.value.quantity),
				movementDate: stockOutForm.value.movementDate,
				reasonCode: stockOutForm.value.reasonCode,
				locationCode: stockOutForm.value.locationCode || undefined,
				note: stockOutForm.value.note.trim() || undefined,
			},
		});
		showSuccess("已完成出库");
		invalidateItems();
		invalidateItemDetail(selectedItemId.value);
		await Promise.all([loadData(false), loadDetail(selectedItemId.value, false)]);
		stockOutPopup.value?.close();
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "出库失败";
	} finally {
		savingStockOut.value = false;
	}
}

async function submitBatchEdit() {
	if (!editingBatchId.value || !selectedItemId.value) {
		error.value = "请先选择需要编辑的批次";
		return;
	}

	savingBatch.value = true;
	error.value = "";
	try {
		await requestJson<ApiResponse<{ batchId: string; updated: boolean }>>(
			`/api/stock/batches/${editingBatchId.value}`,
			{
				method: "PATCH",
				data: {
					quantity: Number.parseFloat(batchForm.value.quantity),
					purchasedAt: batchForm.value.purchasedAt,
					productionDate: batchForm.value.productionDate || undefined,
					expiryDate: batchForm.value.expiryDate || undefined,
					locationCode: batchForm.value.locationCode || undefined,
					supplier: batchForm.value.supplier.trim() || undefined,
					unitPrice: batchForm.value.unitPrice
						? Number.parseFloat(batchForm.value.unitPrice)
						: undefined,
					note: batchForm.value.note.trim() || undefined,
				},
			},
		);
		showSuccess("批次已更新");
		invalidateItemDetail(selectedItemId.value);
		await loadDetail(selectedItemId.value, false);
		editingBatchId.value = "";
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "编辑批次失败";
	} finally {
		savingBatch.value = false;
	}
}

function applyFilter() {
	filterPopup.value?.close();
	void loadData(false);
}

onShow(() => {
	layoutMode.value = getPageLayoutMode();
	void loadData(false);
});
</script>

<template>
	<PageLayout title="库存列表" subtitle="筛选库存、查看详情，并在手机端完成入库、出库和批次编辑。">
		<template #actions>
			<button class="button-secondary" @click="navigateTo('/pages/overview/index')">功能导航</button>
			<button class="button-secondary" @click="filterPopup?.open()">筛选</button>
			<button class="button-secondary" @click="stockInPopup?.open()">入库</button>
			<button class="button-secondary" @click="stockOutPopup?.open()">出库</button>
			<button class="button-primary" @click="loadData(true)">刷新</button>
		</template>

		<uni-notice-bar v-if="error" :text="error" type="error" :speed="0" />

		<uni-card title="库存列表" :is-shadow="true" padding="12">
			<view v-if="loading" class="muted">加载中...</view>
			<view v-else-if="items.length === 0" class="muted">暂无库存数据</view>
			<view v-else class="item-grid" :class="layoutClass">
				<view v-for="item in items" :key="item.id" class="item-card">
					<view class="stack-sm">
						<text class="item-title">{{ item.name }}</text>
						<text class="muted">库存：{{ item.currentQuantity }} {{ findOptionName(unitOptions, item.unitCode) }}</text>
						<text class="muted">标签：{{ formatTags(item.tagNames) }}</text>
						<text class="muted">
							到期：{{ item.nearestExpiryDate || "未设置" }} · 过期批次：{{ item.expiredBatchCount }}
						</text>
					</view>
					<button class="button-primary" style="margin-top: 16rpx" @click="selectItem(item)">查看详情</button>
				</view>
			</view>
		</uni-card>

		<uni-popup ref="filterPopup" type="bottom">
			<view class="popup-sheet">
				<view class="popup-head">
					<text class="popup-title">筛选条件</text>
					<text class="popup-close" @click="filterPopup?.close()">✕</text>
				</view>
				<scroll-view scroll-y class="popup-body">
					<view class="form-grid">
						<view class="form-field">
							<text class="field-label">关键字</text>
							<uni-easyinput v-model="search" placeholder="按名称或编码搜索" />
						</view>
						<view class="form-field">
							<text class="field-label">分类</text>
							<picker
								:range="categoryOptions"
								range-key="name"
								:value="categoryIndex"
								@change="categoryCode = categoryOptions[$event.detail.value]?.code ?? ''"
							>
								<view class="picker-display">{{ categoryCode ? findOptionName(categoryOptions, categoryCode) : "全部分类" }}</view>
							</picker>
						</view>
						<view class="form-field">
							<text class="field-label">默认位置</text>
							<picker
								:range="locationOptions"
								range-key="name"
								:value="locationIndex"
								@change="locationCode = locationOptions[$event.detail.value]?.code ?? ''"
							>
								<view class="picker-display">{{ locationCode ? findOptionName(locationOptions, locationCode) : "全部位置" }}</view>
							</picker>
						</view>
						<view class="form-field">
							<text class="field-label">标签</text>
							<uni-easyinput v-model="tagInput" placeholder="多个标签用逗号或换行分隔" />
						</view>
						<button class="button-primary" @click="applyFilter">应用筛选</button>
					</view>
				</scroll-view>
			</view>
		</uni-popup>

		<uni-popup ref="stockInPopup" type="bottom">
			<view class="popup-sheet">
				<view class="popup-head">
					<text class="popup-title">入库操作</text>
					<text class="popup-close" @click="stockInPopup?.close()">✕</text>
				</view>
				<scroll-view scroll-y class="popup-body">
					<view class="form-grid">
						<uni-notice-bar text="先从列表选择物品，再提交入库批次。" type="primary" :speed="0" />
						<text class="muted">当前物品：{{ selectedItem?.name || "未选择" }}</text>
						<view class="two-col">
							<uni-easyinput v-model="stockInForm.quantity" type="number" placeholder="数量" />
							<uni-easyinput v-model="stockInForm.purchasedAt" placeholder="采购日期 YYYY-MM-DD" />
						</view>
						<view class="two-col">
							<uni-easyinput v-model="stockInForm.movementDate" placeholder="入库日期 YYYY-MM-DD" />
							<uni-easyinput v-model="stockInForm.locationCode" placeholder="位置编码（可选）" />
						</view>
						<view class="two-col">
							<uni-easyinput v-model="stockInForm.productionDate" placeholder="生产日期 YYYY-MM-DD" />
							<uni-easyinput v-model="stockInForm.expiryDate" placeholder="到期日期 YYYY-MM-DD" />
						</view>
						<view class="two-col">
							<uni-easyinput v-model="stockInForm.supplier" placeholder="采购渠道" />
							<uni-easyinput v-model="stockInForm.unitPrice" type="number" placeholder="单价" />
						</view>
						<uni-easyinput type="textarea" v-model="stockInForm.note" placeholder="备注" />
						<button class="button-primary" :loading="savingStockIn" @click="submitStockIn">提交入库</button>
					</view>
				</scroll-view>
			</view>
		</uni-popup>

		<uni-popup ref="stockOutPopup" type="bottom">
			<view class="popup-sheet">
				<view class="popup-head">
					<text class="popup-title">出库操作</text>
					<text class="popup-close" @click="stockOutPopup?.close()">✕</text>
				</view>
				<scroll-view scroll-y class="popup-body">
					<view class="form-grid">
						<uni-notice-bar text="默认按 FEFO 规则消耗库存批次。" type="primary" :speed="0" />
						<text class="muted">当前物品：{{ selectedItem?.name || "未选择" }}</text>
						<view class="two-col">
							<uni-easyinput v-model="stockOutForm.quantity" type="number" placeholder="数量" />
							<uni-easyinput v-model="stockOutForm.movementDate" placeholder="出库日期 YYYY-MM-DD" />
						</view>
						<view class="form-field">
							<text class="field-label">出库原因</text>
							<picker
								:range="outboundReasonOptions"
								range-key="name"
								:value="outboundReasonOptions.findIndex((option) => option.code === stockOutForm.reasonCode)"
								@change="stockOutForm.reasonCode = outboundReasonOptions[$event.detail.value]?.code ?? ''"
							>
								<view class="picker-display">{{ stockOutForm.reasonCode ? findOptionName(outboundReasonOptions, stockOutForm.reasonCode) : "请选择原因" }}</view>
							</picker>
						</view>
						<uni-easyinput v-model="stockOutForm.locationCode" placeholder="限定位置编码（可选）" />
						<uni-easyinput type="textarea" v-model="stockOutForm.note" placeholder="备注" />
						<button class="button-primary" :loading="savingStockOut" @click="submitStockOut">提交出库</button>
					</view>
				</scroll-view>
			</view>
		</uni-popup>

		<uni-popup ref="detailPopup" type="bottom">
			<view class="popup-sheet">
				<view class="popup-head">
					<text class="popup-title">物品详情</text>
					<text class="popup-close" @click="detailPopup?.close()">✕</text>
				</view>
				<scroll-view scroll-y class="popup-body">
					<view v-if="detailLoading" class="muted">加载详情中...</view>
					<view v-else-if="!detail" class="muted">请先从库存列表选择一个物品</view>
					<view v-else class="stack-md">
						<uni-notice-bar
							:text="`${detail.item.name} · 当前库存 ${detail.item.currentQuantity} ${findOptionName(unitOptions, detail.item.unitCode)}`"
							type="primary"
							:speed="0"
						/>

						<text class="field-label">库存批次</text>
						<view v-if="detail.batches.length === 0" class="muted">暂无批次</view>
						<uni-list v-else>
							<uni-list-item
								v-for="batch in detail.batches"
								:key="batch.id"
								:title="`批次 ${batch.id.slice(0, 8)} · 剩余 ${batch.remainingQuantity}/${batch.quantity}`"
								:note="`采购 ${batch.purchasedAt} · 到期 ${batch.expiryDate || '未设置'} · 位置 ${batch.locationCode || '未设置'}`"
								clickable
								@click="startEditBatch(batch)"
							/>
						</uni-list>

						<view v-if="editingBatchId" class="stack-sm">
							<text class="field-label">批次编辑</text>
							<view class="form-grid">
								<uni-easyinput v-model="batchForm.quantity" type="number" placeholder="批次数量" />
								<uni-easyinput v-model="batchForm.purchasedAt" placeholder="采购日期 YYYY-MM-DD" />
								<uni-easyinput v-model="batchForm.productionDate" placeholder="生产日期 YYYY-MM-DD" />
								<uni-easyinput v-model="batchForm.expiryDate" placeholder="到期日期 YYYY-MM-DD" />
								<uni-easyinput v-model="batchForm.locationCode" placeholder="位置编码" />
								<uni-easyinput v-model="batchForm.supplier" placeholder="采购渠道" />
								<uni-easyinput v-model="batchForm.unitPrice" type="number" placeholder="单价" />
								<uni-easyinput type="textarea" v-model="batchForm.note" placeholder="备注" />
								<view class="row-wrap">
									<button class="button-primary" :loading="savingBatch" @click="submitBatchEdit">保存批次</button>
									<button class="button-secondary" @click="editingBatchId = ''">取消</button>
								</view>
							</view>
						</view>

						<text class="field-label">最近库存流水</text>
						<view v-if="detail.recentMovements.length === 0" class="muted">暂无库存流水</view>
						<uni-list v-else>
							<uni-list-item
								v-for="movement in detail.recentMovements"
								:key="movement.id"
								:title="`${movement.movementType} · ${movement.quantity}`"
								:note="`${movement.movementDate} · 原因：${movement.reasonCode || '入库/未设置'}${movement.note ? ' · ' + movement.note : ''}`"
							/>
						</uni-list>
					</view>
				</scroll-view>
			</view>
		</uni-popup>
	</PageLayout>
</template>
