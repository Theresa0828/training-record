// Common strength exercises to start from. The teacher edits this list inside the app.
// Pilates exercises come from the teacher's own handout through 動作庫 > 匯入講義. The handout is never stored in this folder.
const STRENGTH = [
  ['下肢', ['深蹲', '高腳杯深蹲', '前蹲舉', '箱上深蹲', '硬舉', '羅馬尼亞硬舉', '相撲硬舉', '六角槓硬舉', '分腿蹲', '保加利亞分腿蹲', '弓箭步', '後跨弓箭步', '登階', '腿推', '腿伸屈', '腿彎舉', '臀推', '橋式', '單腿橋式', '提踵', '側向弓箭步', '蚌殼式']],
  ['胸', ['臥推', '啞鈴臥推', '上斜臥推', '上斜啞鈴臥推', '伏地挺身', '夾胸機', '繩索夾胸']],
  ['背', ['滑輪下拉', '引體向上', '輔助引體向上', '坐姿划船', '槓鈴划船', '單臂啞鈴划船', 'TRX 划船', '直臂下拉', '背伸展']],
  ['肩', ['肩推', '啞鈴肩推', '側平舉', '前平舉', '反向飛鳥', '面拉', '肩外旋', '肩內旋']],
  ['手臂', ['二頭彎舉', '錘式彎舉', '三頭下壓', '過頭三頭伸展']],
  ['核心', ['棒式', '側棒式', '死蟲式', '鳥狗式', '捲腹', '抗旋轉推舉', '農夫走路', '懸吊抬腿']],
];

// First suggestions for the 替代動作 menu. The teacher can change them, and swaps made in class are learned.
const ALTERNATIVES = {
  深蹲: ['腿推', '高腳杯深蹲', '箱上深蹲', '臀推'],
  高腳杯深蹲: ['箱上深蹲', '腿推', '深蹲'],
  前蹲舉: ['高腳杯深蹲', '深蹲', '腿推'],
  箱上深蹲: ['高腳杯深蹲', '腿推', '橋式'],
  硬舉: ['羅馬尼亞硬舉', '六角槓硬舉', '臀推', '橋式'],
  羅馬尼亞硬舉: ['臀推', '腿彎舉', '橋式'],
  相撲硬舉: ['六角槓硬舉', '臀推'],
  六角槓硬舉: ['羅馬尼亞硬舉', '腿推'],
  分腿蹲: ['登階', '腿推', '後跨弓箭步'],
  保加利亞分腿蹲: ['分腿蹲', '登階', '腿推'],
  弓箭步: ['後跨弓箭步', '分腿蹲', '登階'],
  後跨弓箭步: ['分腿蹲', '登階', '腿推'],
  登階: ['分腿蹲', '腿推'],
  腿推: ['高腳杯深蹲', '箱上深蹲', '腿伸屈'],
  腿伸屈: ['腿推', '箱上深蹲'],
  腿彎舉: ['羅馬尼亞硬舉', '橋式', '單腿橋式'],
  臀推: ['橋式', '單腿橋式', '羅馬尼亞硬舉'],
  橋式: ['臀推', '單腿橋式', '蚌殼式'],
  臥推: ['啞鈴臥推', '夾胸機', '伏地挺身'],
  啞鈴臥推: ['夾胸機', '伏地挺身', '繩索夾胸'],
  上斜臥推: ['上斜啞鈴臥推', '夾胸機'],
  上斜啞鈴臥推: ['夾胸機', '伏地挺身'],
  伏地挺身: ['夾胸機', '啞鈴臥推'],
  滑輪下拉: ['輔助引體向上', '直臂下拉', '坐姿划船'],
  引體向上: ['輔助引體向上', '滑輪下拉'],
  坐姿划船: ['單臂啞鈴划船', 'TRX 划船', '槓鈴划船'],
  槓鈴划船: ['坐姿划船', '單臂啞鈴划船'],
  單臂啞鈴划船: ['坐姿划船', 'TRX 划船'],
  肩推: ['啞鈴肩推', '側平舉', '面拉'],
  啞鈴肩推: ['側平舉', '面拉'],
  棒式: ['死蟲式', '側棒式', '鳥狗式'],
  捲腹: ['死蟲式', '棒式'],
};

