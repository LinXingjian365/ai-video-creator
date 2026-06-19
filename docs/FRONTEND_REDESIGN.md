# 前端优化设计方案 — 对标大厂(Linear / Vercel / Stripe 控制台)

> 目标:把当前「AI 视频增长控制台」从"功能堆叠、视觉偏乱、霓虹过曝"升级为大厂级专业 SaaS 控制台:**信息密度高但呼吸克制、表面安静、强调精准排版而非装饰**。基准:Linear(密度+精准)、Vercel(克制留白)、Stripe(数据清晰)。

## 一、当前问题诊断(对标差距)

| 维度 | 现状 | 大厂标准 | 差距 |
|---|---|---|---|
| 配色 | 青/品红双霓虹 + 发光 | 单一克制强调色,语义色仅用于状态 | 霓虹过曝、强调色滥用、缺"安静表面" |
| 层级 | 卡片叠卡片靠发光/边框 | 表面阶梯(surface ladder)+ 1px 发丝线,零阴影 | 深度靠 blur/glow,不够干净 |
| 排版 | 字号跳跃、缺统一刻度 | 严格 type scale + 负字距 display | 标题/正文/标签层级不够清晰 |
| 密度 | 面板留白不均、信息散 | 高密度但对齐精准(Linear 招牌) | 信息利用率低、视线跳 |
| 状态 | 文字 + 杂色 | 8px 语义实心圆点,统一 pill | 状态表达不一致 |
| 导航 | 01-06 + 辅助,badge 杂 | 清晰分组 + 当前态强指示 | 可用但层级感弱 |

## 二、设计令牌(Design Tokens)

**配色(深色专业,单一强调色)**
```
canvas        #0a0b0d   最深背景
surface-1     #111315   卡片/面板
surface-2     #16181b   嵌套卡片
surface-3     #1b1e22   更深嵌套
hairline      #24272c   1px 主分隔线(替代所有阴影)
hairline-2    #33373d   强分隔线
ink           #f5f7fa   主文字
ink-muted     #c4cad4   次要文字
ink-subtle    #868d99   占位/三级
ink-faint     #5b626d   最弱标签
accent        #6366f1   品牌/CTA/焦点环(仅功能,不装饰)
accent-hover  #818cf8
success #22c55e  warn #f59e0b  danger #ef4444  info #38bdf8
```
> 关键变更:**砍掉双霓虹发光**,改单一靛蓝强调色;语义色(成功/警告/危险/信息)只用于状态点和结果卡左边框。

**字体刻度(Sora 标题 + IBM Plex Mono 数据,负字距)**
```
display-lg  44/600/1.1/-1.4px   首屏大标题
display-md  32/600/1.15/-1.0px
title-lg    22/600/1.25/-0.4px  面板标题
title-md    16/600/1.4/-0.2px   卡片标题
body-md     14/400/1.55         正文
body-sm     13/400/1.5          次要
caption     11/600/0.6px/大写   分组标签/字段名
mono-data   IBM Plex Mono 用于数字/ID/路径/状态值
```

**几何 / 间距**
```
radius: card 10 · button 8 · input 8 · chip 6 · modal 14
border: 永远 1px hairline,卡片零 drop-shadow(深度靠 surface 阶梯)
spacing 节奏: 4 8 12 16 24 32 48 64
焦点环: 2px accent + 2px offset
hover: 150ms ease,表面提亮一阶(surface-1→2)
状态点: 8px 实心圆 + 语义色,绝不用 icon 表状态
```

## 三、布局优化(三栏 → 精炼三栏)

**整体**:左导航(220px,可折叠到 64px 图标态)+ 中工作区(流式 max-width 闭合)+ 右情报栏(300px)。

1. **左导航**
   - 顶部品牌行(logo + 产品名,title-md)
   - 分组标签用 caption 大写(创作主线 / 辅助),组内 8 项垂直列表,**当前项 = ink 文字 + 左侧 2px accent 竖条 + accent 圆点**,非当前 = ink-subtle
   - 移除花哨 badge,序号用 mono caption(01–06 / ··)
   - 底部工作区折叠区(4 个路径,次要)
   - 整列 surface-1,右侧 1px hairline

2. **中工作区**
   - **Stage Hero**:左 stage 名(caption 大写 mono)+ 大标题(display-md)+ 一行描述(ink-muted)+ proof chips(surface-2,1px hairline,不发光);右 primary CTA(accent 实心,44px)
   - 表单区:字段名 caption 大写在上、输入 44px 高、1px hairline、focus 2px accent 环;同类字段两列网格对齐
   - 结果区:统一「结果卡」组件(surface-2,左 3px 语义边框,title-md + body-sm + mono code),替代当前各异的结果块

3. **右情报栏(任务监控)**
   - 顶部一个**大数字 KPI**(display-md,任务总数)+ 环境就绪折叠
   - 工作区资产:横向计数 pills(全部/视频/分析/计划)
   - 最近任务:**1px hairline 分隔的密集列表**(非盒装卡),每行:类型(mono caption)· 时间 · 状态点 + 状态词;失败行左 2px danger
   - 自检结果接入(复用全链路自检的四态)

## 四、组件规范(统一,消除"乱")

- **Pill/Tag**:6px 圆角,surface-2,1px hairline,caption;状态 pill 用语义色淡背景(ok/warn/down/unconfigured 四态已落地)
- **Button**:primary(accent 实心)/ secondary(surface-2 + hairline)/ tertiary(纯文字 ink-muted);统一 44px、8px 圆角、150ms hover
- **Card**:surface-1/2,1px hairline,10px 圆角,16–24px padding,零阴影
- **Input/Select**:44px,8px 圆角,hairline,focus accent 环,label 在上
- **状态点**:8px 实心圆 + 语义色,行内对齐
- **数据/数字/ID/路径**:一律 IBM Plex Mono

## 五、动效与可达性

- hover 150ms 表面提亮一阶;focus 2px accent 环 + offset;过渡仅 background/border,不动布局
- 触控目标 ≥44px;对比度满足 WCAG AA(ink/canvas ≈ 16:1)
- 状态不靠颜色单独传达(点 + 文字双编码)
- 键盘可达:导航项 Tab 可达,焦点环清晰

## 六、落地优先级

1. **令牌层**:重写 `globals.css` 的 `:root`(配色去霓虹 + type scale + spacing),其余样式引用变量 → 最大杠杆,改一处全站变
2. **组件层**:统一 Button / Card / Pill / Input / 结果卡 / 状态点
3. **布局层**:左导航当前态指示、Stage Hero、右情报栏密集列表
4. **细节**:mono 用于所有数据、proof chips 去发光、移除多余说明文字

---

本方案对应的可视稿:Stitch(优化主屏)+ Figma(设计系统/主屏)。Stitch 链接见对话;Figma 视座位权限而定。
