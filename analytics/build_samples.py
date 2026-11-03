"""Export reproducible merchandise CSV subsets from UCI Online Retail II.

No values are simulated. Credits, missing IDs and duplicate source rows remain
in each sample so the importer's cleaning decisions can be inspected.
"""
import argparse
import hashlib
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://archive.ics.uci.edu/dataset/502/online+retail+ii'
CITATION = 'Chen, D. (2012). Online Retail II. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D'


def build_samples(input_path):
    source_hash = hashlib.sha256(input_path.read_bytes()).hexdigest()
    study = json.loads((ROOT / 'public/data/retail-demo.json').read_text())
    if source_hash != study['meta']['sha256']:
        raise ValueError('Use the original workbook recorded in the built-in study.')
    raw = pd.concat(pd.read_excel(input_path, sheet_name=None).values(), ignore_index=True)
    fields = ['Invoice', 'StockCode', 'Description', 'Quantity', 'InvoiceDate', 'Price', 'Customer ID', 'Country']
    merchandise = raw.StockCode.astype(str).str.strip().str.upper().str.fullmatch(r'\d{5}[A-Z]*', na=False)
    output = ROOT / 'public/data/samples'
    output.mkdir(parents=True, exist_ok=True)
    samples = []
    for country, purpose in [
        ('France', 'Explore customer groups, repeat purchases and product pairs.'),
        ('Germany', 'Inspect a larger export market and evaluate a weekly sales baseline.'),
        ('Netherlands', 'Explore larger order sizes and see how gaps limit forecast evaluation.'),
        ('Spain', 'Compare a second export market across the full observation period.'),
        ('Switzerland', 'Inspect purchase sizes and repeat customer behaviour.'),
        ('Belgium', 'Explore product pairs and customer profiles in a smaller market.'),
        ('Portugal', 'Compare country-specific product mixes and purchase frequency.'),
        ('Italy', 'Inspect a small sample and its analysis-availability limits.'),
    ]:
        rows = raw.loc[merchandise & raw.Country.eq(country), fields].copy()
        rows = rows.sort_values('InvoiceDate', kind='stable')
        first, last = rows.InvoiceDate.min(), rows.InvoiceDate.max()
        rows['InvoiceDate'] = rows.InvoiceDate.dt.strftime('%Y-%m-%d %H:%M:%S')
        rows['Customer ID'] = rows['Customer ID'].map(lambda v: str(int(v)) if pd.notna(v) else '')
        sample_id = country.lower()
        filename = f'online-retail-ii-{sample_id}.csv'
        data = rows.to_csv(index=False, lineterminator='\n').encode('utf-8')
        if len(rows) > 20000 or len(data) > 3000000:
            raise ValueError(f'{country} does not fit the interactive import limits.')
        (output / filename).write_bytes(data)
        samples.append({
            'id': sample_id, 'name': f'{country} retail study', 'country': country,
            'description': purpose, 'filename': filename, 'url': f'/data/samples/{filename}',
            'rows': len(rows), 'bytes': len(data), 'from': str(first.date()), 'to': str(last.date()),
            'currency': 'GBP', 'sourceId': 'uci-retail-ii', 'source': 'UCI Online Retail II',
            'sourceUrl': SOURCE, 'citation': CITATION, 'license': 'CC BY 4.0',
            'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
            'transformations': 'Country and merchandise-code filtering; ISO dates. Duplicates and credits retained.',
            'sha256': hashlib.sha256(data).hexdigest(),
        })
    previous = json.loads((output / 'catalog.json').read_text()) if (output / 'catalog.json').exists() else {'samples': []}
    samples += [s for s in previous['samples'] if s.get('sourceId', 'uci-retail-ii') != 'uci-retail-ii']
    manifest = {'source': 'UCI Online Retail II', 'sourceUrl': SOURCE, 'citation': CITATION,
                'license': 'CC BY 4.0', 'sourceWorkbookSha256': source_hash,
                'transformations': 'Country and merchandise-code filter only; ISO date formatting and customer-ID formatting. Source duplicates and credits retained.',
                'samples': samples}
    (output / 'catalog.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(samples, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    args = parser.parse_args()
    build_samples(args.input)
