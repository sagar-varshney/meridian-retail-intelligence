"""Build Olist transaction subsets and an independent UCI forecasting benchmark.

Sources are downloaded from the official publishers. No purchases, prices,
customer identities or calendar dates are simulated.
"""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]


def build_olist(path):
    with ZipFile(path) as z:
        orders = pd.read_csv(z.open('olist_orders_dataset.csv'))
        items = pd.read_csv(z.open('olist_order_items_dataset.csv'))
        customers = pd.read_csv(z.open('olist_customers_dataset.csv'))
        products = pd.read_csv(z.open('olist_products_dataset.csv'))
        translation = pd.read_csv(z.open('product_category_name_translation.csv'))
    source = 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce'
    citation = 'Olist. (2018). Brazilian E-Commerce Public Dataset by Olist. Kaggle.'
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    # Stable aliases preserve original relationships across all exported quarters.
    order_ids = {v: f'O{i:06}' for i, v in enumerate(sorted(orders.order_id.unique()))}
    product_ids = {v: f'P{i:06}' for i, v in enumerate(sorted(products.product_id.unique()))}
    customer_ids = {v: f'B{i:06}' for i, v in enumerate(sorted(customers.customer_unique_id.unique()))}
    product_names = products.merge(translation, on='product_category_name', how='left', validate='many_to_one')
    d = items.merge(orders[['order_id', 'customer_id', 'order_status', 'order_purchase_timestamp']], on='order_id', validate='many_to_one')
    d = d.merge(customers[['customer_id', 'customer_unique_id']], on='customer_id', validate='many_to_one')
    d = d.merge(product_names[['product_id', 'product_category_name_english']], on='product_id', validate='many_to_one')
    d = d[d.order_status.eq('delivered')].copy()
    original_units, original_value = len(d), float(d.price.sum())
    # Repeated unit lines are quantities, not erroneous exact duplicates.
    d = d.groupby(['order_id', 'product_id', 'price', 'customer_unique_id', 'order_purchase_timestamp'], dropna=False).agg(
        quantity=('order_item_id', 'size'), category=('product_category_name_english', 'first')).reset_index()
    assert int(d.quantity.sum()) == original_units
    assert abs(float((d.quantity*d.price).sum())-original_value) < 1e-6
    rows = pd.DataFrame({
        'Invoice': d.order_id.map(order_ids), 'StockCode': d.product_id.map(product_ids),
        'Description': d.category.fillna('uncategorised').str.replace('_', ' ') + ' | ' + d.product_id.map(product_ids),
        'Quantity': d.quantity, 'InvoiceDate': d.order_purchase_timestamp,
        'Price': d.price, 'Customer ID': d.customer_unique_id.map(customer_ids), 'Country': 'Brazil',
    }).sort_values(['InvoiceDate', 'Invoice', 'StockCode'], kind='stable')
    assert rows[['Invoice', 'StockCode', 'Customer ID']].notna().all().all()
    out = ROOT / 'public/data/samples'
    manifest = json.loads((out / 'catalog.json').read_text())
    manifest['samples'] = [s for s in manifest['samples'] if s.get('sourceId') != 'olist']
    for quarter, start, end in [('2017-q1', '2017-01-01', '2017-04-01'), ('2017-q2', '2017-04-01', '2017-07-01'), ('2017-q3', '2017-07-01', '2017-10-01')]:
        part = rows[rows.InvoiceDate.ge(start) & rows.InvoiceDate.lt(end)]
        data = part.to_csv(index=False, lineterminator='\n').encode()
        assert len(part) <= 20000 and len(data) < 3000000
        filename = f'olist-{quarter}.csv'
        (out / filename).write_bytes(data)
        manifest['samples'].append({
            'id': f'olist-{quarter}', 'name': f'Olist Brazil {quarter.upper()}', 'country': 'Brazil',
            'description': 'Delivered marketplace purchases. Descriptions show product categories and stable SKU aliases.',
            'filename': filename, 'url': f'/data/samples/{filename}', 'rows': len(part), 'bytes': len(data),
            'from': part.InvoiceDate.min()[:10], 'to': part.InvoiceDate.max()[:10], 'currency': 'BRL',
            'sha256': hashlib.sha256(data).hexdigest(), 'sourceId': 'olist', 'source': 'Olist Brazilian E-Commerce',
            'sourceUrl': source, 'citation': citation, 'license': 'CC BY-NC-SA 4.0',
            'licenseUrl': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
            'sourceArchiveSha256': source_hash,
            'transformations': 'Delivered orders only; purchase-quarter filter; stable order, product and customer_unique_id aliases. Same order/product/price unit lines combined into quantities. Category labels are not original product names. Prices are BRL; freight is excluded. Cancelled orders and refunds are not represented.',
        })
    (out / 'catalog.json').write_text(json.dumps(manifest, indent=2) + '\n')


def build_weekly(path):
    with ZipFile(path) as z:
        raw = z.read('Sales_Transactions_Dataset_Weekly.csv')
    data = pd.read_csv(__import__('io').BytesIO(raw))
    y = data[[f'W{i}' for i in range(52)]].to_numpy(dtype=float)
    assert y.shape == (811, 52) and np.isfinite(y).all() and (y >= 0).all()
    predictors = {'previous_week': lambda i: y[:, i-1],
                  'rolling_mean': lambda i: y[:, i-4:i].mean(axis=1),
                  'historical_mean': lambda i: y[:, :i].mean(axis=1)}
    def score(model, weeks):
        actual = y[:, weeks]
        predictions = np.column_stack([predictors[model](i) for i in weeks])
        errors = np.abs(actual-predictions)
        return {'mae': float(errors.mean()), 'wape': float(errors.sum()/actual.sum()), 'weeks': len(weeks),
                'productWeeks': int(errors.size), 'absoluteError': float(errors.sum()), 'actualUnits': float(actual.sum())}
    scores = [{'id': m, 'selection': score(m, list(range(32, 44))), 'test': score(m, list(range(44, 52)))} for m in predictors]
    champion = min(scores, key=lambda s: s['selection']['wape'])['id']
    result = {
        'source': 'UCI Sales Transactions Weekly', 'sourceUrl': 'https://archive.ics.uci.edu/dataset/396/sales+transactions+dataset+weekly',
        'citation': 'Tan, J. (2014). Sales Transactions Weekly. UCI Machine Learning Repository. https://doi.org/10.24432/C5XS4Q.',
        'license': 'CC BY 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
        'sha256': hashlib.sha256(raw).hexdigest(), 'products': len(data), 'observations': int(y.size),
        'selectionWeeks': 'W32–W43', 'testWeeks': 'W44–W51', 'champion': champion, 'scores': scores,
        'rawUrl': '/data/evidence/sales-transactions-weekly.csv',
        'method': 'Same 811 products and same eight later weeks for every method. Global method selected using W32–W43 only. Each prediction uses earlier weeks; W44–W51 outcomes are not used for selection. Raw purchased units, not the supplied normalized columns.',
        'limitations': '52 indexed weeks; calendar dates, customer IDs, order baskets, prices and costs are absent. This is a forecasting benchmark, not transaction or profit data. It evaluates simple baselines, not the full historical random-forest study. Results are retrospective and exploratory; no untouched future deployment claim.',
    }
    out = ROOT / 'public/data/evidence'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'sales-transactions-weekly.csv').write_bytes(raw)
    (out / 'weekly-benchmark.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'champion': champion, 'scores': scores}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--olist', type=Path, required=True)
    parser.add_argument('--weekly', type=Path, required=True)
    args = parser.parse_args()
    build_olist(args.olist)
    build_weekly(args.weekly)
