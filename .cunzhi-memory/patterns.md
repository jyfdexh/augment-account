# 常用模式和最佳实践

- 在 augment-manager.html 实现了“赛博风”主题切换：
- 新增 Cyberpunk 主题（body.theme-cyber），通过 CSS 变量与特效覆盖实现，不改业务逻辑。
- 顶部导航加入 #nav-theme 按钮，点击在“简约”与“赛博风”之间切换，并动态更新按钮文案。
- 使用 localStorage 键 ui_theme 持久化主题（值：'default' 或 'cyber'），页面初始化时自动应用。
- 赛博风主题增强：在 body.theme-cyber 下新增动态特效，不改业务逻辑。
- 粒子网络 Canvas 背景（自适应尺寸、requestAnimationFrame、鼠标视差、可停用）
- 渐变视差（通过 CSS 变量 --g1x/--g1y/--g2x/--g2y）
- 霓虹脉冲动画（主头部与状态卡片）
- 按钮流光高光（hover 时流动高光带）
- 标题轻量故障动画（.glitch）
- 主题切换时自动 start/stop 效果并释放监听器
- 为每个账号凭证框添加详情按钮，弹出显示完整凭证信息（id/email/tenant/token/subToken），其中subToken需要加上https://portal.withorb.com/view?token=前缀并可点击跳转
