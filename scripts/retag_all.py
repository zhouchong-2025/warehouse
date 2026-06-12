#!/usr/bin/env python3
"""Generic retagger: scan _raw text and add missing tags across all vendors."""
import json, re

data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

def extract_grade(raw):
    """Detect grade from raw text."""
    t = raw.lower()
    grades = []
    if re.search(r'automotive|aec|q100|q1\b|车规', t):
        grades.append('车规AEC-Q100')
    if re.search(r'industrial|工业', t):
        grades.append('工业级')
    if re.search(r'consumer|消费', t):
        grades.append('消费级')
    return grades

def extract_isolation(raw, pn):
    """Detect isolation voltage. ONLY tag if isolation context exists.
    Numbers like 5000/8000 appear in ESD, GBW, and other specs — 
    context keywords (隔离/Isolation/Reinforced/增强绝缘) are mandatory."""
    t = raw.lower()
    
    # Product prefix guarantees isolation — no context check needed
    if pn.startswith('NSIP'):
        if re.search(r'8000|5700|5000|8kv|5kv', t):
            return '5kVrms隔离'
        if re.search(r'3750|3000|3kv', t):
            return '3kVrms隔离'
        return None
    
    # Gate driver with Reinforced keyword
    if 'reinforced' in t and pn.startswith('TPM'):
        return '5kVrms隔离'
    
    # For everything else: isolation context is MANDATORY
    # Check for isolation-related keywords
    iso_context = re.search(r'隔离|isolation|isolated|增强绝缘|基础绝缘|insulation|reinforced', t)
    if not iso_context:
        return None
    
    # Now it's safe to match the number
    if re.search(r'8000|5700|8kv', t):
        return '5kVrms隔离'
    if re.search(r'5000|5kv', t):
        return '5kVrms隔离'
    if re.search(r'3750|3000|3kv', t):
        return '3kVrms隔离'
    return None

def extract_category_tags(raw, pn):
    """Detect product category from raw text."""
    tags = []
    t = raw.lower()
    
    # Gate drivers (check before motor drivers)
    if re.search(r'gate\s*driver|isolated\s*gate|栅极驱动', t):
        tags.append('栅极驱动')
        if re.search(r'isolated|reinforced|隔离', t):
            tags.append('隔离栅极驱动')
    
    # Motor drivers (only if not already tagged as gate driver)
    if re.search(r'motor\s*driver|马达驱动|步进马达|h-bridge', t) and '栅极驱动' not in tags:
        tags.append('马达驱动')
    
    # Digital isolators
    if re.search(r'digital\s*isolator|数字隔离', t):
        tags.append('数字隔离器')
    
    # RS-485
    if re.search(r'half\s*duplex|full\s*duplex|rs-?485', t) and pn.startswith('TPT748'):
        tags.append('RS-485')
    
    # I2C
    if re.search(r'\bi2c\b|i\s*2\s*c\b|smbus', t):
        tags.append('I2C')
    
    # CAN
    if re.search(r'\bcan\b|can\s*fd|can\s*transceiver|隔离can', t) and 'I2C' not in tags:
        # Only if it's actually a CAN product
        if re.search(r'can\s*(fd|transceiver|收发)|bus\s*fault', t):
            tags.append('CAN FD')
    
    # Isolated amplifier
    if re.search(r'isolated\s*amplif|隔离放大|iso\s*amp', t):
        tags.append('隔离放大器')
    
    # Current sense
    if re.search(r'current\s*sense|电流检测|current\s*shunt', t):
        tags.append('电流检测')
    
    # Amplifier (generic, only if no more specific type)
    if re.search(r'amplif|放大器', t) and not tags:
        tags.append('放大器')
    
    # Op-amp specific
    if re.search(r'op\s*amp|运放|运算放大|gbw|slew\s*rate|vos', t):
        tags.append('运放')
    
    # Comparator
    if re.search(r'comparator|比较器', t):
        tags.append('比较器')
    
    # LDO
    if re.search(r'ldo|linear\s*regulator|低压差', t) and 'DCDC' not in tags:
        tags.append('LDO')
    
    # DCDC
    if re.search(r'dc-dc|dcdc|buck|boost|step-down|step-up|变换', t):
        tags.append('DCDC')
        if re.search(r'buck|step-down|降压', t):
            tags.append('降压')
        if re.search(r'boost|step-up|升压', t):
            tags.append('升压')
    
    # Voltage reference
    if re.search(r'voltage\s*reference|基准源|电压基准|reference\s*voltage', t):
        tags.append('电压基准')
    
    # ADC/DAC
    if re.search(r'\badc\b|模数转换|analog.*digital.*convert', t):
        tags.append('ADC')
    if re.search(r'\bdac\b|数模转换|digital.*analog.*convert', t):
        tags.append('DAC')
    
    # Sensors
    if re.search(r'temperature\s*sensor|温度传感|测温', t):
        tags.append('温度传感器')
    if re.search(r'current\s*sensor|电流传感|hall.*current', t):
        tags.append('电流传感器')
    if re.search(r'pressure\s*sensor|压力传感', t):
        tags.append('压力传感器')
    if re.search(r'hall|position\s*sensor|位置传感|磁编码|angle\s*sensor', t):
        tags.append('位置传感器')
    
    # Reset/supervisor
    if re.search(r'reset|supervisor|看门狗|复位', t):
        tags.append('复位芯片')
    
    # IO expander
    if re.search(r'io\s*expand|gpio\s*expand|io\s*扩展', t):
        tags.append('IO扩展')
    
    # Analog switch
    if re.search(r'analog\s*switch|模拟开关|spdt|spst', t):
        tags.append('模拟开关')
    
    # Load switch
    if re.search(r'load\s*switch|高边开关|high\s*side\s*switch', t):
        tags.append('负载开关')
    
    # Ethernet specific
    if re.search(r'ge\s*phy|fe\s*phy|ethernet|千兆|百兆|2\.5g\s*phy', t):
        if re.search(r'2\.5g|2.5g', t):
            tags.append('2.5G')
        elif re.search(r'ge\s*phy|千兆', t):
            tags.append('千兆')
        elif re.search(r'fe\s*phy|百兆', t):
            tags.append('百兆')
    
    # Pin-to-Pin
    if re.search(r'p2p|兼容|替代|pin\s*to\s*pin', t):
        tags.append('Pin-to-Pin兼容')
    
    # Switch chip
    if re.search(r'switch\s*chip|交换芯片|交换机', t):
        tags.append('交换机')
    
    # NIC
    if re.search(r'网卡|nic\b', t):
        tags.append('网卡')
    
    return tags

