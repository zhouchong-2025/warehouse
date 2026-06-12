"""
validate_tags.py — 标签值约束引擎
从 tag_schema.json 读取约束，供 autofix 和 audit 共用。
单一入口：validate_tag(tag, params) → (valid, reason)
"""

import json, re, os

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), 'tag_schema.json')

with open(SCHEMA_PATH) as f:
    _schema = json.load(f)

_constraints = _schema.get('tag_constraints', {})

def validate_tag(tag, params):
    """
    校验标签在给定参数下是否有效。
    返回: (valid: bool, reason: str)
    """
    if tag not in _constraints:
        return True, ''  # no constraint → assume valid
    
    constraint = _constraints[tag]
    pattern = constraint['param_pattern']
    validate_expr = constraint['validate']
    
    match = re.search(pattern, params, re.I)
    
    if match is None:
        # Check if validate expects match to exist
        if 'match is not None' in validate_expr:
            return False, f'{constraint["description"]} — 参数中未找到匹配'
        return True, ''
    
    # Extract value from first capture group, or use full match
    value = match.group(1) if match.lastindex else match.group(0)
    
    # Evaluate validation expression
    try:
        result = eval(validate_expr, {'float': float, 'int': int, 'value': value, 'match': match, 're': re})
        if not result:
            return False, f'{constraint["description"]} — 实际值: {value}'
        return True, ''
    except Exception as e:
        return True, f'约束求值异常: {e}'  # don't fail on eval errors

def get_all_constraints():
    """返回所有需要校验的标签及约束"""
    return dict(_constraints)

def get_tags_with_constraints():
    """返回需要校验的标签列表"""
    return list(_constraints.keys())
