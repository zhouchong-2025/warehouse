#!/usr/bin/env python3
"""
llm_audit.py — LLM 驱动的标签质量审计
对潜在问题产品（冲突标签、参数乱码），用 LLM 判断标签是否正确。
LLM 建议的标签会经过白名单过滤，只保留已知标签池内的。
只标记不一致，高置信度可自动修复。

用法:
  python3 scripts/llm_audit.py              # 审计全部可疑产品
  python3 scripts/llm_audit.py --pn TPM2003C # 审计单个产品
  python3 scripts/llm_audit.py --fix         # 自动应用高置信度修正
"""
import json, os, sys, re
from collections import defaultdict

# ─── 配置 ───
API_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "web/public/data/products_structured.json")
PROMPT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "web/app/api/interpret/prompt.txt")

# ─── 加载合法标签白名单 ───
def load_valid_tags():
    """从 prompt.txt 和已知模式加载合法标签池"""
    tags = set()
    try:
        with open(PROMPT_PATH) as f:
            for line in f:
                for t in line.replace(',', ' ').split():
                    t = t.strip()
                    if t and not t.startswith('==') and not t.startswith('Q:') and not t.startswith('A:') and not t.startswith('-') and '→' not in t:
                        tags.add(t)
    except:
        pass
    # Always-valid tags
    tags.update({'工业级', '车规AEC-Q100', '消费级', '隔离', '半双工', '全双工'})
    return tags

VALID_TAGS = load_valid_tags()
VALID_PATTERNS = [
    re.compile(r'^Vin_[\d.]+V$'), re.compile(r'^Vout_[\d.]+V$'),
    re.compile(r'^Iout_[\d.]+A$'), re.compile(r'^\d+Mbps$'),
    re.compile(r'^\d+通道$'), re.compile(r'^\d+T\d+R$'),
    re.compile(r'^\d+:\d+$'), re.compile(r'^\d+口$'), re.compile(r'^\d+bit$'),
]

def is_valid_tag(tag):
    """Check if tag is in the known vocabulary."""
    if tag in VALID_TAGS:
        return True
    if any(pat.match(tag) for pat in VALID_PATTERNS):
        return True
    return False

def filter_tags(tag_list):
    """Filter a list of tags to only include valid ones."""
    return [t for t in tag_list if is_valid_tag(t)]

# ─── 找出需要审计的产品 ───
CONFLICT_PAIRS = [
    ("隔离栅极驱动", "非隔离栅极驱动"),
    ("栅极驱动", "马达驱动"),
    ("RS-485", "RS-232"),
    ("CAN-FD", "LIN"),
    ("DCDC", "LDO"),
    ("电子保险丝", "负载开关"),
    ("隔离栅极驱动", "栅极驱动"),
]

def find_suspect_products(products, target_pn=None):
    """Find products that need LLM review."""
    suspects = []
    reasons = defaultdict(list)
    
    for p in products:
        pn = p["part_number"]
        if target_pn and pn != target_pn:
            continue
        
        ft = p.get("_features", "")
        feats = set(ft.split())
        sec = p.get("_section", "")
        params = p.get("_params", "")
        reasons_for_pn = []
        
        # 1. Conflicting tag pairs
        for a, b in CONFLICT_PAIRS:
            if a in feats and b in feats:
                reasons_for_pn.append(f"conflict:{a}+{b}")
        
        # 2. Very few params → likely garbled extraction (threshold: ≤1 meaningful param)
        param_count = params.count("|") + 1 if params else 0
        if param_count <= 1:
            reasons_for_pn.append(f"garbled_params:{param_count}")
        
        # 3. Missing primary category tag (but has params, so it's a real product)
        primary_tags = [
            "运放", "比较器", "LDO", "DCDC", "CAN-FD", "LIN", "RS-485", "RS-232",
            "数字隔离器", "栅极驱动", "非隔离栅极驱动", "隔离栅极驱动",
            "马达驱动", "模拟开关", "电压基准", "ADC", "DAC", "BMS", "电平转换",
            "IO扩展", "IO扩展器", "SBC", "MLVDS", "复位芯片", "视频滤波", "音频功放",
            "隔离放大器", "电流传感器", "温度传感器", "匹配电阻", "逻辑门",
            "电子保险丝", "理想二极管", "高边驱动", "隔离电源",
            "以太网供电", "EMI滤波器", "电池监控", "传感器接口", "理想二极管",
            "电压基准放大器", "仪表放大器", "差动放大器", "线性充电", "电源时序",
            "音频总线", "高速数据复用器", "负载开关", "PoE", "网卡", "交换机",
        ]
        has_primary = any(t in feats for t in primary_tags)
        if not has_primary and param_count >= 2:
            reasons_for_pn.append(f"no_primary_tag")
        
        if reasons_for_pn:
            suspects.append(p)
            for r in reasons_for_pn:
                reasons[r].append(pn)
    
    return suspects, reasons


