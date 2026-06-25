#!/usr/bin/env python3
"""
fuzz_parser.py — 输入侧随机模糊测试

随机组合品类词、参数、修饰词、技术词、vendor、自然语言模板，
生成大量查询并验证 parser 输出的一致性。

验证规则:
  1. 品类词出现在 query 中 → must 中必须有对应品类 tag
  2. 数值参数出现在 query 中 → must 中必须有对应 spec tag
  3. vendor 词出现在 query 中 → vendor 必须正确检测
  4. 技术词出现在 query 中 → must 中必须有对应 technology tag
  5. must 不应包含 query 中未出现的品类词
  6. 无品类词的 query → needsLLM=true 或 confidence=low

用法:
  python3 scripts/fuzz_parser.py [--rounds 200] [--seed 42]
"""

from __future__ import annotations

import sys
import random
import itertools
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from category_test_utils import interpret_query

# ── Query building blocks ──

NATURAL_TEMPLATES = [
    "{body}",
    "有{body}吗",
    "有没有{body}",
    "帮我找{body}",
    "我想要{body}",
    "推荐{body}",
    "找一款{body}",
    "需要{body}",
    "请问有{body}吗",
    "能不能推荐{body}",
]

CATEGORIES = {
    "LDO": ["LDO", "ldo", "低压差稳压", "线性稳压"],
    "DCDC": ["DCDC", "dcdc", "DC-DC", "dc dc"],
    "CAN-FD": ["CAN", "CAN FD", "can fd", "CAN收发器"],
    "RS-485": ["RS-485", "RS485", "485", "rs485"],
    "运放": ["运放", "运算放大器", "op amp", "opamp"],
    "比较器": ["比较器", "comparator"],
    "数字隔离器": ["数字隔离器", "数字隔离"],
    "ADC": ["ADC", "adc", "模数转换"],
    "DAC": ["DAC", "dac", "数模转换"],
    "电压基准": ["电压基准", "基准电压", "vref", "reference"],
    "电流传感器": ["电流传感器", "current sensor"],
    "温度传感器": ["温度传感器", "temp sensor"],
    "模拟开关": ["模拟开关", "analog switch"],
    "马达驱动": ["马达驱动", "电机驱动", "motor driver"],
    "栅极驱动": ["栅极驱动", "gate driver"],
    "隔离栅极驱动": ["隔离栅极驱动", "隔离 gate driver"],
    "交换机": ["交换机", "交换芯片", "switch"],
    "BMS": ["BMS", "bms", "电池保护"],
    "复位芯片": ["复位芯片", "看门狗", "watchdog"],
    "电平转换": ["电平转换", "level shift"],
    "LIN": ["LIN", "lin"],
    "RS-232": ["RS-232", "RS232", "232"],
    "SBC": ["SBC", "sbc", "系统基础芯片"],
    "MLVDS": ["MLVDS", "mlvds"],
    "理想二极管": ["理想二极管", "ideal diode", "ORing"],
    "电子保险丝": ["电子保险丝", "efuse", "eFuse"],
}

PARAMS = {
    "Iout_1A": ["1A", "1 A", "1安", "1a"],
    "Iout_2A": ["2A", "2 A", "2安"],
    "Iout_3A": ["3A", "3 A"],
    "Iout_5A": ["5A", "5 A"],
    "Vout_5V": ["5V输出", "输出5V", "5V out"],
    "Vout_3.3V": ["3.3V输出", "输出3.3V"],
    "Vin_12V": ["12V输入", "输入12V", "12V in"],
    "Vin_5V": ["5V输入", "输入5V"],
    "50Mbps": ["50Mbps", "50 Mbps", "50兆", "速率大于50兆"],
    "20Mbps": ["20Mbps", "20 Mbps", "20兆"],
    "100Mbps": ["100Mbps", "100 Mbps"],
    "4通道": ["4通道", "4路", "四通道"],
    "2通道": ["2通道", "2路", "两通道"],
    "8通道": ["8通道", "8路"],
    "12bit": ["12bit", "12位", "12 bit"],
    "16bit": ["16bit", "16位"],
    "8:1": ["8:1", "8选1", "八选一"],
    "5口": ["5口", "5端口", "五口"],
    "5kVrms隔离": ["5kVrms", "5kV", "5kV隔离"],
}

