#!/usr/bin/env python3
"""
test_all.py — 全量自动化测试入口
运行所有检查，2秒 parser + 2秒 audit = ~4秒完成

用法:
  npx tsx scripts/test_parser.ts && python3 scripts/audit_data.py
  或直接运行: python3 scripts/test_all.py
"""

import subprocess, sys, os

def run(cmd, name):
    print(f"\n{'='*50}")
    print(f"  {name}")
    print(f"{'='*50}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    return result.returncode == 0

def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    all_ok = True
    
    # Layer 1: Parser correctness (0 tokens, ~2s)
    all_ok &= run("npx tsx scripts/test_parser.ts 2>&1", "Parser 规则测试 (48 case)")
    
    # Layer 2: Data quality audit (~2s)
    all_ok &= run("python3 scripts/audit_data.py 2>&1", "数据质量审计")
    
    # Layer 3: Search quality regression (~1s)
    all_ok &= run("python3 scripts/test_search_quality.py 2>&1", "搜索质量回归")

    # Layer 4: Config-driven category sample suite (~1s)
    all_ok &= run("python3 scripts/test_category_sample.py 2>&1", "品类小样本回归")

    # Layer 5: Honest zero-result / near-miss suggestion regression (~1s)
    all_ok &= run("python3 scripts/test_zero_result_suggestions.py 2>&1", "零结果建议回归")

    # Layer 6: Novosense extraction/detail merge regression (~1s)
    all_ok &= run("python3 scripts/test_novosense_enrichment.py 2>&1", "纳芯微抽取增强回归")

    # Layer 7: CAN+SIC ranking / delivery regression (~1s)
    all_ok &= run("npx tsx scripts/test_can_sic_ranking.ts 2>&1", "CAN+SIC 排序与交付回归")

    # Layer 8: Analog switch 8:1 parser/ranking regression (~1s)
    all_ok &= run("npx tsx scripts/test_analog_switch_ranking.ts 2>&1", "模拟开关 8:1 / 2通道 排序回归")

    # Layer 9: UI copy / compare render guard (~0s)
    all_ok &= run("python3 scripts/test_ui_copy_and_compare_guard.py 2>&1", "首页文案与对比渲染守卫")

    # Layer 10: Query alias audit (~1s)
    all_ok &= run("python3 scripts/query_alias_audit.py 2>&1", "query alias canonical 审计")

    # Layer 11: SBC recommendation logic regression (~1s)
    all_ok &= run("python3 scripts/test_sbc_recommendations.py 2>&1", "SBC 推荐逻辑回归")

    # Layer 12: Ethernet port downgrade recommendation regression (~1s)
    all_ok &= run("python3 scripts/test_switch_port_recommendation.py 2>&1", "交换机端口向下兼容推荐回归")

    # Layer 13: Semantic suggestion matching regression (~1s)
    all_ok &= run("python3 scripts/test_semantic_suggestion_matching.py 2>&1", "语义匹配建议文案回归")

    # Layer 14: Isolation subcategory audit (~1s)
    all_ok &= run("python3 scripts/test_isolation_subcategory_audit.py 2>&1", "隔离子品类互斥审计")

    # Layer 15: Novosense full-category audit (~1s)
    all_ok &= run("python3 scripts/test_novosense_category_audit.py 2>&1", "纳芯微全品类审计")

    # Layer 16: Isolated amplifier query regression (~1s)
    all_ok &= run("python3 scripts/test_isolated_amplifier_query.py 2>&1", "隔离运放 查询回归")

    # Layer 17: Query understanding matrix (vendor + technology + category) (~1s)
    all_ok &= run("python3 scripts/test_query_understanding_matrix.py --mode direct 2>&1", "查询理解矩阵 (vendor+tech+品类)")

    # Layer 18: Detail evidence audit (~1s)
    all_ok &= run("python3 scripts/audit_detail_evidence_tags.py --dry-run 2>&1", "详情页证据审计")

    # Layer 19: Delivery E2E expectations (~1s)
    all_ok &= run("python3 scripts/test_delivery_expectations.py 2>&1", "交付排序 E2E")

    # Layer 20: Global tag coverage audit (~1s)
    all_ok &= run("python3 scripts/audit_tag_coverage.py 2>&1", "全局标签覆盖率审计")

    # Layer 21: Customer/sales query E2E simulation (~2s)
    all_ok &= run("python3 scripts/test_customer_queries.py --mode direct 2>&1", "客户真实需求E2E测试 (37 case)")

    # Layer 22: Cross-category threshold gap audit (~1s, informational)
    run("python3 scripts/audit_threshold_gaps.py 2>&1", "跨品类阈值错题排查")
    
    print(f"\n{'='*50}")
    if all_ok:
        print("  ✅ ALL CHECKS PASSED")
    else:
        print("  ❌ SOME CHECKS FAILED — see details above")
    print(f"{'='*50}")
    
    sys.exit(0 if all_ok else 1)

if __name__ == '__main__':
    main()