def build_audit_prompt(product):
    """Build LLM prompt for auditing one product."""
    pn = product["part_number"]
    sec = product.get("_section", "")
    features = product.get("_features", "")
    params = product.get("_params", "")
    raw = product.get("_raw", "")
    
    available_cats = sorted([t for t in VALID_TAGS if t not in ('工业级','车规AEC-Q100','消费级','隔离','半双工','全双工')])
    cat_list = ", ".join(available_cats[:50])
    
    return f"""你是芯片标签审计专家。审查产品标签是否正确。

== 产品信息 ==
型号: {pn}
PDF章节: {sec}
原始数据: {raw[:300]}
参数: {params[:500]}
当前标签: {features}

== 标签规则（严格遵守）==
1. 等级标签只能是: 工业级, 车规AEC-Q100, 消费级（必须保留一个，不能删除后不加）
2. 可用的品类标签: {cat_list}
3. 能力标签格式: Vin_XV, Vout_XV, Iout_XA, XMbps, X通道, XTYR, X:Y
4. 禁止编造标签！只能用上述列表中的标签
5. 不要建议"车规级""汽车级""开漏输出""SPI接口""封装名"等非标准标签
6. remove_tags和add_tags中的每个标签都必须来自可用标签列表

请判断并输出JSON（只输出JSON）：
{{"category_ok": true/false, "correct_category": "品类标签", "add_tags": ["需添加的标签"], "remove_tags": ["需删除的标签"], "confidence": "high/medium/low", "reason": "简短理由"}}"""


def call_llm(prompt):
    """Call DeepSeek API."""
    import urllib.request
    import os as _os
    
    api_key = _os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return {"category_ok": True, "correct_category": "", "add_tags": [], "remove_tags": [], "confidence": "low", "reason": "NO_API_KEY"}
    
    data = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "你是半导体芯片专家，只输出JSON，不输出其他内容。"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 500
    }).encode()
    
    req = urllib.request.Request(API_URL, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    })
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            content = result["choices"][0]["message"]["content"]
            # Extract JSON from response
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                return json.loads(json_match.group())
            return {"category_ok": True, "add_tags": [], "remove_tags": [], "confidence": "low", "reason": f"parse_error: {content[:100]}"}
    except Exception as e:
        return {"category_ok": True, "add_tags": [], "remove_tags": [], "confidence": "low", "reason": f"api_error: {str(e)[:100]}"}


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--pn", help="Audit single product")
    ap.add_argument("--fix", action="store_true", help="Apply high-confidence fixes")
    ap.add_argument("--max", type=int, default=20, help="Max products to audit")
    args = ap.parse_args()
    
    with open(DATA_PATH) as f:
        data = json.load(f)
    
    all_products = []
    for vendor, vd in data.items():
        all_products.extend(vd.get("products", []))
    
    suspects, reasons = find_suspect_products(all_products, args.pn)
    
    print(f"=== LLM Tag Audit ===")
    print(f"Total products: {len(all_products)}")
    print(f"Suspects found: {len(suspects)}")
    print()
    
    # Show reasons breakdown
    for reason, pns in sorted(reasons.items(), key=lambda x: -len(x[1])):
        print(f"  {reason}: {len(pns)} products")
    
    if not suspects:
        print("\nNo products need review.")
        return
    
    # Limit for cost control
    audit_list = suspects[:args.max]
    print(f"\n=== Auditing {len(audit_list)} products ===")
    
    fixes_applied = 0
    for product in audit_list:
        pn = product["part_number"]
        prompt = build_audit_prompt(product)
        result = call_llm(prompt)
        
        if not result.get("category_ok"):
            print(f"\n⚠️  {pn}: {result.get('reason','?')}")
            print(f"   当前: {product['_features'][:100]}")
            if result.get("correct_category"):
                print(f"   建议品类: {result['correct_category']}")
            if result.get("add_tags"):
                print(f"   需添加: {result['add_tags']}")
            if result.get("remove_tags"):
                print(f"   需删除: {result['remove_tags']}")
            
            # Apply high-confidence fixes (with tag filtering)
            if args.fix and result.get("confidence") == "high":
                ft = product["_features"]
                feats = set(ft.split())
                grade_tags = {'工业级', '车规AEC-Q100', '消费级'}
                current_grades = feats & grade_tags
                
                # Remove tags, but keep at least one grade tag
                for t in result.get("remove_tags", []):
                    if t in grade_tags and len(current_grades) <= 1:
                        continue  # don't remove the last grade tag
                    feats.discard(t)
                    if t in grade_tags:
                        current_grades.discard(t)
                
                # Only add tags that exist in our vocabulary
                valid_adds = filter_tags(result.get("add_tags", []))
                for t in valid_adds:
                    feats.add(t)
                    if t in grade_tags:
                        current_grades.add(t)
                
                # Ensure at least one grade tag
                if not (feats & grade_tags):
                    if current_grades:
                        feats.add(list(current_grades)[0])
                    else:
                        feats.add('工业级')  # default fallback
                
                if result.get("correct_category") and is_valid_tag(result["correct_category"]):
                    feats.add(result["correct_category"])
                product["_features"] = " ".join(feats)
                fixes_applied += 1
                print(f"   ✅ 已修复 (移除 {len(result.get('remove_tags',[]))} 个, 添加 {len(valid_adds)} 个合法标签)")
    
    if args.fix and fixes_applied:
        with open(DATA_PATH, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\n✓ Applied {fixes_applied} high-confidence fixes")
    elif not args.fix:
        print(f"\nRun with --fix to apply high-confidence corrections.")


if __name__ == "__main__":
    main()
