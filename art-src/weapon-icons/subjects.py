# 武器分類 → 生圖主體。每個分類一張圖，以第一個子分類為代表。
# (id, 分類, 子分類, 英文主體描述, 是否為兵器)
SUBJECTS = [
    ("01_jian", "單劍", "佩劍、長劍、短劍、道劍、寶劍",
     "a single Chinese straight double-edged jian sword with scabbard-less blade, round pommel, cross guard", True),
    ("02_shuangjian", "雙劍", "雌雄雙股劍、雙劍",
     "a pair of two Chinese straight jian swords crossed in an X", True),
    ("03_dao", "單刀", "單刀、短刀、寶刀、大刀、九環大刀、截頭大刀",
     "a single Chinese dao saber, single-edged gently curved blade, round guard", True),
    ("04_shuangdao", "雙刀", "日月雙刀、雙短刀",
     "a pair of two Chinese curved dao sabers crossed in an X", True),
    ("05_yanyuedao", "長柄刀", "青龍偃月刀、偃月刀、三尖刀、三尖兩刃刀",
     "a Chinese guandao, long pole weapon with a large crescent moon shaped curved blade on top, dragon head guard", True),
    ("06_qiang", "長槍矛", "長槍、長矛、蛇矛、馬槊、雙頭馬槊",
     "a Chinese long spear, slender pole with a leaf-shaped spearhead", True),
    ("07_shuangmao", "雙槍矛", "丈八雙矛",
     "a pair of two long Chinese spears crossed in an X", True),
    ("08_ji", "戟鉤", "長戟、方天畫戟、十字戟、雙鐵戟、雙鉤",
     "a Chinese ji halberd, long pole with a spear point and one side blade forming a cross shape", True),
    ("09_dafu", "斧鉞", "大斧、開山斧、雙鉞",
     "a Chinese great battle axe, long handle with a huge broad crescent axe blade", True),
    ("10_langyabang", "錘棒", "狼牙棒、骨朵、鐵椎、流星錘、鐵鞭",
     "a Chinese wolf-tooth mace, long club with a thick cylindrical head covered in iron spikes", True),
    ("11_gong", "弓", "長弓、寶弓、騎弓",
     "a Chinese recurve bow with bowstring, elegant curved limbs", True),
    ("12_liannu", "弩", "連弩、強弩、大黃弩",
     "a Chinese repeating crossbow, zhuge nu, with a rectangular bolt magazine box on top and a lever", True),
    ("13_dun", "盾牌", "鐵盾、牙門盾、大盾、刀盾組",
     "one round Chinese iron shield lying flat seen straight from the front, a circular shield with a tiger face emblem in the center and a riveted rim, nothing passes through or behind it", True),
    ("14_yushan", "扇", "羽扇、雙扇",
     "a Chinese white crane feather fan with a short wooden handle", False),
    ("15_guqin", "樂器", "古琴、胡笳、玉笛",
     "a Chinese guqin zither, long flat wooden string instrument with seven strings", False),
    ("16_maobi", "文房器具", "毛筆、竹簡、算籌、棋盤、笏板、戒尺",
     "one single Chinese calligraphy brush lying diagonally, bamboo handle with a hanging loop and a pointed black ink-dipped tip, only one brush", False),
    ("17_jiujiezhang", "法杖拐杖", "九節杖、獸骨杖、鐵索杖、鳩杖、拐杖",
     "a Chinese nine-segment staff, long staff with nine bamboo-like joints", False),
    ("18_fuchen", "拂塵旗幡", "拂塵、幡旗",
     "a Chinese taoist horsetail whisk fly brush, short handle with long white horsehair strands", False),
    ("19_feidao", "暗器", "飛刀、短刺簪、銀針",
     "three small Chinese flying knives fanned out, each a short leaf-shaped steel blade with a short wrapped grip, a ring pommel and a red silk tassel, no pole", True),
    ("20_jiuhu", "容器法器", "毒酒壺、藥葫蘆、藥箱",
     "an ancient Chinese bronze wine pot ewer with a spout and lid", False),
    ("21_yuxi", "印璽占卜", "傳國玉璽、龜甲",
     "the Chinese imperial heirloom seal carved from pale green-white jade, square jade block with a coiled dragon knob carved on top, red seal cord, jade green color not gold", False),
    ("22_nianzhu", "念珠", "念珠",
     "a buddhist prayer bead necklace, circular string of round wooden beads with a tassel", False),
]

# 使用者提供的正向 prompt；Z-Image Turbo 以 cfg 1 取樣，負向 prompt 不起作用，
# 所以把負向條目改寫成正向 prompt 末尾的「避免」句。
POSITIVE = (
    "flat vector illustration, 2D game item icon, {kind}, Chinese Three Kingdoms style, "
    "{name}, {single}, centered composition, {orient}"
    "clean bold outlines, simple geometric shapes, flat colors, limited color palette, "
    "solid color blocks, minimal cel shading, simplified details, elegant Chinese design, "
    "clear recognizable silhouette, {accent}consistent line thickness, "
    "isolated object, plain light background, professional board game asset, "
    "no perspective distortion."
)

AVOID = (
    " Avoid: photorealistic, realistic rendering, 3D render, complex background, scenery, "
    "human, character, hands, holding the object, {multi}overly detailed, intricate decorations, "
    "heavy textures, gradients, dramatic lighting, glowing effects, magic particles, blurry, "
    "low quality, deformed shape, cropped object, text, watermark, logo, frame."
)


def prompts(zh, subject, is_weapon):
    noun = "weapon" if is_weapon else "item"
    group = "pair of" in subject or "three small" in subject or "few long" in subject
    single = f"full {noun}s visible" if group else f"single {noun}, full {noun} visible"
    # 盾牌斜放時模型會替它加一根桿子，所以盾牌改用正面
    diagonal = (is_weapon and "shield" not in subject) or "staff" in subject or "flute" in subject
    orient = "diagonal orientation, " if diagonal else "front view, upright, "
    accent = "red tassel, subtle gold accents, " if diagonal else "subtle red and gold accents, "
    pos = POSITIVE.format(kind=f"ancient Chinese fantasy {noun}", name=f"{zh} ({subject})",
                          single=single, orient=orient, accent=accent)
    multi = "" if group else f"multiple {noun}s, duplicate blades, "
    if not diagonal:
        multi += "pole, rod, stick through the object, "
    return pos + AVOID.format(multi=multi)