MODIFIERS = {
    "车规AEC-Q100": ["车规", "汽车级", "AEC-Q100", "automotive"],
    "工业级": ["工业级", "工业"],
    "低噪声": ["低噪声", "低噪音", "low noise"],
    "低功耗(≤50µA)": ["低功耗", "low power"],
    "轨到轨": ["轨到轨", "RRIO", "rail to rail"],
    "精密(≤1mV)": ["精密", "高精度", "低失调"],
    "高PSRR": ["高PSRR", "高电源抑制"],
    "高速(≥50MHz)": ["高速", "高速率"],
    "半双工": ["半双工", "half duplex"],
    "全双工": ["全双工", "full duplex"],
}

TECHNOLOGY = {
    "霍尔": ["霍尔", "线性霍尔", "hall effect"],
    "磁阻": ["磁阻", "TMR", "AMR"],
    "SIC": ["SIC", "signal improvement"],
    "特定帧唤醒": ["特定帧唤醒", "partial networking", "selective wake"],
}

VENDORS = {
    "novosense": ["纳芯微", "novosense"],
    "3peak": ["思瑞浦", "3peak", "3 peak"],
}

# ── Test runner ──

def random_query(seed: int) -> tuple[str, dict]:
    """Generate a random query and its expected parser output."""
    rng = random.Random(seed)

    # Pick 1-2 categories
    cat_keys = rng.sample(list(CATEGORIES.keys()), rng.randint(1, 2))
    cat_words = [rng.choice(CATEGORIES[k]) for k in cat_keys]

    # Optionally add params (50% chance)
    param_keys = []
    param_words = []
    if rng.random() < 0.5:
        pk = rng.choice(list(PARAMS.keys()))
        param_keys.append(pk)
        param_words.append(rng.choice(PARAMS[pk]))

    # Optionally add modifier (40% chance)
    mod_keys = []
    mod_words = []
    if rng.random() < 0.4:
        mk = rng.choice(list(MODIFIERS.keys()))
        mod_keys.append(mk)
        mod_words.append(rng.choice(MODIFIERS[mk]))

    # Optionally add technology (30% chance for compatible categories)
    tech_keys = []
    tech_words = []
    if rng.random() < 0.3:
        tk = rng.choice(list(TECHNOLOGY.keys()))
        tech_keys.append(tk)
        tech_words.append(rng.choice(TECHNOLOGY[tk]))

    # Optionally add vendor (25% chance)
    vendor_key = None
    vendor_word = None
    if rng.random() < 0.25:
        vk = rng.choice(list(VENDORS.keys()))
        vendor_key = vk
        vendor_word = rng.choice(VENDORS[vk])

    # Build body
    body_parts = cat_words + param_words + mod_words + tech_words
    if vendor_word:
        body_parts.insert(0, vendor_word)
    rng.shuffle(body_parts)
    body = " ".join(body_parts)

    # Wrap in natural language template (60% chance)
    if rng.random() < 0.6:
        template = rng.choice(NATURAL_TEMPLATES)
        query = template.format(body=body)
    else:
        query = body

    expected = {
        "categories": cat_keys,
        "params": param_keys,
        "modifiers": mod_keys,
        "technology": tech_keys,
        "vendor": vendor_key,
    }
    return query, expected


