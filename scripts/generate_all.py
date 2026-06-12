#!/usr/bin/env python3
"""
generate_all.py — 从 tag_schema.json 生成所有派生文件
单一真源 → 一次生成 → 零漂移
"""

import json, os, sys

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), 'tag_schema.json')
WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'web', 'app', 'api', 'interpret')

with open(SCHEMA_PATH) as f:
    schema = json.load(f)

generated = []

# ═══════════════════════════════════════
# 1. 生成 prompt.txt
# ═══════════════════════════════════════
def generate_prompt():
    cats = schema['categories']
    mods = schema['modifiers']
    valids = schema['validations']
    domain = schema['domain_knowledge']
    
    # Collect all unique tags
    all_tags = set()
    for c in cats:
        if c['tag'] not in all_tags:
            all_tags.add(c['tag'])
    for m in mods:
        if m['action'] == 'add' and 'tag' in m:
            all_tags.add(m['tag'])
    for m in mods:
        if m['action'] == 'strip' and 'exclude_tags' in m:
            for t in m['exclude_tags']:
                all_tags.add(t)
    
    # Add known param tags
    param_tags = ['Vin_1.2V','Vin_1.8V','Vin_2.5V','Vin_3.3V','Vin_5V','Vin_12V','Vin_24V','Vin_36V','Vin_48V',
                  'Vout_0.6V','Vout_0.8V','Vout_1.2V','Vout_1.8V','Vout_2.5V','Vout_3.3V','Vout_5V',
                  'Iout_0.5A','Iout_1A','Iout_2A','Iout_3A','Iout_4A','Iout_5A','Iout_6A','Iout_7A','Iout_8A','Iout_10A','Iout_12A',
                  '1Mbps','2Mbps','5Mbps','10Mbps','20Mbps','50Mbps','100Mbps','150Mbps','200Mbps',
                  '1通道','2通道','4通道','8通道','16通道','32通道',
                  '8bit','10bit','12bit','14bit','16bit','18bit','20bit','24bit',
                  '1:1','2:1','4:1','8:1','1T1R','2T2R','3T5R','1T0R','2T1R','4T0R']
    for t in param_tags:
        all_tags.add(t)
    
    tags_str = ', '.join(sorted(all_tags))
    
    # Build few-shot examples from domain knowledge
    synonyms = domain.get('synonyms', {})
    
    prompt = f"""== 可用标签（自动同步自 tag_schema.json） ==
{tags_str}

== 领域规则 ==
- CAN→CAN-FD; LIN→LIN; RS-232/485→对应标签; SBC→SBC
- RS-232/485的收发数: X发Y收→输出XTYR格式标签
- RS-485的工作模式: 半双工/全双工→对应标签
- 隔离产品: 用户说"隔离"不加kV→用通用"隔离"标签; 明确说5kV/3kV才加对应kVrms
- 非隔离/不隔离→不加隔离标签
- 栅极驱动: 隔离/非隔离、通道数、峰值驱动电流(A)
- 电流传感器: 隔离/非隔离、量程、精度
- 运放: Vos/GBW/通道数/轨到轨/低噪声
- LDO/DCDC: 输入电压/输出电压/输出电流
- ADC/DAC: 分辨率/通道数/采样率/接口
- 数字隔离器: 通道数(F/R)、数据速率(Mbps)、隔离电压(kVrms)
- 以太网: 百兆/千兆/2.5G + 接口类型 + 端口数

== 「非隔离」修饰符 ==
「非隔离」是需求修饰词，不是否定词。非隔离 + [品类] → 输出[品类]标签，不加隔离标签。
适用所有品类：RS-485/CAN/I2C/电流传感器/栅极驱动/运放 等。

== 已知同义词 ==
"""
    for key, val in synonyms.items():
        prompt += f"- {key} → {val['tag']} ({val.get('context','')})\n"
    
    prompt += """
== Few-shot 示例 ==
Q: CAN FD 车规 低功耗唤醒
A: {"features":["CAN-FD","车规AEC-Q100","低功耗唤醒"],"vendor":null,"category_hint":"接口","explanation":"CAN FD车规收发器需要低功耗唤醒特性","confidence":"high"}

Q: 隔离 RS-485 高速 20Mbps
A: {"features":["隔离","RS-485","20Mbps"],"vendor":null,"category_hint":"隔离接口","explanation":"隔离RS-485收发器，20Mbps高速","confidence":"high"}

Q: 低压 LDO 5V 1A
A: {"features":["LDO","Vout_5V","Iout_1A"],"vendor":null,"category_hint":"电源","explanation":"低压LDO，5V输出1A","confidence":"high"}

Q: 非隔离 RS-485
A: {"features":["RS-485"],"vendor":null,"category_hint":"接口","explanation":"非隔离RS-485收发器，无需隔离功能","confidence":"high"}

Q: 非隔离 CAN 车规
A: {"features":["CAN-FD","车规AEC-Q100"],"vendor":null,"category_hint":"接口","explanation":"非隔离CAN FD车规收发器","confidence":"high"}
"""
    
    prompt_path = os.path.join(WEB_DIR, 'prompt.txt')
    with open(prompt_path, 'w') as f:
        f.write(prompt)
    return prompt_path

