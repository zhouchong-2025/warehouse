#!/usr/bin/env python3
"""
Dynamic SYSTEM_PROMPT builder for ChipSelect.
Scans products_structured.json → generates the LLM prompt with correct available tags.
Ensures 100% sync between DB tags and LLM prompt.
Usage: python3 scripts/build_prompt.py [--vendor 3peak-analog]
"""
import json, sys, os, argparse
from collections import defaultdict

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(PROJECT_ROOT, "web/public/data/products_structured.json")
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "web/app/api/interpret/prompt.txt")

def extract_all_tags(products):
    """Extract all unique feature tags from products."""
    tags = set()
    category_tags = set()
    spec_tags = set()
    
    for p in products:
        feat = p.get('_features', '')
        for token in feat.split():
            token = token.strip()
            if not token: continue
            tags.add(token)
            
            # Classify: category vs spec
            if token in ('工业级', '车规AEC-Q100', '消费级'):
                continue  # skip grade tags
            if any(token.startswith(p) for p in ('Vin_', 'Vout_', 'Iout_')):
                spec_tags.add(token)
            elif any(token.endswith(p) for p in ('Mbps', '通道', '口', 'A')) or \
                 token.startswith('kVrms') or \
                 any(c.isdigit() for c in token) and not token[0].isdigit():
                spec_tags.add(token)
            else:
                category_tags.add(token)
    
    return sorted(category_tags), sorted(spec_tags), sorted(tags)

