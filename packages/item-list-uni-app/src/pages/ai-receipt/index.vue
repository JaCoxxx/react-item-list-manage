<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout.vue";
import { chooseSingleImage, uploadImage } from "@/shared/api";
import { loadBaseOptions, invalidateItems, loadItems } from "@/shared/data";
import { importReceiptItems } from "@/shared/receipt";
import { getAiProvider, setAiProvider } from "@/shared/storage";
import type { AiProvider, BaseOptionGroups, InventoryItem, OcrReceiptResult } from "@/shared/types";
import {
	getDefaultCategory,
	getDefaultLocation,
	getDefaultUnit,
	navigateTo,
	previewImage,
	showSuccess,
} from "@/shared/utils";

const provider = ref<AiProvider>(getAiProvider());
const loading = ref(true);
const uploading = ref(false);
const importing = ref(false);
const error = ref("");
const imagePath = ref("");
const result = ref<OcrReceiptResult | null>(null);
const baseOptions = ref<BaseOptionGroups>({});
const items = ref<InventoryItem[]>([]);
const importForm = ref({
	categoryCode: "",
	unitCode: "",
	locationCode: "",
});

async function loadData() {
	try {
		const [baseOptionsResponse, itemsResponse] = await Promise.all([
			loadBaseOptions(),
			loadItems({ pageSize: 200, isActive: true }),
		]);
		baseOptions.value = baseOptionsResponse.data;
		items.value = itemsResponse.data.list;
		if (!importForm.value.categoryCode) {
			importForm.value.categoryCode = getDefaultCategory(baseOptions.value);
			importForm.value.unitCode = getDefaultUnit(baseOptions.value);
			importForm.value.locationCode = getDefaultLocation(baseOptions.value);
		}
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载 AI 小票依赖失败";
	} finally {
		loading.value = false;
	}
}

async function selectImage() {
	error.value = "";
	try {
		imagePath.value = await chooseSingleImage();
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "选择图片失败";
	}
}

async function submitRecognition() {
	if (!imagePath.value) {
		error.value = "请先选择图片";
		return;
	}

	uploading.value = true;
	error.value = "";
	try {
		const response = await uploadImage<{ data: OcrReceiptResult }>(
			"/api/ocr/openai/receipt",
			imagePath.value,
			{ provider: provider.value },
		);
		result.value = response.data;
		setAiProvider(provider.value);
		showSuccess("AI 小票识别完成");
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "AI 小票识别失败";
	} finally {
		uploading.value = false;
	}
}

async function importResult() {
	if (!result.value) {
		error.value = "暂无可导入的识别结果";
		return;
	}

	importing.value = true;
	error.value = "";
	try {
		const importedNames = await importReceiptItems({
			itemLines: result.value.itemLines,
			items: items.value,
			baseOptions: baseOptions.value,
			categoryCode: importForm.value.categoryCode,
			unitCode: importForm.value.unitCode,
			locationCode: importForm.value.locationCode,
		});
		showSuccess(`已导入 ${importedNames.length} 个识别商品`);
		invalidateItems();
		const itemsResponse = await loadItems({ pageSize: 200, isActive: true }, true);
		items.value = itemsResponse.data.list;
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "导入识别结果失败";
	} finally {
		importing.value = false;
	}
}

onShow(() => {
	provider.value = getAiProvider();
	void loadData();
});
</script>

<template>
	<PageLayout title="AI 小票" sub-title="上传图片到 GPT / DeepSeek 小票识别接口，并把结果导入库存。">
		<template #actions>
			<button class="button-secondary" @click="navigateTo('/pages/overview/index')">功能导航</button>
			<button class="button-primary" @click="submitRecognition" :loading="uploading">开始识别</button>
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

		<uni-card title="上传图片">
			<view class="stack-sm">
				<button class="button-secondary" @click="selectImage">选择图片</button>
				<uni-notice-bar v-if="imagePath" :text="`已选择图片，点击预览：${imagePath}`" type="primary" :speed="0" @click="previewImage(imagePath)" />
			</view>
		</uni-card>

		<uni-card title="导入默认配置">
			<view v-if="loading" class="empty-state">加载中...</view>
			<view v-else class="form-grid">
				<uni-easyinput v-model="importForm.categoryCode" placeholder="默认分类编码" />
				<uni-easyinput v-model="importForm.unitCode" placeholder="默认单位编码" />
				<uni-easyinput v-model="importForm.locationCode" placeholder="默认位置编码（可选）" />
				<button class="button-primary" :loading="importing" @click="importResult">导入识别商品</button>
			</view>
		</uni-card>

		<uni-card title="识别结果">
			<view v-if="!result" class="empty-state">暂无识别结果</view>
			<view v-else class="stack-md">
				<uni-notice-bar :text="`提供商：${result.provider} · 模型：${result.model} · 商品行数：${result.itemLines.length}`" type="success" :speed="0" />
				<uni-card title="字段信息">
					<view v-if="result.fieldLines.length === 0" class="empty-state">未识别到字段信息</view>
					<view v-else class="stack-sm">
						<view v-for="fieldLine in result.fieldLines" :key="fieldLine.id" class="list-row">
							<text class="item-title">{{ fieldLine.label }}</text>
							<text class="muted">{{ fieldLine.value }}</text>
						</view>
					</view>
				</uni-card>
				<uni-card title="商品明细">
					<view v-if="result.itemLines.length === 0" class="empty-state">未识别到商品行</view>
					<view v-else class="stack-sm">
						<view v-for="itemLine in result.itemLines" :key="itemLine.id" class="list-row">
							<text class="item-title">{{ itemLine.product || "未识别商品名" }}</text>
							<text class="muted">
								数量：{{ itemLine.quantity || "--" }} · 单价：{{ itemLine.unitPrice || "--" }} · 小计：{{ itemLine.subtotalAmount || "--" }}
							</text>
						</view>
					</view>
				</uni-card>
			</view>
		</uni-card>
	</PageLayout>
</template>
