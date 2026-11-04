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

export const SEED_EXERCISES = STRENGTH.flatMap(([group, names]) => names.map((name, index) => ({
  id: `seed_${group}_${index}`,
  name,
  group,
  kind: 'strength',
  updatedAt: 0,
})));
