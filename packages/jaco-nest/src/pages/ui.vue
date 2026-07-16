<script setup lang="ts">
const keyword = ref('')
const comboxValue = ref('')
const numberValue = ref(2)
const checkboxValue = ref(['design'])
const selectValue = ref('design')
const segmentIndex = ref(0)
const rateValue = ref(3)
const page = ref(1)
const favChecked = ref(false)
const popup = ref<{ open: (type?: string) => void, close: () => void }>()

const optionList = [
  { text: '设计', value: 'design' },
  { text: '开发', value: 'develop' },
  { text: '验收', value: 'verify' },
]

const tableRows = [
  { name: '主题变量', status: '已接入' },
  { name: '组件回归', status: '进行中' },
]

function changePage(event: { current: number }) {
  page.value = event.current
}

function changeSegment(event: { currentIndex: number }) {
  segmentIndex.value = event.currentIndex
}
</script>

<template>
  <JnPageLayout title="uni-ui 主题回归" back-mode="auto">
    <view class="flex flex-col gap-[24rpx] pb-[80rpx]">
      <text class="text-[24rpx] jn-text-tertiary">
        切换主题后，以下组件的文字、表面、边框、状态色与遮罩均应同步更新。
      </text>

      <uni-notice-bar text="主题变量已覆盖 uni_modules 内的颜色默认值。" show-icon />

      <view class="jn-card p-[24rpx] flex flex-col gap-[20rpx]">
        <uni-section title="状态与内容展示" type="line" />
        <view class="flex flex-wrap gap-[16rpx]">
          <uni-tag text="主要" type="primary" />
          <uni-tag text="成功" type="success" />
          <uni-tag text="警告" type="warning" />
          <uni-tag text="错误" type="error" />
          <uni-tag text="默认" type="default" />
          <uni-badge text="99+" type="primary" />
          <uni-badge text="新" type="success" />
          <uni-badge text="5" type="error" />
          <uni-fav :checked="favChecked" @click="favChecked = !favChecked" />
        </view>
        <uni-card title="uni-card 标题" extra="更多">
          <text class="jn-text-primary">卡片、标题、辅助文字和分隔线会跟随当前主题。</text>
        </uni-card>
        <uni-list>
          <uni-list-item title="列表项一" note="副标题" show-arrow />
          <uni-list-item title="列表项二" note="状态色与箭头" right-text="已完成" />
        </uni-list>
        <uni-steps :options="[{ title: '需求', desc: '' }, { title: '开发', desc: '' }, { title: '验收', desc: '' }]" :active="1" />
      </view>

      <view class="jn-card p-[24rpx] flex flex-col gap-[20rpx]">
        <uni-section title="输入与选择" type="line" />
        <uni-search-bar v-model="keyword" placeholder="搜索组件" />
        <uni-easyinput v-model="keyword" placeholder="请输入主题名称" prefix-icon="search" />
        <uni-combox v-model="comboxValue" label="候选" :candidates="['晨雾青绿', '深海蓝紫', '曜石黑金']" />
        <uni-number-box v-model="numberValue" />
        <uni-data-checkbox v-model="checkboxValue" multiple :localdata="optionList" />
        <uni-data-select v-model="selectValue" :localdata="optionList" />
        <uni-segmented-control :current="segmentIndex" :values="['日', '周', '月']" @click-item="changeSegment" />
        <view class="flex items-center gap-[20rpx]">
          <text class="jn-text-secondary">评分</text>
          <uni-rate v-model="rateValue" />
        </view>
      </view>

      <view class="jn-card p-[24rpx] flex flex-col gap-[20rpx]">
        <uni-section title="数据与日期" type="line" />
        <uni-pagination :current="page" :total="50" show-icon @change="changePage" />
        <uni-table border stripe empty-text="暂无数据">
          <uni-tr>
            <uni-th>项目</uni-th>
            <uni-th>状态</uni-th>
          </uni-tr>
          <uni-tr v-for="row in tableRows" :key="row.name">
            <uni-td>{{ row.name }}</uni-td>
            <uni-td>{{ row.status }}</uni-td>
          </uni-tr>
        </uni-table>
        <uni-datetime-picker type="date" />
        <uni-calendar :insert="true" />
      </view>

      <view class="jn-card p-[24rpx] flex flex-col gap-[20rpx]">
        <uni-section title="容器、浮层与其他控件" type="line" />
        <uni-collapse>
          <uni-collapse-item title="展开查看主题说明">
            <text class="jn-text-secondary">浮层蒙版、折叠容器与提示信息也使用主题变量。</text>
          </uni-collapse-item>
        </uni-collapse>
        <uni-grid :column="3" :show-border="true">
          <uni-grid-item>
            <view class="grid-item"><uni-icons type="color" size="24" /><text>主题</text></view>
          </uni-grid-item>
          <uni-grid-item>
            <view class="grid-item"><uni-icons type="gear" size="24" /><text>配置</text></view>
          </uni-grid-item>
          <uni-grid-item>
            <view class="grid-item"><uni-icons type="checkbox-filled" size="24" /><text>验证</text></view>
          </uni-grid-item>
        </uni-grid>
        <uni-countdown :show-day="false" :hour="1" :minute="8" :second="20" />
        <view class="flex items-center gap-[20rpx]">
          <uni-link href="https://uniapp.dcloud.net.cn/component/uniui/uni-ui.html" text="uni-ui 文档" />
          <uni-button class="jn-ui-button-demo" size="mini" type="primary" @click="popup?.open('center')">打开主题浮层</uni-button>
        </view>
      </view>
    </view>

    <uni-popup ref="popup" type="center">
      <view class="jn-card popup-content">
        <view class="popup-heading">
          <view class="flex flex-col gap-[8rpx]">
            <text class="popup-title">主题浮层</text>
            <text class="popup-kicker">THEME LAYER</text>
          </view>
          <view class="popup-close i-carbon-close" @click="popup?.close()" />
        </view>
        <view class="popup-divider" />
        <text class="jn-text-secondary">遮罩、卡片和文字都应跟随当前主题。</text>
      </view>
    </uni-popup>
  </JnPageLayout>
</template>

<style lang="scss" scoped>
.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx;
  color: var(--jn-color-text-secondary);
}

.popup-content {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  width: 560rpx;
  padding: 40rpx;
}

.popup-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.popup-title {
  color: var(--jn-color-text-primary);
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1.2;
}

.popup-kicker {
  color: var(--jn-color-text-tertiary);
  font-size: 18rpx;
  letter-spacing: 3rpx;
  line-height: 1;
}

.popup-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  color: var(--jn-color-text-secondary);
  border: 1rpx solid var(--jn-color-border);
  border-radius: 50%;
  font-size: 28rpx;
}

.popup-divider {
  height: 1rpx;
  background: var(--jn-color-divider);
}
</style>