# ═══════════════════════════════════════
# 2. 生成 wiki/ 知识库
# ═══════════════════════════════════════
def generate_wiki():
    wiki_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'wiki')
    os.makedirs(wiki_dir, exist_ok=True)
    
    domain = schema['domain_knowledge']
    
    # Main index
    index = f"""# ChipSelect 知识库

> 自动生成自 tag_schema.json v{schema['version']}
> 最后更新: 由 generate_all.py 生成

## 快速导航

- [同义词映射](synonyms.md) — 跨厂商/跨语言术语对应
- [已知陷阱](traps.md) — 曾导致错误的坑
- [标签体系](tags.md) — 所有标签及含义
- [跨厂商参数映射](vendor_params.md) — 不同厂商参数名对照
"""
    with open(os.path.join(wiki_dir, 'index.md'), 'w') as f:
        f.write(index)
    
    # Synonyms
    syn = "# 同义词映射\n\n"
    for key, val in domain.get('synonyms', {}).items():
        syn += f"| {key} | {val['tag']} | {val.get('context','-')} | {val.get('standard','-')} |\n"
    syn = "| 原文 | 标准标签 | 上下文 | 标准引用 |\n|------|----------|--------|----------|\n" + syn
    with open(os.path.join(wiki_dir, 'synonyms.md'), 'w') as f:
        f.write(syn)
    
    # Known traps
    traps = "# 已知陷阱\n\n"
    for t in domain.get('known_traps', []):
        traps += f"- ⚠️ {t}\n"
    with open(os.path.join(wiki_dir, 'traps.md'), 'w') as f:
        f.write(traps)
    
    # Tags
    tags_md = "# 标签体系\n\n## 品类标签\n\n| 标签 | 优先级 | 搜索匹配 | Section映射 |\n|------|--------|----------|-------------|\n"
    for c in schema['categories']:
        pats = c.get('patterns', [])
        secs = c.get('section', [])
        tags_md += f"| {c['tag']} | {c['priority']} | {', '.join(pats[:2])} | {', '.join(secs[:2])} |\n"
    
    tags_md += "\n## 修饰符\n\n| 动作 | 匹配模式 | 标签 | 排除 |\n|------|----------|------|------|\n"
    for m in schema['modifiers']:
        exclude = ', '.join(m.get('exclude_tags', [])[:3])
        tags_md += f"| {m['action']} | {m['pattern'][:40]} | {m.get('tag','-')} | {exclude or '-'} |\n"
    
    with open(os.path.join(wiki_dir, 'tags.md'), 'w') as f:
        f.write(tags_md)
    
    # Vendor params
    vp = "# 跨厂商参数映射\n\n"
    aliases = domain.get('vendor_param_aliases', {})
    for vendor, params in aliases.items():
        vp += f"## {vendor}\n\n| 参数名 | 标准字段 |\n|--------|----------|\n"
        for name, std in params.items():
            vp += f"| {name} | {std} |\n"
        vp += "\n"
    with open(os.path.join(wiki_dir, 'vendor_params.md'), 'w') as f:
        f.write(vp)
    
    return wiki_dir

# ═══════════════════════════════════════
# 3. 生成 VALID_TAGS 给 route.ts
# ═══════════════════════════════════════
def generate_valid_tags():
    all_tags = set()
    for c in schema['categories']:
        all_tags.add(c['tag'])
    for m in schema['modifiers']:
        if 'tag' in m:
            all_tags.add(m['tag'])
        if 'exclude_tags' in m:
            for t in m['exclude_tags']:
                all_tags.add(t)
    
    # These are generated from actual product data, keep them here as reference
    print(f"VALID_TAGS count: {len(all_tags)}")
    return sorted(all_tags)

# ═══════════════════════════════════════
# 运行
# ═══════════════════════════════════════
if __name__ == '__main__':
    p = generate_prompt()
    generated.append(p)
    print(f"✓ prompt.txt → {p}")

    w = generate_wiki()
    generated.append(w)
    print(f"✓ wiki/ → {w}")

    tags = generate_valid_tags()
    print(f"✓ VALID_TAGS → {len(tags)} tags")
    
    print(f"\n✅ 全部生成完毕。{len(generated)} 个文件。")
