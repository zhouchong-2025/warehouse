#!/usr/bin/env python3
"""
ChipSelect MCP Server — P6 插件化 (无外部依赖版)

MCP 协议: JSON-RPC 2.0 over stdio
不需要 pip install, 纯 Python stdlib 实现。

工具:
  search_parts  — 选型搜索
  get_part      — 单料详情  
  compare_parts — 多料对比
  list_categories — 品类树

配置 (~/.hermes/config.yaml):
  mcp_servers:
    chipselect:
      command: "python3"
      args: ["/Users/zhouchong/projects/warehouse/scripts/mcp_server.py"]
"""

import json, sys, os, re
from collections import defaultdict

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "web", "public", "data", "products_structured.json")

def load_data():
    with open(DATA_PATH) as f:
        return json.load(f)

def search_parts(query: str, vendor: str = None, limit: int = 10):
    data = load_data()
    q = query.lower().strip()
    terms = q.split()
    results = []
    for vslug, vd in data.items():
        if vendor and vslug != vendor: continue
        for p in vd['products']:
            score = 0
            pn_lower = p['part_number'].lower()
            if pn_lower == q: score += 100
            elif pn_lower.startswith(q): score += 50
            elif q in pn_lower: score += 20
            feats = p.get('_features', '').lower().split()
            for t in terms:
                if t in feats: score += 5
            searchable = (p['part_number'] + ' ' + p.get('_section','') + ' ' + p.get('_features','') + ' ' + p.get('_params','')).lower()
            for t in terms:
                if t in searchable: score += 1
            if score > 0 or not terms:
                results.append({
                    'pn': p['part_number'], 'vendor': vd.get('name', vslug),
                    'section': p.get('_section', ''), 'features': p.get('_features', ''),
                    'score': score,
                })
    results.sort(key=lambda x: -x['score'])
    return results[:limit]

def get_part(pn: str):
    data = load_data()
    pn_upper = pn.strip().upper()
    for vslug, vd in data.items():
        for p in vd['products']:
            if p['part_number'].upper() == pn_upper:
                return {
                    'pn': p['part_number'], 'vendor': vd.get('name', vslug),
                    'section': p.get('_section', ''), 'features': p.get('_features', ''),
                    'params': p.get('_params', ''), 'sections': p.get('_sections', []),
                }
    return None

def compare_parts(pns: list):
    data = load_data()
    found = {}
    for target in pns:
        tu = target.strip().upper()
        for vslug, vd in data.items():
            for p in vd['products']:
                if p['part_number'].upper() == tu:
                    found[target] = {'pn': p['part_number'], 'vendor': vd.get('name', vslug), 'params': p.get('_params', '')}
                    break
    return found

def list_categories(vendor: str = None):
    data = load_data()
    cats = defaultdict(int)
    for vslug, vd in data.items():
        if vendor and vslug != vendor: continue
        for p in vd['products']:
            cats[p.get('_section', 'Unknown')] += 1
    return [{'category': c, 'count': n} for c, n in sorted(cats.items(), key=lambda x: -x[1])]

# ─── MCP JSON-RPC over stdio ───
TOOLS = [
    {"name": "search_parts", "description": "搜索芯片产品。输入自然语言描述或标签(如'运放 轨到轨 低噪声'、'CAN-FD 车规')，返回匹配的产品列表及评分。",
     "inputSchema": {"type": "object", "properties": {
         "query": {"type": "string", "description": "搜索查询"},
         "vendor": {"type": "string", "description": "限定厂商(可选)"},
         "limit": {"type": "integer", "description": "返回数量上限", "default": 10},
     }, "required": ["query"]}},
    {"name": "get_part", "description": "获取单个芯片的完整参数。输入产品型号(PN)。",
     "inputSchema": {"type": "object", "properties": {
         "pn": {"type": "string", "description": "产品型号，如 TP358, NSM2011"},
     }, "required": ["pn"]}},
    {"name": "compare_parts", "description": "对比多个芯片的参数。",
     "inputSchema": {"type": "object", "properties": {
         "pns": {"type": "array", "items": {"type": "string"}, "description": "型号列表"},
     }, "required": ["pns"]}},
    {"name": "list_categories", "description": "列出所有产品品类及数量。",
     "inputSchema": {"type": "object", "properties": {
         "vendor": {"type": "string", "description": "限定厂商(可选)"},
     }}},
]

def handle_request(req: dict):
    """处理单个 JSON-RPC 请求"""
    rid = req.get("id")
    method = req.get("method", "")
    params = req.get("params", {})
    
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": rid, "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "chipselect", "version": "1.0.0"},
        }}
    elif method == "tools/list":
        return {"jsonrpc": "2.0", "id": rid, "result": {"tools": TOOLS}}
    elif method == "tools/call":
        tool_name = params.get("name", "")
        args = params.get("arguments", {})
        try:
            if tool_name == "search_parts":
                result = search_parts(args.get("query",""), args.get("vendor"), args.get("limit",10))
                text = json.dumps(result, ensure_ascii=False, indent=2)
            elif tool_name == "get_part":
                p = get_part(args.get("pn",""))
                text = json.dumps(p, ensure_ascii=False, indent=2) if p else f"未找到型号 '{args.get('pn','')}'"
            elif tool_name == "compare_parts":
                result = compare_parts(args.get("pns",[]))
                text = json.dumps(result, ensure_ascii=False, indent=2)
            elif tool_name == "list_categories":
                result = list_categories(args.get("vendor"))
                text = json.dumps(result, ensure_ascii=False, indent=2)
            else:
                text = f"Unknown tool: {tool_name}"
            return {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": text}]}}
        except Exception as e:
            return {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True}}
    elif method == "notifications/initialized":
        return None  # 无需响应
    else:
        return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"Method not found: {method}"}}

def main():
    """stdio JSON-RPC 主循环"""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            resp = handle_request(req)
            if resp:
                sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
                sys.stdout.flush()
        except json.JSONDecodeError:
            pass

if __name__ == "__main__":
    main()
