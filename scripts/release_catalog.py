"""Merge versioned vendor extensions into a release view, never the old catalog."""
import json

def release_catalog(checked,files):
    index=json.loads(checked('web/public/data/vendor_index.json'));vendors={slug:json.loads(checked(f'web/public/data/vendors/{slug}.json')) for slug in index['vendors']}
    lookup=json.loads(checked('web/public/data/pn_lookup.json'))
    collided=set()
    if 'data/extensions/compiled.json' in files:
        registry=json.loads(checked('data/extensions/compiled.json'))
        if registry.get('version')!=1:raise ValueError('Extension version')
        for vendor in registry['vendors']:
            slug=vendor['slug']
            if slug in vendors:raise ValueError('Vendor namespace collision')
            pns=[p['part_number'] for p in vendor['products']]
            folded=[pn.lower() for pn in pns]
            if len(set(folded))!=len(pns) or vendor['productCount']!=len(pns):raise ValueError('Extension identity/count mismatch')
            vendors[slug]=vendor
            index['vendors'][slug]={'name':vendor['name'],'productCount':len(pns),'pns':pns}
            for pn in folded:
                # Keep exact vendor-qualified search available even on PN collision;
                # the legacy unqualified shortcut must not silently choose a vendor.
                if pn in lookup:lookup.pop(pn);collided.add(pn)
                elif pn not in collided:lookup[pn]=slug
    return index,vendors,lookup
