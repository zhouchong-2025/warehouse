#!/usr/bin/env python3
"""Full frontend search simulation for '3peak 有没有隔离驱动'."""
import json, re

data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

# LLM features for "3peak 有没有隔离驱动"
features = ["隔离栅极驱动"]
confidence = "high"

# Simulate frontend exactly
def clean(s):
    return re.sub(r'[，,、。．.；;：:！!？?（）()【】\[\]『』""\'\']', ' ', s).strip().lower()

def expand_search(q):
    """Minimal synonym expansion"""
    from collections import OrderedDict
    synonyms = {
        "便宜": ["量产","通用","low cost","工业级"],
        "工业": ["industrial","工业级"],
        "汽车": ["automotive","aec","q100","车规"],
        "车规": ["automotive","aec-q100","q1"],
        "兼容": ["p2p","pin-to-pin"],
        "替代": ["p2p","pin-to-pin","兼容","alternatives"],
        "隔离": ["isolation","isolation rating","vrms"],
        "驱动": ["driver","gate driver"],
    }
    terms = q.split()
    expanded = set(terms)
    for term in terms:
        for key, syns in synonyms.items():
            if key == term or key in term or term in key:
                for s in syns:
                    expanded.add(s.lower())
    return ' '.join(expanded)

q_raw = "3peak 有没有隔离驱动"
q = clean(q_raw)
expanded_q = expand_search(q)
all_terms = expanded_q.split()
original_terms = q.split()
unwrapped_terms = [re.sub(r'^(支持|需要|要求|寻找|找|要|带|有)', '', t) for t in original_terms]
phrase_query = q if len(original_terms) > 1 else ""
boost_terms = [t for t in all_terms if t not in original_terms]

print(f"q={q}")
print(f"originalTerms={original_terms}")
print(f"unwrappedTerms={unwrapped_terms}")
print(f"phraseQuery={phrase_query}")
print(f"boostTerms={boost_terms}")
print(f"features={features} conf={confidence}")
print()

results = []
for slug in ['3peak-analog', '3peak-auto']:
    vd = data[slug]
    for product in vd['products']:
        pn = product['part_number']
        
        # searchable = Object.values(product).filter(string).join(" ")
        searchable = ' '.join(str(v) for v in product.values() if isinstance(v, str)).lower()
        featureField = (product.get('_features','') or '').lower()
        
        matched = []
        score = 0
        
        # allOriginalMatched
        all_original_matched = True
        for i, term in enumerate(original_terms):
            unwrapped = unwrapped_terms[i]
            effective = term if term in searchable else (unwrapped if unwrapped != term and unwrapped in searchable else None)
            if effective:
                matched.append(effective)
                part_field = (pn + " " + (product.get('_section','') or '') + " " + (product.get('_features','') or '')).lower()
                score += 3 if effective in part_field else 1
            else:
                all_original_matched = False
        
        # phraseMatched
        phrase_matched = bool(phrase_query) and searchable.replace(' ','').find(phrase_query.replace(' ','')) >= 0
        
        # llmAllMatched (featureField only, with mutual-exclusion groups)
        llm_all_matched = False
        if features and confidence == "high":
            # kVrms groups
            groups = []
            standalone = []
            used = set()
            for i, ft in enumerate(features):
                if i in used: continue
                fl = ft.lower()
                if 'kvrms' in fl:
                    g = [i]
                    for j in range(i+1, len(features)):
                        if 'kvrms' in features[j].lower():
                            g.append(j); used.add(j)
                    groups.append(g)
                elif '≤' in fl:
                    g = [i]
                    for j in range(i+1, len(features)):
                        if '≤' in features[j]:
                            g.append(j); used.add(j)
                    groups.append(g)
                elif fl in {'千兆','百兆','2.5g'}:
                    g = [i]
                    for j in range(i+1, len(features)):
                        if features[j].lower() in {'千兆','百兆','2.5g'}:
                            g.append(j); used.add(j)
                    groups.append(g)
                else:
                    standalone.append(i)
            
            all_standalone = True
            for si in standalone:
                if features[si].lower() not in featureField:
                    all_standalone = False
            
            all_groups = True
            for g in groups:
                if not any(features[gi].lower() in featureField for gi in g):
                    all_groups = False
            
            llm_all_matched = all_standalone and all_groups and (len(standalone) > 0 or len(groups) > 0)
        
        # Gate check
        if not all_original_matched and not phrase_matched and not llm_all_matched:
            continue
        
        # Boost terms
        for term in boost_terms:
            if term in searchable:
                matched.append(term)
                score += 0.5
        
        score += len(matched) * 0.5
        
        # LLM feature scoring
        if features:
            llm_match_count = 0
            for ft in features:
                if ft.lower() in featureField:
                    matched.append("LLM:" + ft)
                    llm_match_count += 1
                    score += 3
            if llm_all_matched:
                score += 20
        
        results.append((score, product['part_number'], vd['name'], 
                       product.get('_features',''),
                       f"orig={all_original_matched} phr={phrase_matched} llm={llm_all_matched}"))

results.sort(key=lambda x: -x[0])

print(f"Total results: {len(results)}")
for s, pn, vname, ft, debug in results:
    marker = "✅" if s >= 20 else "⚠️" if s >= 6 else "  "
    print(f"  {marker} [{vname}] {pn:30s} s={s:5.1f} | {debug} | {ft[:60]}")