// The teacher removed these on 2026-11-05: most were the same movement on other equipment, which is now chosen per exercise.
// They stay in the list above because an exercise's id comes from its position, and old records point at those ids.
const REMOVED = new Set(['腿伸屈', '腿彎舉', '錘式彎舉', '肩內旋', '肩外旋', '啞鈴肩推', '背伸展', '單臂啞鈴划船', '輔助引體向上', '側棒式', '捲腹', '棒式', '懸吊抬腿', '上斜啞鈴臥推', '夾胸機', '啞鈴臥推', '繩索夾胸']);

// Each built-in exercise's category, direction, sides and main muscles (2026-11-24, docs/重訓動作分類.md section 2).
// [categories (first is the main one), direction, sides, muscles]. The removed ones are here too, for old records.
const STRENGTH_TAGS = {
  深蹲: ['蹲類', '', '雙側', '股四頭肌 臀肌'],
  高腳杯深蹲: ['蹲類', '', '雙側', '股四頭肌 臀肌'],
  前蹲舉: ['蹲類', '', '雙側', '股四頭肌 臀肌 腹肌'],
  箱上深蹲: ['蹲類', '', '雙側', '股四頭肌 臀肌'],
  腿推: ['蹲類', '', '雙側', '股四頭肌 臀肌'],
  分腿蹲: ['蹲類', '', '單側', '股四頭肌 臀肌'],
  保加利亞分腿蹲: ['蹲類', '', '單側', '股四頭肌 臀肌'],
  弓箭步: ['蹲類', '', '雙側', '股四頭肌 臀肌'],
  後跨弓箭步: ['蹲類', '', '雙側', '臀肌 股四頭肌'],
  登階: ['蹲類', '', '單側', '股四頭肌 臀肌'],
  側向弓箭步: ['蹲類', '', '雙側', '內收肌 股四頭肌 臀肌'],
  硬舉: ['硬舉類', '', '雙側', '臀肌 腿後肌 背伸肌'],
  羅馬尼亞硬舉: ['硬舉類', '', '雙側', '腿後肌 臀肌'],
  相撲硬舉: ['硬舉類', '', '雙側', '臀肌 內收肌 腿後肌'],
  六角槓硬舉: ['硬舉類', '', '雙側', '臀肌 股四頭肌 腿後肌'],
  臥推: ['上肢推', '水平', '雙側', '胸肌 三頭肌 三角肌'],
  上斜臥推: ['上肢推', '水平', '雙側', '胸肌 三角肌 三頭肌'],
  伏地挺身: ['上肢推 核心', '水平', '雙側', '胸肌 三頭肌 腹肌'],
  肩推: ['上肢推', '垂直', '雙側', '三角肌 三頭肌'],
  側平舉: ['上肢推', '垂直', '雙側', '三角肌'],
  前平舉: ['上肢推', '垂直', '雙側', '三角肌'],
  三頭下壓: ['上肢推', '', '雙側', '三頭肌'],
  過頭三頭伸展: ['上肢推', '', '雙側', '三頭肌'],
  滑輪下拉: ['上肢拉', '垂直', '雙側', '闊背肌 二頭肌'],
  引體向上: ['上肢拉', '垂直', '雙側', '闊背肌 二頭肌'],
  直臂下拉: ['上肢拉', '垂直', '雙側', '闊背肌'],
  坐姿划船: ['上肢拉', '水平', '雙側', '闊背肌 肩胛肌群 二頭肌'],
  槓鈴划船: ['上肢拉', '水平', '雙側', '闊背肌 肩胛肌群 背伸肌'],
  'TRX 划船': ['上肢拉', '水平', '雙側', '肩胛肌群 闊背肌 二頭肌'],
  反向飛鳥: ['上肢拉', '水平', '雙側', '三角肌 肩胛肌群'],
  面拉: ['上肢拉', '水平', '雙側', '三角肌 旋轉肌袖 肩胛肌群'],
  二頭彎舉: ['上肢拉', '', '雙側', '二頭肌'],
  死蟲式: ['核心', '', '雙側', '腹肌'],
  鳥狗式: ['核心', '', '雙側', '背伸肌 臀肌 腹肌'],
  抗旋轉推舉: ['核心', '', '單側', '腹斜肌 腹肌'],
  農夫走路: ['核心', '', '雙側', '腹斜肌 肩胛肌群'],
  臀推: ['其他', '', '雙側', '臀肌 腿後肌'],
  橋式: ['其他', '', '雙側', '臀肌 腿後肌'],
  單腿橋式: ['其他', '', '單側', '臀肌 腿後肌'],
  提踵: ['其他', '', '雙側', '小腿肌'],
  蚌殼式: ['其他', '', '單側', '髖外展肌'],
  // Removed 2026-11-05; only old records still point at them.
  腿伸屈: ['其他', '', '雙側', '股四頭肌'],
  腿彎舉: ['其他', '', '雙側', '腿後肌'],
  錘式彎舉: ['上肢拉', '', '雙側', '二頭肌'],
  肩內旋: ['其他', '', '單側', '旋轉肌袖'],
  肩外旋: ['其他', '', '單側', '旋轉肌袖'],
  啞鈴肩推: ['上肢推', '垂直', '雙側', '三角肌 三頭肌'],
  背伸展: ['其他', '', '雙側', '背伸肌'],
  單臂啞鈴划船: ['上肢拉', '水平', '單側', '闊背肌 肩胛肌群'],
  輔助引體向上: ['上肢拉', '垂直', '雙側', '闊背肌 二頭肌'],
  側棒式: ['核心', '', '單側', '腹斜肌'],
  捲腹: ['核心', '', '雙側', '腹肌'],
  棒式: ['核心', '', '雙側', '腹肌'],
  懸吊抬腿: ['核心', '', '雙側', '腹肌 髖屈肌'],
  上斜啞鈴臥推: ['上肢推', '水平', '雙側', '胸肌 三角肌 三頭肌'],
  夾胸機: ['上肢推', '水平', '雙側', '胸肌'],
  啞鈴臥推: ['上肢推', '水平', '雙側', '胸肌 三頭肌'],
  繩索夾胸: ['上肢推', '水平', '雙側', '胸肌'],
};

