<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout.vue";
import { invalidateBaseOptions, loadBaseOptions } from "@/shared/data";
import { requestJson } from "@/shared/api";
import type { ApiResponse, BaseOption, BaseOptionGroups } from "@/shared/types";
import { confirmAction, displayTypeName, navigateTo, showSuccess } from "@/shared/utils";

type OptionType = "category" | "location" | "unit" | "outbound_reason";

const optionTypes: OptionType[] = ["category", "location", "unit", "outbound_reason"];

const loading = ref(true);
const saving = ref(false);
const error = ref("");
const baseOptions = ref<BaseOptionGroups>({});
const currentType = ref<OptionType>("category");
const editingOptionId = ref("");
const form = ref({
	optionCode: "",
	optionName: "",
	sortOrder: "0",
	remark: "",
	isActive: true,
});

const currentOptions = computed(() => baseOptions.value[currentType.value] ?? []);

async function loadData(showToast = false) {
	error.value = "";
	try {
		const response = await loadBaseOptions(true);
		baseOptions.value = response.data;
		if (showToast) {
			showSuccess("基础数据已刷新");
		}
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载基础数据失败";
	} finally {
		loading.value = false;
	}
}

function resetForm() {
	editingOptionId.value = "";
	form.value = {
		optionCode: "",
		optionName: "",
		sortOrder: "0",
		remark: "",
		isActive: true,
	};
}

function startEdit(option: BaseOption) {
	currentType.value = option.type as OptionType;
	editingOptionId.value = option.id;
	form.value = {
		optionCode: option.code,
		optionName: option.name,
		sortOrder: String(option.sortOrder),
		remark: option.remark ?? "",
		isActive: option.isActive,
	};
}

async function submitOption() {
	if (!form.value.optionCode.trim() || !form.value.optionName.trim()) {
		error.value = "编码和名称不能为空";
		return;
	}

	saving.value = true;
	error.value = "";
	const payload = {
		optionType: currentType.value,
		optionCode: form.value.optionCode.trim(),
		optionName: form.value.optionName.trim(),
		sortOrder: Number.parseInt(form.value.sortOrder, 10) || 0,
		remark: form.value.remark.trim() || undefined,
		isActive: form.value.isActive,
	};

	try {
		if (editingOptionId.value) {
			await requestJson<ApiResponse<{ id: string; updated: boolean }>>(
				`/api/base-options/${currentType.value}/${editingOptionId.value}`,
				{
					method: "PATCH",
					data: {
						optionCode: payload.optionCode,
						optionName: payload.optionName,
						sortOrder: payload.sortOrder,
						remark: payload.remark,
						isActive: payload.isActive,
					},
				},
			);
			showSuccess("基础数据已更新");
		} else {
			await requestJson<ApiResponse<{ id: string; created: boolean }>>("/api/base-options", {
				method: "POST",
				data: payload,
			});
			showSuccess("基础数据已创建");
		}
		resetForm();
		invalidateBaseOptions();
		await loadData(false);
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "保存基础数据失败";
	} finally {
		saving.value = false;
	}
}

async function removeOption(option: BaseOption) {
	const confirmed = await confirmAction(`确定删除 ${option.name}（${option.code}）吗？`);
	if (!confirmed) {
		return;
	}

	try {
		await requestJson<ApiResponse<{ id: string; deleted: boolean }>>(
			`/api/base-options/${option.type}/${option.id}`,
			{
				method: "DELETE",
			},
		);
		showSuccess("基础数据已删除");
		if (editingOptionId.value === option.id) {
			resetForm();
		}
		invalidateBaseOptions();
		await loadData(false);
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "删除基础数据失败";
	}
}

onShow(() => {
	void loadData(false);
});
</script>

<template>
	<PageLayout title="基础数据" sub-title="维护分类、位置、单位和出库原因。">
		<template #actions>
			<button class="button-secondary" @click="navigateTo('/pages/overview/index')">功能导航</button>
			<button class="button-primary" @click="loadData(true)">刷新列表</button>
		</template>

		<uni-notice-bar v-if="error" :text="error" type="error" :speed="0" />

		<uni-card title="数据类型">
			<view class="row-wrap">
				<button
					v-for="type in optionTypes"
					:key="type"
					:class="currentType === type ? 'button-primary' : 'button-secondary'"
					@click="currentType = type"
				>
					{{ displayTypeName(type) }}
				</button>
			</view>
		</uni-card>

		<uni-card :title="editingOptionId ? `编辑${displayTypeName(currentType)}` : `新增${displayTypeName(currentType)}`">
			<view class="form-grid">
				<view class="form-field">
					<text class="field-label">编码</text>
					<uni-easyinput v-model="form.optionCode" placeholder="例如：food / freezer / consume" />
				</view>
				<view class="form-field">
					<text class="field-label">名称</text>
					<uni-easyinput v-model="form.optionName" placeholder="请输入显示名称" />
				</view>
				<view class="form-field">
					<text class="field-label">排序</text>
					<uni-easyinput v-model="form.sortOrder" type="number" placeholder="0" />
				</view>
				<view class="form-field">
					<text class="field-label">备注</text>
					<uni-easyinput type="textarea" v-model="form.remark" placeholder="可选备注" />
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
					<button class="button-primary" :loading="saving" @click="submitOption">
						{{ editingOptionId ? "保存修改" : "新增数据" }}
					</button>
					<button class="button-secondary" @click="resetForm">重置</button>
				</view>
			</view>
		</uni-card>

		<uni-card :title="`${displayTypeName(currentType)}列表`">
			<view v-if="loading" class="empty-state">加载中...</view>
			<view v-else-if="currentOptions.length === 0" class="empty-state">暂无数据</view>
			<view v-else class="stack-sm">
				<view v-for="option in currentOptions" :key="option.id" class="list-row">
					<view class="stack-sm">
						<text class="item-title">{{ option.name }}</text>
						<text class="muted mono">{{ option.code }}</text>
						<text class="muted">
							排序：{{ option.sortOrder }} · 状态：{{ option.isActive ? "启用" : "停用" }}
						</text>
						<text v-if="option.remark" class="muted">{{ option.remark }}</text>
					</view>
					<view class="inline-actions">
						<button class="button-secondary" @click="startEdit(option)">编辑</button>
						<button class="button-danger" @click="removeOption(option)">删除</button>
					</view>
				</view>
			</view>
		</uni-card>
	</PageLayout>
</template>
