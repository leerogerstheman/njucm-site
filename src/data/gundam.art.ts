/**
 * 封面线稿 · 手写的机械体矢量图
 *
 * 数据库没有商品照片可用（版权原因，也因为站点本来就是零外部素材），
 * 所以每条记录都配一张"产品海报"：同一套线稿，按记录的系列配色上色，
 * 再叠上技术图纸式的标注。线稿本身只有四个图层，主色、副色、点缀色与暗部，
 * 换成任何一套配色都不会失真。
 *
 * 画布统一是 240 × 300，封面组件负责缩放与定位。
 */

export type ArtLayer = 'main' | 'sub' | 'trim' | 'dark';

export interface ArtShape {
  d: string;
  fill: ArtLayer;
}

export type ArtViewId = 'front' | 'side' | 'rear' | 'head';

export interface ArtView {
  id: ArtViewId;
  label: string;
  shapes: ArtShape[];
}

/* 正面 --------------------------------------------------------------------- */
const FRONT: ArtShape[] = [
  { d: 'M92 58 L148 58 L152 104 L88 104 Z', fill: 'sub' },
  { d: 'M95 48 L103 48 L101 60 L97 60 Z', fill: 'trim' },
  { d: 'M145 48 L137 48 L139 60 L143 60 Z', fill: 'trim' },
  { d: 'M78 92 L99 95 L99 126 L80 123 Z', fill: 'sub' },
  { d: 'M162 92 L141 95 L141 126 L160 123 Z', fill: 'sub' },
  { d: 'M74 124 L100 126 L100 158 L76 155 Z', fill: 'main' },
  { d: 'M166 124 L140 126 L140 158 L164 155 Z', fill: 'main' },
  { d: 'M79 156 L98 157 L96 169 L81 168 Z', fill: 'sub' },
  { d: 'M161 156 L142 157 L144 169 L159 168 Z', fill: 'sub' },
  { d: 'M104 160 L119 160 L117 200 L103 200 Z', fill: 'main' },
  { d: 'M136 160 L121 160 L123 200 L137 200 Z', fill: 'main' },
  { d: 'M101 200 L116 200 L114 246 L100 246 Z', fill: 'main' },
  { d: 'M139 200 L124 200 L126 246 L140 246 Z', fill: 'main' },
  { d: 'M103 197 L117 197 L116 206 L103 206 Z', fill: 'trim' },
  { d: 'M137 197 L123 197 L124 206 L137 206 Z', fill: 'trim' },
  { d: 'M96 244 L116 244 L121 262 L90 262 Z', fill: 'trim' },
  { d: 'M144 244 L124 244 L119 262 L150 262 Z', fill: 'trim' },
  { d: 'M103 64 L137 64 L141 86 L147 120 L93 120 L99 86 Z', fill: 'main' },
  { d: 'M107 76 L117 76 L117 88 L107 88 Z', fill: 'trim' },
  { d: 'M133 76 L123 76 L123 88 L133 88 Z', fill: 'trim' },
  { d: 'M107 61 L133 61 L136 70 L104 70 Z', fill: 'sub' },
  { d: 'M107 118 L133 118 L132 138 L108 138 Z', fill: 'sub' },
  { d: 'M100 138 L140 138 L145 166 L113 166 Z', fill: 'main' },
  { d: 'M92 140 L100 140 L97 164 L87 160 Z', fill: 'sub' },
  { d: 'M148 140 L140 140 L143 164 L153 160 Z', fill: 'sub' },
  { d: 'M66 60 L104 66 L100 100 L64 94 Z', fill: 'main' },
  { d: 'M174 60 L136 66 L140 100 L176 94 Z', fill: 'main' },
  { d: 'M66 60 L104 66 L103 74 L65 68 Z', fill: 'trim' },
  { d: 'M174 60 L136 66 L137 74 L175 68 Z', fill: 'trim' },
  { d: 'M113 55 L127 55 L127 64 L113 64 Z', fill: 'sub' },
  { d: 'M104 28 L136 28 L139 40 L135 54 L105 54 L101 40 Z', fill: 'main' },
  { d: 'M106 35 L134 35 L134 45 L106 45 Z', fill: 'trim' },
  { d: 'M109 37 L117 37 L117 42 L109 42 Z', fill: 'dark' },
  { d: 'M131 37 L123 37 L123 42 L131 42 Z', fill: 'dark' },
  { d: 'M108 49 L132 49 L128 57 L112 57 Z', fill: 'sub' },
  { d: 'M110 30 L96 13 L85 19 L104 36 Z', fill: 'trim' },
  { d: 'M130 30 L144 13 L155 19 L136 36 Z', fill: 'trim' },
  { d: 'M168 84 L179 84 L179 192 L168 192 Z', fill: 'sub' },
  { d: 'M171 70 L176 70 L176 86 L171 86 Z', fill: 'sub' },
];

