"""Rebuild the historical study from the original public workbook, never synthetic sales.

python analytics/prepare.py --input /path/to/online_retail_II.xlsx
"""
import argparse
from collections import Counter
from itertools import combinations
from pathlib import Path
import hashlib
import json
import math
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import adjusted_rand_score, silhouette_score

ROOT = Path(__file__).resolve().parents[1]

def apriori(baskets, min_support=.01, max_items=80, max_length=3):
    """Breadth-first Apriori joins + subset pruning, bitset support counting."""
    counts = Counter(p for b in baskets for p in b)
    chosen = [p for p, _ in counts.most_common(max_items)]
    bits = {p: 0 for p in chosen}
    for i, basket in enumerate(baskets):
        for p in basket & bits.keys():
            bits[p] |= 1 << i
    minimum = max(20, math.ceil(len(baskets) * min_support))
    support = {(p,): counts[p] for p in chosen if counts[p] >= minimum}
    previous = set(support)
    for length in range(2, max_length + 1):
        candidates = set()
        ordered = sorted(previous)
        for i, a in enumerate(ordered):
            for b in ordered[i + 1:]:
                if a[:-1] != b[:-1]:
                    continue
                candidate = tuple(sorted(set(a) | set(b)))
                if len(candidate) == length and all(tuple(v) in previous for v in combinations(candidate, length - 1)):
                    candidates.add(candidate)
        current = set()
        for candidate in candidates:
            hit = bits[candidate[0]]
            for p in candidate[1:]:
                hit &= bits[p]
            count = hit.bit_count()
            if count >= minimum:
                support[candidate] = count
                current.add(candidate)
        previous = current
        if not previous:
            break
    return support, bits

def forecast(weekly):
    y = weekly.to_numpy(dtype=float)
    def features(i):
        h = y[:i]
        if len(h) < 13 or np.isnan(h[-13:]).any():
            return None
        w = weekly.index[i].isocalendar().week if i < len(weekly) else (weekly.index[-1] + pd.Timedelta(weeks=i-len(weekly)+1)).isocalendar().week
        return [h[-1], h[-2], h[-4], np.mean(h[-4:]), np.mean(h[-13:]), math.sin(2*math.pi*w/52), math.cos(2*math.pi*w/52), i]
    predictions = []
    for i in range(max(52, len(y)-20), len(y)):
        if not np.isfinite(y[i]):
            continue
        row = {'week': str(weekly.index[i].date()), 'actual': float(y[i]), 'previous_week': None,
               'rolling_mean': None, 'seasonal': None, 'random_forest': None}
        if np.isfinite(y[i-1]): row['previous_week'] = float(y[i-1])
        if np.isfinite(y[i-4:i]).all(): row['rolling_mean'] = float(np.mean(y[i-4:i]))
        if i >= 52 and np.isfinite(y[i-52]): row['seasonal'] = float(y[i-52])
        valid = [j for j in range(13, i) if features(j) is not None and np.isfinite(y[j])]
        if len(valid) >= 20 and features(i) is not None:
            model = RandomForestRegressor(n_estimators=100, max_depth=4, min_samples_leaf=3, random_state=42, n_jobs=1)
            model.fit([features(j) for j in valid], y[valid])
            row['random_forest'] = float(model.predict([features(i)])[0])
        predictions.append(row)
    selection, test = predictions[:-8], predictions[-8:]
    models = ['previous_week', 'rolling_mean', 'seasonal', 'random_forest']
    def metrics(rows, model):
        valid = [r for r in rows if r[model] is not None]
        if len(valid) != len(rows) or not valid: return None
        errors = [abs(r['actual'] - r[model]) for r in valid]
        total = sum(r['actual'] for r in valid)
        return {'mae': float(np.mean(errors)), 'wape': sum(errors)/total if total else None, 'weeks': len(valid)}
    scores = [{'id': m, 'selection': metrics(selection, m), 'test': metrics(test, m)} for m in models]
    eligible = [s for s in scores if s['selection'] is not None and s['selection']['wape'] is not None]
    champion = min(eligible, key=lambda v: v['selection']['wape'])['id'] if eligible else 'rolling_mean'
    # Operational next-week prediction uses only the last fully observed week.
    if champion == 'random_forest':
        valid = [j for j in range(13, len(y)) if features(j) is not None and np.isfinite(y[j])]
        next_x = features(len(y))
        final = RandomForestRegressor(n_estimators=100, max_depth=4, min_samples_leaf=3, random_state=42, n_jobs=1)
        final.fit([features(j) for j in valid], y[valid])
        next_value = float(final.predict([next_x])[0]) if next_x is not None else None
    elif champion == 'previous_week': next_value = float(y[-1]) if np.isfinite(y[-1]) else None
    elif champion == 'seasonal': next_value = float(y[-52]) if len(y)>=52 and np.isfinite(y[-52]) else None
    else: next_value = float(np.mean(y[-4:])) if np.isfinite(y[-4:]).all() else None
    return {'champion': champion, 'scores': scores, 'selectionWeeks': len(selection), 'testWeeks': len(test),
        'testStart': test[0]['week'] if test else None,
        'history': [{'week': str(d.date()), 'actual': None if pd.isna(v) else float(v)} for d,v in weekly.items()],
        'predictions': predictions, 'next': {'week': str((weekly.index[-1]+pd.Timedelta(days=7)).date()), 'value': next_value},
        'note': 'Rolling one-week-ahead evaluation. Champion selected on the preceding selection window, then evaluated on eight later weeks. This dataset was explored during feasibility; this is a chronological backtest, not a pristine external benchmark. Target is observed positive merchandise sales, not unconstrained demand.'}

