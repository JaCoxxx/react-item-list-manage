export type HeaderTitleAlign = 'left' | 'center' | 'right'

// auto: 有页面栈时返回；直接进入的非首页页面显示首页入口；back/home/none: 强制
export type HeaderBackMode = 'auto' | 'back' | 'home' | 'none'

export type HeaderAction = {
  text: string
  onClick?: () => void
}