/* 侧面 --------------------------------------------------------------------- */
const SIDE: ArtShape[] = [
  { d: 'M96 60 L112 58 L110 114 L92 118 Z', fill: 'sub' },
  { d: 'M90 54 L97 54 L97 76 L90 76 Z', fill: 'trim' },
  { d: 'M106 26 L134 26 L140 40 L134 55 L104 53 L102 36 Z', fill: 'main' },
  { d: 'M103 35 L121 35 L119 45 L103 45 Z', fill: 'trim' },
  { d: 'M105 37 L114 37 L114 42 L105 42 Z', fill: 'dark' },
  { d: 'M108 28 L86 17 L82 26 L104 37 Z', fill: 'trim' },
  { d: 'M108 49 L132 49 L126 58 L112 57 Z', fill: 'sub' },
  { d: 'M114 54 L126 54 L126 64 L114 64 Z', fill: 'sub' },
  { d: 'M112 64 L138 62 L145 96 L139 121 L106 119 L105 88 Z', fill: 'main' },
  { d: 'M111 74 L124 74 L124 86 L111 86 Z', fill: 'trim' },
  { d: 'M120 66 L153 61 L157 86 L124 93 Z', fill: 'main' },
  { d: 'M120 66 L153 61 L154 69 L121 74 Z', fill: 'trim' },
  { d: 'M131 93 L149 90 L147 118 L133 121 Z', fill: 'sub' },
  { d: 'M129 119 L149 116 L147 151 L131 154 Z', fill: 'main' },
  { d: 'M131 152 L147 149 L145 163 L133 165 Z', fill: 'sub' },
  { d: 'M111 118 L138 118 L136 139 L113 139 Z', fill: 'sub' },
  { d: 'M105 139 L139 139 L143 167 L111 167 Z', fill: 'main' },
  { d: 'M111 164 L133 164 L129 204 L112 204 Z', fill: 'main' },
  { d: 'M111 199 L131 199 L130 208 L112 208 Z', fill: 'trim' },
  { d: 'M110 203 L130 203 L132 248 L112 248 Z', fill: 'main' },
  { d: 'M96 246 L134 246 L142 264 L92 264 Z', fill: 'trim' },
  { d: 'M96 60 L105 60 L105 198 L96 198 Z', fill: 'sub' },
  { d: 'M97 48 L103 48 L103 62 L97 62 Z', fill: 'sub' },
];