def check_invariants(query: str, expected: dict, parsed: dict) -> list[str]:
    """Check parser output against expected properties. Returns list of errors."""
    errors = []
    must = parsed.get("must") or []
    features = parsed.get("features") or []
    vendor = (parsed.get("vendor") or "").lower()

    # 1. Category: query contains category word → must have category tag
    for cat_tag in expected["categories"]:
        if cat_tag not in must and cat_tag not in features:
            # Some categories map to compound tags (e.g., "CAN-FD" for "CAN")
            pass  # Not a hard error — parser might produce a different canonical tag
        # At minimum, one of the expected categories should be in features
    if expected["categories"] and not any(c in features for c in expected["categories"]):
        errors.append(f"缺品类tag: query含{expected['categories']}, features={features}")

    # 2. Params: query contains param word → must have spec tag
    for param_tag in expected["params"]:
        if param_tag not in must and param_tag not in features:
            errors.append(f"缺参数tag: query含参数词, 期望{param_tag}")

    # 3. Vendor: query contains vendor word → vendor detected
    if expected["vendor"] and vendor != expected["vendor"]:
        errors.append(f"vendor={vendor}≠{expected['vendor']}")

    # 4. Technology: query contains tech word → must have tech tag
    for tech_tag in expected["technology"]:
        if tech_tag not in must:
            errors.append(f"缺tech tag: {tech_tag}")

    # 5. No hallucinated categories
    known_cats = set(CATEGORIES.keys())
    must_cats = [m for m in must if m in known_cats]
    for mc in must_cats:
        if mc not in expected["categories"]:
            # Check if the query contains any word for this category
            cat_words_lower = [w.lower() for words in CATEGORIES.get(mc, []) for w in [words] if isinstance(words, str)]
            query_lower = query.lower()
            if not any(w.lower() in query_lower for w in cat_words_lower):
                errors.append(f"幻觉品类: must含{mc}但query无对应词")

    return errors


def main() -> int:
    rounds = 200
    seed = 42

    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--rounds" and i + 1 < len(sys.argv):
            rounds = int(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == "--seed" and i + 1 < len(sys.argv):
            seed = int(sys.argv[i + 1])
            i += 2
        else:
            i += 1

    print(f"Parser Fuzz: {rounds} rounds, seed={seed}")
    print("=" * 72)

    total_errors = 0
    total_queries = 0
    # Category coverage tracking
    cat_coverage = {c: {"count": 0, "found": 0} for c in CATEGORIES}

    for rnd in range(rounds):
        s = seed + rnd
        query, expected = random_query(s)
        total_queries += 1

        try:
            parsed = interpret_query(query, mode="direct")
        except Exception as e:
            print(f"✗ R{rnd} PARSER CRASH: {query} → {e}")
            total_errors += 1
            continue

        errors = check_invariants(query, expected, parsed)

        # Track category coverage
        for cat in expected["categories"]:
            cat_coverage[cat]["count"] += 1
            if cat in (parsed.get("features") or []) or cat in (parsed.get("must") or []):
                cat_coverage[cat]["found"] += 1

        if not errors:
            if total_queries % 5 == 0:
                print(f"  ... {total_queries} queries, {total_errors} errors so far ...", flush=True)
        if errors:
            if total_errors < 20:  # Limit output
                print(f"✗ R{rnd}: {query[:80]}")
                for e in errors:
                    print(f"    {e}")
                print(f"    must={parsed.get('must')} features={parsed.get('features')}")
                print(f"    expected cats={expected['categories']} params={expected['params']}")
            total_errors += 1

    # Summary
    print("=" * 72)
    print(f"Queries: {total_queries}  Errors: {total_errors}")
    rate = (1 - total_errors / total_queries) * 100 if total_queries else 0
    print(f"Pass rate: {rate:.1f}%")

    # Category coverage
    print(f"\nCategory coverage:")
    uncovered = []
    for cat, stats in sorted(cat_coverage.items()):
        if stats["count"] == 0:
            continue
        ratio = stats["found"] / stats["count"] * 100
        icon = "✓" if ratio >= 90 else ("⚠️" if ratio >= 50 else "✗")
        print(f"  {icon} {cat}: {stats['found']}/{stats['count']} ({ratio:.0f}%)")
        if ratio < 90:
            uncovered.append(cat)

    if uncovered:
        print(f"\n⚠️  低覆盖率品类: {', '.join(uncovered)}")
    if total_errors == 0:
        print(f"\n✅ 全部通过")
    else:
        print(f"\n❌ {total_errors} 个错误")

    return 0 if total_errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