def build(input_path, cache_path=None):
    if cache_path and cache_path.exists(): raw = pd.read_pickle(cache_path)
    else:
        sheets = pd.read_excel(input_path, sheet_name=None)
        raw = pd.concat(list(sheets.values()), ignore_index=True)
    raw = raw.drop(columns=['source_sheet'], errors='ignore').rename(columns={'Invoice': 'invoice', 'StockCode': 'product',
        'Description': 'description', 'Quantity': 'quantity', 'InvoiceDate': 'date', 'Price': 'price', 'Customer ID': 'customer', 'Country': 'country'})
    raw_count = len(raw)
    missing = int(raw.customer.isna().sum())
    duplicate_count = int(raw.duplicated().sum())
    d = raw.drop_duplicates().copy()
    d['product'] = d['product'].astype(str).str.strip().str.upper()
    d['invoice'] = d.invoice.astype(str).str.strip()
    d['country'] = d.country.fillna('Unknown').astype(str)
    d['customer'] = d.customer.map(lambda v: str(int(v)) if pd.notna(v) else '')
    merchandise = d['product'].str.fullmatch(r'\d{5}[A-Z]*', na=False)
    purchase = merchandise & d.quantity.gt(0) & d.price.gt(0) & ~d.invoice.str.upper().str.startswith('C') & d.date.notna()
    credit = merchandise & d.quantity.lt(0) & d.price.gt(0) & d.date.notna()
    sales, credits = d[purchase].copy(), d[credit].copy()
    sales['value'] = sales.quantity * sales.price
    credits['value'] = -credits.quantity * credits.price
    sales['month'] = sales.date.dt.strftime('%Y-%m')
    credits['month'] = credits.date.dt.strftime('%Y-%m')
    orders = sales.groupby(['invoice','country','customer']).agg(date=('date','min'), value=('value','sum'), units=('quantity','sum')).reset_index()
    order_rows = [[str(r.date.date()), r.country, r.customer, round(r.value,2), int(r.units), r.invoice] for r in orders.itertuples()]
    products = sales.groupby('product').agg(name=('description','last'), revenue=('value','sum'), units=('quantity','sum'), orders=('invoice','nunique')).reset_index()
    product_rows = [{**r, 'name': str(r['name']).strip(), 'revenue': round(r['revenue'],2)} for r in products.to_dict('records')]
    pf = sales.groupby(['month','country','product']).agg(value=('value','sum'), units=('quantity','sum'), orders=('invoice','nunique')).reset_index()
    product_facts = [[r.month,r.country,r.product,round(r.value,2),int(r.units),int(r.orders)] for r in pf.itertuples()]
    cf = credits.groupby(['month','country']).agg(value=('value','sum'), lines=('invoice','size')).reset_index()
    credit_rows = [[r.month,r.country,round(r.value,2),int(r.lines)] for r in cf.itertuples()]
    identified = sales[sales.customer.ne('')]
    asof = sales.date.max().normalize()+pd.Timedelta(days=1)
    customers = identified.groupby('customer').agg(first=('date','min'), last=('date','max'), frequency=('invoice','nunique'), monetary=('value','sum'), country=('country','last'))
    customers['recency'] = (asof-customers['last'].dt.normalize()).dt.days
    x = np.log1p(customers[['recency','frequency','monetary']].to_numpy())
    x = (x-x.mean(axis=0))/x.std(axis=0)
    km = KMeans(n_clusters=4,n_init=10,random_state=42).fit(x)
    means = customers.assign(cluster=km.labels_).groupby('cluster').monetary.median().sort_values(ascending=False).index.tolist()
    remap = {c:i for i,c in enumerate(means)}
    customers['cluster'] = [remap[c] for c in km.labels_]
    label_names = ['High-value regulars', 'Established customers', 'Occasional customers', 'Low-spend customers']
    cluster_profiles = []
    for i, group in customers.groupby('cluster'):
        cluster_profiles.append({'id': int(i), 'name': label_names[i], 'customers': len(group),
            'recency': float(group.recency.median()), 'frequency': float(group.frequency.median()),
            'monetary': float(group.monetary.median()), 'revenue': float(group.monetary.sum())})
    other_labels = KMeans(n_clusters=4,n_init=10,random_state=7).fit_predict(x)
    cluster_quality = {'silhouette': float(silhouette_score(x,km.labels_,sample_size=min(2000,len(x)),random_state=42)),
        'seedStabilityARI': float(adjusted_rand_score(km.labels_,other_labels)), 'method': 'K-means, k=4, log1p standardized RFM, ten initializations, seed 42. Names are descriptive labels, not proven campaign responses.'}
    customer_rows = [{'id': str(i), 'country':r.country, 'first':str(r['first'].date()), 'last':str(r['last'].date()),
        'recency':int(r.recency),'frequency':int(r.frequency),'monetary':round(r.monetary,2),'cluster':int(r.cluster)} for i,r in customers.iterrows()]
    months = sorted(sales.month.unique())
    complete_month = (sales.date.max().to_period('M')-1).strftime('%Y-%m')
    customer_months = identified.assign(month=identified.date.dt.to_period('M')).groupby('customer').month.agg(set)
    cohort_groups = {}
    for cid, history in customer_months.items(): cohort_groups.setdefault(min(history), []).append(history)
    cohorts = []
    for first, histories in sorted(cohort_groups.items()):
        if str(first)>complete_month: continue
        retention = []
        for age in range(12):
            target = first+age
            retention.append(sum(target in h for h in histories)/len(histories) if str(target)<=complete_month else None)
        cohorts.append({'month':str(first),'customers':len(histories),'retention':retention})
    print('Aggregations and RFM complete', flush=True)
    discovery = sales[sales.date < '2011-01-01'].groupby('invoice')['product'].agg(set).tolist()
    validation = sales[sales.date >= '2011-01-01'].groupby('invoice')['product'].agg(set).tolist()
    supports,bits = apriori(discovery)
    validation_bits = {p:0 for p in bits}
    for i,basket in enumerate(validation):
        for p in basket & validation_bits.keys(): validation_bits[p] |= 1<<i
    def hits(items, lookup):
        hit = lookup[items[0]]
        for p in items[1:]: hit &= lookup[p]
        return hit.bit_count()
    names = dict(zip(products['product'],products.name))
    rules = []
    for items, count in supports.items():
        if len(items)<2: continue
        for consequent in items:
            antecedent = tuple(p for p in items if p!=consequent)
            a_count = supports[antecedent]
            confidence = count/a_count
            lift = confidence/(supports[(consequent,)]/len(discovery))
            if confidence<.2 or lift<1.2: continue
            vc = hits(items,validation_bits); va=hits(antecedent,validation_bits); vb=hits((consequent,),validation_bits)
            rules.append({'id': '|'.join(antecedent)+'>'+consequent,'antecedent':list(antecedent),'consequent':consequent,
                'antecedentNames':[str(names[p]).strip() for p in antecedent], 'consequentName':str(names[consequent]).strip(),
                'count':count,'support':count/len(discovery),'confidence':confidence,'lift':lift,
                'validationCount':vc,'validationConfidence':vc/va if va else None,
                'validationLift':vc*len(validation)/(va*vb) if va and vb else None})
    rules.sort(key=lambda r:(-r['lift'],-r['count']))
    rules_total=len(rules);rules=rules[:300]
    weekly = sales.groupby(sales.date.dt.to_period('W-SUN').dt.start_time).quantity.sum().sort_index()
    weekly = weekly.reindex(pd.date_range(weekly.index.min(),weekly.index.max(),freq='7D'))
    weekly = weekly[(weekly.index>=sales.date.min().normalize()) & (weekly.index+pd.Timedelta(days=7)<=sales.date.max())]
    print('Apriori complete; running chronological forecast evaluation', flush=True)
    forecasts=forecast(weekly)
    quality = [{'name':'Exact duplicate rows','count':duplicate_count,'handling':'Quarantined; one copy kept for analysis.'},
        {'name':'Missing customer IDs','count':missing,'handling':'Kept for sales and baskets; excluded from customer analysis.'},
        {'name':'Merchandise credit lines','count':len(credits),'handling':'Reported separately from positive purchases.'},
        {'name':'Other excluded records','count':len(d)-len(sales)-len(credits),'handling':'Service codes, free items or invalid values; retained in the source workbook.'},
        {'name':'Weeks without source records','count':int(weekly.isna().sum()),'handling':'Kept as missing; never filled with zero.'}]
    report={'version':1,'meta':{'id':'uci-retail-ii','name':'Online Retail II','source':'UCI Machine Learning Repository',
        'sourceUrl':'https://archive.ics.uci.edu/dataset/502/online+retail+ii','license':'CC BY 4.0','currency':'GBP',
        'citation':'Chen, D. (2012). Online Retail II. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D',
        'rawRows':raw_count,'acceptedRows':len(sales),'creditRows':len(credits),'duplicateRows':duplicate_count,
        'from':str(sales.date.min().date()),'to':str(sales.date.max().date()),'asOf':str(asof.date()),
        'sha256':hashlib.sha256(input_path.read_bytes()).hexdigest(),'historical':True,'country':'United Kingdom',
        'transformations':'Duplicate quarantine; positive merchandise purchase filter; separate credits; missing IDs excluded only from customer analysis.',
        'lastCompleteMonth':complete_month},
        'months':months,'countries':sorted(sales.country.unique().tolist()),'orders':order_rows,'products':product_rows,
        'productFacts':product_facts,'credits':credit_rows,'customers':customer_rows,'segments':cluster_profiles,
        'clusterQuality':cluster_quality,'cohorts':cohorts,'rules':rules,
        'mining':{'algorithm':'Apriori','maxLength':3,'topProducts':80,'minSupport':.01,'minConfidence':.2,
            'discoveryBefore':'2011-01-01','discoveryOrders':len(discovery),'validationOrders':len(validation),
            'totalRules':rules_total,'displayedRules':len(rules),'scope':'Top 80 discovery-period products; up to 3-item sets. Displayed rules ranked on discovery lift only. Associations are not causal effects.'},
        'forecast':forecasts,'quality':quality}
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--cache',type=Path);parser.add_argument('--output',type=Path,default=ROOT/'public/data/retail-demo.json')
    args=parser.parse_args();report=build(args.input,args.cache)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,separators=(',',':'),allow_nan=False))
    print(json.dumps({'output':str(args.output),'bytes':args.output.stat().st_size,'orders':len(report['orders']),
        'customers':len(report['customers']),'rules':len(report['rules']),'champion':report['forecast']['champion']}),flush=True)