function tagsOf(name) {
  const entry = STRENGTH_TAGS[name];
  if (!entry) return undefined;
  const [patterns, plane, side, muscles] = entry;
  return { patterns: patterns.split(' '), plane, side, muscles: muscles.split(' ') };
}

// English names people also use, so a search finds them either way.
const ALIASES = {
  深蹲: ['Squat'], 硬舉: ['Deadlift'], 腿推: ['Leg Press'], 腿伸屈: ['Leg Extension'], 腿彎舉: ['Leg Curl'], 臀推: ['Hip Thrust'],
  臥推: ['Bench Press'], 滑輪下拉: ['Lat Pulldown'], 坐姿划船: ['Seated Row'], 肩推: ['Shoulder Press'], 側平舉: ['Lateral Raise'], 面拉: ['Face Pull'],
};

const idOf = new Map(STRENGTH.flatMap(([group, names]) => names.map((name, index) => [name, `seed_${group}_${index}`])));

const ALL_SEEDS = STRENGTH.flatMap(([group, names]) => names.map((name) => ({
  id: idOf.get(name),
  name,
  group,
  kind: 'strength',
  aliases: ALIASES[name] || [],
  alternatives: (ALTERNATIVES[name] || []).filter((other) => !REMOVED.has(other)).map((other) => idOf.get(other)).filter(Boolean),
  tags: tagsOf(name),
  updatedAt: 0,
})));

export const SEED_EXERCISES = ALL_SEEDS.filter((exercise) => !REMOVED.has(exercise.name));
/** The built-in classification by exercise id. A stored copy the teacher has not re-classified takes these (store.js). */
export const SEED_TAGS = new Map(ALL_SEEDS.filter((exercise) => exercise.tags).map((exercise) => [exercise.id, exercise.tags]));
/** Kept only so old records can still find their body part. Never offered in a list. */
export const REMOVED_SEEDS = ALL_SEEDS.filter((exercise) => REMOVED.has(exercise.name)).map((exercise) => ({ ...exercise, deleted: true }));