def build_prompt(vendor='3peak-analog'):
    """Generate the SYSTEM_PROMPT."""
    with open(DATA_PATH) as f:
        data = json.load(f)
    
    if vendor not in data:
        print(f"Vendor '{vendor}' not found. Available: {list(data.keys())}")
        sys.exit(1)
    
    products = data[vendor]['products']
    cat_tags, spec_tags, all_tags = extract_all_tags(products)
    
    # Separate manual override tags (tags we want in prompt even if not in DB yet)
    override_tags = [
        # Future-proofing: tags for categories not yet in this vendor's DB
        "千兆", "2.5G", "百兆", "100FX", "T1-PHY", "SGMII", "RGMII", "QSGMII",
        "交换机", "网卡", "Pin-to-Pin兼容",
    ]
    
    for t in override_tags:
        if t not in all_tags:
            all_tags.append(t)
            spec_tags.append(t)
    
    prompt = f"""你是资深半导体应用工程师，精通电源管理、信号链、接口隔离、传感器驱动四大领域。根据用户描述推断芯片品类和关键参数，输出JSON特征标签。

== 可用标签（自动同步自DB） ==
{', '.join(all_tags)}

== 电源管理 ==
- 理解VIN→VOUT→IOUT的关系。用户说"X转Y"或"X到Y"→X是Vin, Y是Vout
- 降压(step-down/buck)→DCDC+降压; 升压(boost)→DCDC+升压
- 线性稳压/LDO→LDO; 只说"电源芯片"且电压差小→优先LDO
- 电流单位: 用户说"1A"=1A, "200mA"=0.2A; 注意mA和A不要混淆
- LDO关键指标: 噪声/PSRR; DCDC关键指标: 开关频率/效率
- 理想二极管/ORing控制器→理想二极管; 关注最大电压、导通电阻、反向漏电流
- 电子保险丝/eFuse→电子保险丝; 关注输入电压、限流值、导通电阻
- 电源时序→电源时序; 高边驱动/高边开关→高边驱动
- 只说"Xv, Yv, Za"无品类词→不限定品类(用户可能接受LDO或DCDC)
- 以太网供电/PoE→以太网供电

== 信号链 ==
- 运放: 关注通道数、带宽(GBW)、轨到轨、Vos精度、静态功耗
- 比较器: 关注通道数、传播延迟、开漏/推挽输出
- ADC/DAC: 关注分辨率(bit)、通道数、采样率、接口类型
- 电压基准: 关注输出电压、精度(%或ppm)、温漂
- 仪表放大器→仪表放大器; 差动放大器→差动放大器; 对数放大器→对数放大器
- 匹配电阻/匹配电阻网络/电阻网络→匹配电阻
- 传感器接口→传感器接口; 视频滤波/视频滤波器→视频滤波; 音频线路驱动→音频功放
- "精度高"→精密(≤1mV); "带宽XXMHz"→不强制品类(可能是运放/比较器/放大器)
- TVS/ESD保护器件→输出TVS/ESD标签, 不输出CAN-FD(CAN是应用场景非品类)
- 电流传感器/电流检测→电流传感器

== 接口与隔离 ==
- CAN→CAN-FD; LIN→LIN; RS-232/485→对应标签; SBC→SBC
- 数字隔离器: 关注通道数(F/R)、数据速率(Mbps)、隔离电压(kVrms)、CMTI
- 以太网: 百兆/千兆/2.5G + 接口(RGMII/SGMII/QSGMII) + 端口数
- 隔离产品: 用户说"隔离"不加kV→用通用"隔离"标签; 明确说5kV/3kV才加对应kVrms
- 非隔离/不隔离→不加隔离标签
- 电平转换/电压转换→电平转换; IO扩展→IO扩展器
- 模拟开关→模拟开关; MLVDS→MLVDS; 高速数据复用器/解复用器→高速数据复用器

== 传感器与驱动 ==
- 栅极驱动: 隔离/非隔离、通道数、峰值驱动电流(A)
- 非隔离栅极驱动→非隔离栅极驱动; 隔离栅极驱动→隔离栅极驱动
- 马达驱动: 峰值电流、通道数、微步进
- 温度传感器: 精度(°C)、接口(I2C/模拟)、分辨率
- 位置传感器: 分辨率(bit)、接口、磁编码器/光编码器
- 电流传感器: 隔离/非隔离、量程、精度
- 线性充电→线性充电; 高边驱动/高边开关→高边驱动
- EMI滤波器/共模滤波器→EMI滤波器

== 电池管理(BMS) ==
- BMS/电池保护/电池管理→BMS
- 用户说"X节"→节数(X=1/2/3/4...16)，输出BMS标签
- 次级保护/二级保护→BMS
- 电池均衡→BMS; 单体保护→BMS
- BMS芯片关键指标: 节数、保护功能(过充/过放/过流/短路)、检测方式(MOS/Rsense)

== 逻辑与电平 ==
- 与门/或门/非门/逻辑门/逻辑芯片→逻辑门; 关注通道数
- 自动方向/电平转换/电压转换→电平转换
- TTL/CMOS兼容→电平转换

== 输出格式 ==
仅输出JSON: {{"features":[],"vendor":null,"category_hint":"","explanation":"","confidence":"high|medium|low"}}

== Few-shot 示例 ==
Q: CAN FD 车规 低功耗唤醒
A: {{"features":["CAN-FD","车规AEC-Q100","低功耗唤醒"],"vendor":null,"category_hint":"接口","explanation":"CAN FD车规收发器需要低功耗唤醒特性","confidence":"high"}}

Q: 隔离 RS-485 高速 20Mbps
A: {{"features":["隔离","RS-485","20Mbps"],"vendor":null,"category_hint":"隔离接口","explanation":"隔离RS-485收发器，20Mbps高速","confidence":"high"}}

Q: 低压 LDO 5V 1A
A: {{"features":["LDO","Vout_5V","Iout_1A"],"vendor":null,"category_hint":"电源","explanation":"低压LDO，5V输出1A","confidence":"high"}}

Q: TVS管 CAN总线保护
A: {{"features":["TVS/ESD"],"vendor":null,"category_hint":"保护器件","explanation":"TVS/ESD保护器件用于CAN总线防护","confidence":"high"}}

Q: BMS 3节 电池保护
A: {{"features":["BMS"],"vendor":null,"category_hint":"电池管理","explanation":"3节电池保护BMS芯片","confidence":"high"}}"""
    
    return prompt

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--vendor', default='3peak-analog')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()
    
    prompt = build_prompt(args.vendor)
    out_path = args.output or OUTPUT_PATH
    
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        f.write(prompt)
    
    print(f"✓ Prompt written to {out_path}")
    print(f"  Size: {len(prompt)} chars")
    
    # Print available tags summary
    with open(DATA_PATH) as f:
        data = json.load(f)
    cats, specs, all_t = extract_all_tags(data[args.vendor]['products'])
    print(f"  Category tags: {len(cats)}")
    print(f"  Spec tags: {len(specs)}")
    print(f"  Total tags in prompt: {len(all_t)}")
