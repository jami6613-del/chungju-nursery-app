import { supabase } from '../supabaseClient';
import type { Order } from '../types';
import type { StatementProvider, StatementRecord, StatementSnapshot, StatementSummary } from './transactionStatement';

function errorMessage(error: {message: string}): Error { return new Error(error.message); }
export async function fetchStatementProvider(): Promise<StatementProvider> {
  const {data,error} = await supabase.rpc('statement_provider');
  if (error) throw errorMessage(error);
  if (!data?.name || !data?.account) throw new Error('육묘장 발급정보를 불러오지 못했습니다. 관리자에게 설정을 확인해 주세요.');
  return data as StatementProvider;
}
export async function fetchStatementCustomerNames(): Promise<string[]> {
  const {data,error} = await supabase.rpc('statement_customer_names');
  if (error) throw errorMessage(error);
  return (data || []).map((row: {name: string}) => row.name);
}
export async function fetchStatementContact(name: string): Promise<string> {
  const {data,error} = await supabase.from('season_orders_items').select('contact')
    .eq('orderer',name).not('contact','is',null).neq('contact','').order('updated_at',{ascending:false}).limit(1);
  if (error) throw errorMessage(error);
  return data?.[0]?.contact || '';
}
export async function fetchStatementOrders(name: string, from: string, to: string, dateType: 'shipping_date'|'sowing_date', shippedOnly: boolean): Promise<Order[]> {
  const rows: Order[] = [];
  for (let offset=0;;offset+=500) {
    let query = supabase.from('orders').select('*').eq('customer_name',name)
      .gte(dateType,from).lte(dateType,to).order(dateType,{ascending:true}).order('id',{ascending:true}).range(offset,offset+499);
    if (shippedOnly) query = query.not('shipping_quantity','is',null).not('shipping_date','is',null);
    const {data,error} = await query;
    if (error) throw errorMessage(error);
    rows.push(...(data || []) as Order[]);
    if (!data || data.length<500) return rows;
  }
}
export async function saveStatement(id: string, payload: StatementSnapshot): Promise<StatementRecord> {
  const {data,error} = await supabase.from('transaction_statements').insert({id,payload}).select('*').single();
  if (!error) return data as StatementRecord;
  // A network timeout after COMMIT must not create a second invoice on retry.
  const existing = await supabase.from('transaction_statements').select('*').eq('id',id).maybeSingle();
  if (!existing.error && existing.data) return existing.data as StatementRecord;
  throw errorMessage(error);
}
export async function getStatement(id: string): Promise<StatementRecord> {
  const {data,error} = await supabase.from('transaction_statements').select('*').eq('id',id).single();
  if (error) throw errorMessage(error);
  return data as StatementRecord;
}
export interface StatementSearch { query: string; from: string; to: string; }
export async function searchStatements(search: StatementSearch, page=0): Promise<{rows: StatementSummary[]; count: number}> {
  let query = supabase.from('transaction_statements')
    .select('id,document_number,customer_name,trade_date,total_amount,deposit_amount,created_at,created_by',{count:'exact'})
    .order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*30,page*30+29);
  if (search.from) query=query.gte('trade_date',search.from);
  if (search.to) query=query.lte('trade_date',search.to);
  const term=search.query.trim();
  if (term) {
    // Quoted PostgREST literals prevent comma/parenthesis injection; escape LIKE wildcards.
    const escaped=term.replace(/[\\%_]/g,'\\$&');
    const pattern=JSON.stringify(`%${escaped}%`);
    query=query.or(`customer_name.ilike.${pattern},crop_search.ilike.${pattern},document_number.ilike.${pattern}`);
  }
  const {data,error,count} = await query;
  if (error) throw errorMessage(error);
  return {rows:(data || []) as StatementSummary[],count:count || 0};
}
