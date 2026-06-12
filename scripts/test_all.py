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
    all_ok &= run("python3 scripts/test_search_quality.py 2>&1", "搜索质量回归 (10 case)")
    
    print(f"\n{'='*50}")
    if all_ok:
        print("  ✅ ALL CHECKS PASSED")
    else:
        print("  ❌ SOME CHECKS FAILED — see details above")
    print(f"{'='*50}")
    
    sys.exit(0 if all_ok else 1)

if __name__ == '__main__':
    main()
