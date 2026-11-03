import catalog from '../public/data/samples/catalog.json' with {type:'json'};

export const sampleCatalog=catalog;
export const findSample=(id:string)=>catalog.samples.find(s=>s.id===id);
export const sampleProvenance=(sha256:string)=>catalog.samples.find(s=>s.sha256===sha256);