# Special features
def extract_features(raw):
    tags = []
    t = raw.lower()
    if re.search(r'rail\s*to\s*rail|轨到轨|rrio', t): tags.append('轨到轨')
    if re.search(r'sgmii', t) and 'qsgmii' not in t: tags.append('SGMII')
    if re.search(r'rgmii', t): tags.append('RGMII')
    if re.search(r'qsgmii', t): tags.append('QSGMII')
    if re.search(r'100fx|fiber|光纤|光口', t): tags.append('100FX')
    if re.search(r'802\.3bw|802\.3bp|100base-t1|1000base-t1|t1\s*phy', t): tags.append('T1 PHY')
    if re.search(r'partial\s*network|selective\s*wake|特定帧唤醒', t): tags.append('特定帧唤醒(Partial Networking)')
    if re.search(r'standby|sleep|wake.*pin|低功耗唤醒', t): tags.append('低功耗唤醒')
    if re.search(r'vio\b', t): tags.append('VIO')
    if re.search(r'lre', t): tags.append('LRE')
    if re.search(r'sync-e', t): tags.append('SyncE')
    return tags

# Main retagging
fixed_count = 0
for slug, vd in data.items():
    for p in vd['products']:
        pn = p['part_number']
        raw = (p.get('_raw','') + ' ' + p.get('_params','') + ' ' + (p.get('category','') or '')).lower()
        current_tags = set(p.get('_features','').split())
        
        # Extract new tags from raw text
        new_tags = set()
        for t in extract_grade(raw): new_tags.add(t)
        iso = extract_isolation(raw, pn)
        if iso: new_tags.add(iso)
        for t in extract_category_tags(raw, pn): new_tags.add(t)
        for t in extract_features(raw): new_tags.add(t)
        
        # Merge: current tags that are correct + new tags from raw
        merged = current_tags | new_tags
        
        # Never remove tags that are already correct — only add missing ones
        if merged != current_tags:
            p['_features'] = ' '.join(sorted(merged))
            fixed_count += 1

# Save
json.dump(data, open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json','w'), ensure_ascii=False, indent=2)

# Stats
for slug, vd in data.items():
    print(f'{vd["name"]}: {vd["productCount"]} products')
total = sum(v['productCount'] for v in data.values())
print(f'TOTAL: {total}')
print(f'Retagged: {fixed_count} products')
