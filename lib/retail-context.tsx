'use client';
import {createContext,useContext} from 'react';
import type {RetailReport,Action} from './retail';
export type RetailContextValue={report:RetailReport;datasetId:string;role:string;members:any[];actions:Action[];
 api:(path:string,options?:RequestInit)=>Promise<any>;notice:(s:string)=>void;go:(s:string)=>void;
 draft:(title?:string,evidence?:string,description?:string)=>void;inspectProduct:(p:string)=>void;
 exportRows:(name:string,headers:string[],rows:any[][])=>void;
 refreshActions:()=>Promise<void>;openAction:(a:Action)=>void;updateAction:(id:string,patch:any)=>Promise<void>;
 openImport:()=>void;refreshWorkspace:()=>Promise<any>;selectDataset:(id:string)=>void;
};
export const RetailContext=createContext<RetailContextValue|null>(null);
export function useRetail(){const v=useContext(RetailContext);if(!v)throw new Error('Retail context unavailable');return v}
