// Common strength exercises to start from. The teacher edits this list inside the app.
// Pilates exercises come from the teacher's own data through 動作庫 > 批次匯入.
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

// English names people also use, so a search finds them either way.
const ALIASES = {
  深蹲: ['Squat'], 硬舉: ['Deadlift'], 腿推: ['Leg Press'], 腿伸屈: ['Leg Extension'], 腿彎舉: ['Leg Curl'], 臀推: ['Hip Thrust'],
  臥推: ['Bench Press'], 滑輪下拉: ['Lat Pulldown'], 坐姿划船: ['Seated Row'], 肩推: ['Shoulder Press'], 側平舉: ['Lateral Raise'], 面拉: ['Face Pull'],
};

const idOf = new Map(STRENGTH.flatMap(([group, names]) => names.map((name, index) => [name, `seed_${group}_${index}`])));

export const SEED_EXERCISES = STRENGTH.flatMap(([group, names]) => names.map((name) => ({
  id: idOf.get(name),
  name,
  group,
  kind: 'strength',
  aliases: ALIASES[name] || [],
  alternatives: (ALTERNATIVES[name] || []).map((other) => idOf.get(other)).filter(Boolean),
  updatedAt: 0,
})));