/* 背面 --------------------------------------------------------------------- */
const REAR: ArtShape[] = [
  { d: 'M84 56 L156 56 L162 114 L78 114 Z', fill: 'sub' },
  { d: 'M92 44 L100 44 L98 60 L94 60 Z', fill: 'trim' },
  { d: 'M148 44 L140 44 L142 60 L146 60 Z', fill: 'trim' },
  { d: 'M100 68 L140 68 L140 74 L100 74 Z', fill: 'trim' },
  { d: 'M102 82 L138 82 L138 88 L102 88 Z', fill: 'trim' },
  { d: 'M104 96 L136 96 L136 102 L104 102 Z', fill: 'trim' },
  { d: 'M80 66 L88 66 L92 116 L84 116 Z', fill: 'trim' },
  { d: 'M160 66 L152 66 L148 116 L156 116 Z', fill: 'trim' },
  { d: 'M64 62 L104 68 L100 100 L62 94 Z', fill: 'main' },
  { d: 'M176 62 L136 68 L140 100 L178 94 Z', fill: 'main' },
  { d: 'M64 62 L104 68 L103 76 L63 70 Z', fill: 'trim' },
  { d: 'M176 62 L136 68 L137 76 L177 70 Z', fill: 'trim' },
  { d: 'M76 96 L96 98 L96 126 L78 124 Z', fill: 'sub' },
  { d: 'M164 96 L144 98 L144 126 L162 124 Z', fill: 'sub' },
  { d: 'M74 124 L98 126 L98 158 L76 156 Z', fill: 'main' },
  { d: 'M166 124 L142 126 L142 158 L164 156 Z', fill: 'main' },
  { d: 'M79 156 L96 157 L95 169 L81 168 Z', fill: 'sub' },
  { d: 'M161 156 L144 157 L145 169 L159 168 Z', fill: 'sub' },
  { d: 'M106 27 L134 27 L137 40 L132 55 L108 55 L103 40 Z', fill: 'main' },
  { d: 'M104 42 L136 42 L136 48 L104 48 Z', fill: 'sub' },
  { d: 'M110 29 L97 12 L86 18 L105 35 Z', fill: 'trim' },
  { d: 'M130 29 L143 12 L154 18 L135 35 Z', fill: 'trim' },
  { d: 'M103 66 L137 66 L141 88 L147 121 L93 121 L99 88 Z', fill: 'main' },
  { d: 'M107 119 L133 119 L132 139 L108 139 Z', fill: 'sub' },
  { d: 'M100 139 L140 139 L145 167 L113 167 Z', fill: 'main' },
  { d: 'M92 141 L100 141 L97 165 L87 161 Z', fill: 'sub' },
  { d: 'M148 141 L140 141 L143 165 L153 161 Z', fill: 'sub' },
  { d: 'M104 161 L119 161 L117 201 L103 201 Z', fill: 'main' },
  { d: 'M136 161 L121 161 L123 201 L137 201 Z', fill: 'main' },
  { d: 'M101 201 L116 201 L114 247 L100 247 Z', fill: 'main' },
  { d: 'M139 201 L124 201 L126 247 L140 247 Z', fill: 'main' },
  { d: 'M103 198 L117 198 L116 207 L103 207 Z', fill: 'trim' },
  { d: 'M137 198 L123 198 L124 207 L137 207 Z', fill: 'trim' },
  { d: 'M96 245 L116 245 L121 263 L90 263 Z', fill: 'trim' },
  { d: 'M144 245 L124 245 L119 263 L150 263 Z', fill: 'trim' },
];

/* 头部特写 ----------------------------------------------------------------- */
const HEAD: ArtShape[] = [
  { d: 'M62 92 L178 92 L194 140 L178 202 L62 202 L46 140 Z', fill: 'main' },
  { d: 'M80 128 L160 128 L156 188 L84 188 Z', fill: 'sub' },
  { d: 'M76 124 L164 124 L164 154 L76 154 Z', fill: 'trim' },
  { d: 'M86 131 L112 131 L112 146 L86 146 Z', fill: 'dark' },
  { d: 'M154 131 L128 131 L128 146 L154 146 Z', fill: 'dark' },
  { d: 'M104 166 L136 166 L136 176 L104 176 Z', fill: 'dark' },
  { d: 'M92 200 L148 200 L138 224 L102 224 Z', fill: 'sub' },
  { d: 'M70 160 L82 160 L82 182 L70 182 Z', fill: 'trim' },
  { d: 'M170 160 L158 160 L158 182 L170 182 Z', fill: 'trim' },
  { d: 'M86 98 L42 26 L20 42 L74 110 Z', fill: 'trim' },
  { d: 'M154 98 L198 26 L220 42 L166 110 Z', fill: 'trim' },
  { d: 'M104 90 L136 90 L136 100 L104 100 Z', fill: 'sub' },
];

export const ART_VIEWS: ArtView[] = [
  { id: 'front', label: '正面', shapes: FRONT },
  { id: 'side', label: '侧面', shapes: SIDE },
  { id: 'rear', label: '背面', shapes: REAR },
  { id: 'head', label: '头部', shapes: HEAD },
];

const ART_MAP = new Map(ART_VIEWS.map((v) => [v.id, v]));

export function artView(id: ArtViewId): ArtView {
  return ART_MAP.get(id) ?? ART_MAP.get('front')!;
}

/**
 * 由条目 id 推出的一个小整数，用来给每张封面一点差异：
 * 光晕的位置、标注的角度、角标的数量。
 */
export function artSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
