import React from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CUSTOMER_PRESETS, getCustomerPreset, getOrdererForCertificate } from '../lib/certificatePresets';
import type { Order } from '../types';
import {
  appendOrders, blankStatement, blankStatementLine, canUseStatements, isUsedLine, lineAmount,
  makeSnapshot, money, numberValue, statementTotal, validateStatement, isValidDate,
  type StatementDraft, type StatementLine, type StatementRecord, type StatementSnapshot, type StatementSummary,
} from '../lib/transactionStatement';
import { fetchStatementProvider, fetchStatementContact, fetchStatementCustomerNames, fetchStatementOrders, getStatement, saveStatement, searchStatements, type StatementSearch } from '../lib/transactionStatementApi';
import { createStatementOutput, downloadStatementFile, releaseStatementOutput, type StatementOutput } from '../lib/transactionStatementOutput';

const input='w-full min-w-0 rounded-lg border border-autumn-border bg-autumn-surface px-3 py-2 text-base text-autumn-ink';
const button='rounded-xl border border-autumn-border bg-autumn-surface px-4 py-3 text-sm font-semibold text-autumn-ink disabled:opacity-50';
const primary=`${button} !border-brand !bg-brand !text-white`;
function Field({label,children}: {label: string; children: React.ReactNode}) {return <label className="flex min-w-0 flex-col gap-1 text-sm text-autumn-ink"><span>{label}</span>{children}</label>;}
function message(error: unknown): string {
  const text=error instanceof Error?error.message:'';
  return /[가-힣]/.test(text)?text:'처리하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
}
type Prepared={id: string; snapshot: StatementSnapshot; output: StatementOutput; record: StatementRecord|null};

/** The frame is fully loaded before the user's print click; no delayed popup or lost gesture. */
function PrintFrame({urls,frame,onReady}: {urls: string[]; frame: React.RefObject<HTMLIFrameElement>; onReady: (value:boolean)=>void}) {
  React.useEffect(()=>{
    const doc=frame.current?.contentDocument;
    if(!doc)return;
    let active=true;onReady(false);
    doc.open();doc.write('<!doctype html><html lang="ko"><head><title>거래명세서 인쇄</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:white}img{display:block;width:210mm;height:297mm;break-after:page;page-break-after:always;break-inside:avoid}img:last-child{break-after:auto;page-break-after:auto}</style></head><body></body></html>');doc.close();
    Promise.all(urls.map(url=>new Promise<void>((resolve,reject)=>{
      const image=doc.createElement('img');image.alt='고객용·보관용 거래명세서';image.onload=()=>resolve();image.onerror=()=>reject(new Error('인쇄 이미지 불러오기 실패'));image.src=url;doc.body.appendChild(image);
    }))).then(()=>{if(active)onReady(true);}).catch(()=>{if(active)onReady(false);});
    return ()=>{active=false;};
  },[urls,frame,onReady]);
  return <iframe ref={frame} title="거래명세서 인쇄 문서" aria-hidden="true" tabIndex={-1} style={{position:'fixed',left:-10000,top:0,width:794,height:1123,border:0}} />;
}

export function TransactionStatementPage() {
  const {user,isLoading}=useAuth();
  const allowed=canUseStatements(user);
  const [tab,setTab]=React.useState<'write'|'history'>('write');
  const [draft,setDraft]=React.useState<StatementDraft>(blankStatement);
  const [names,setNames]=React.useState<string[]>(Object.keys(CUSTOMER_PRESETS));
  const [sourceName,setSourceName]=React.useState('');
  const [dateType,setDateType]=React.useState<'shipping_date'|'sowing_date'>('shipping_date');
  const [shippedOnly,setShippedOnly]=React.useState(true);
  const [candidates,setCandidates]=React.useState<Order[]|null>(null);
  const [crop,setCrop]=React.useState('');
  const [selected,setSelected]=React.useState<Set<string>>(new Set());
  const [busy,setBusy]=React.useState('');
  const [error,setError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [prepared,setPrepared]=React.useState<Prepared|null>(null);
  const [mode,setMode]=React.useState<'print'|'image'>('print');
  const [printMethod,setPrintMethod]=React.useState<'native'|'pdf'>('native');
  const [printReady,setPrintReady]=React.useState(false);
  const printFrame=React.useRef<HTMLIFrameElement>(null);
  const contactRequest=React.useRef(0);
  const operation=React.useRef(false);
  const mounted=React.useRef(true);
  const [search,setSearch]=React.useState<StatementSearch>({query:'',from:'',to:''});
  const appliedSearch=React.useRef(search);
  const [history,setHistory]=React.useState<StatementSummary[]>([]);
  const [count,setCount]=React.useState(0);
  const [page,setPage]=React.useState(0);
  const historyRequest=React.useRef(0);

  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  React.useEffect(()=>{
    if(!allowed)return;
    let active=true;
    fetchStatementCustomerNames().then(list=>{if(active)setNames([...new Set([...Object.keys(CUSTOMER_PRESETS),...list])].sort((a,b)=>a.localeCompare(b,'ko')));})
      .catch(()=>{if(active)setNotice('주문자 목록을 불러오지 못했습니다. 이름을 직접 입력하거나 다시 접속해 주세요.');});
    return()=>{active=false;};
  },[allowed]);
  React.useEffect(()=>{const output=prepared?.output;return()=>{if(output)releaseStatementOutput(output);};},[prepared?.output]);
  const changed=React.useRef(false);
  const patch=(change: Partial<StatementDraft>)=>{changed.current=true;setDraft(prev=>({...prev,...change}));setError('');};
  React.useEffect(()=>{
    const warn=(event: BeforeUnloadEvent)=>{if(changed.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[]);
  const changeName=(name:string)=>{
    const request=++contactRequest.current;
    const preset=getCustomerPreset(name);
    patch({customerName:name,address:preset?.address || '',contact:preset?.contact || ''});
    setSourceName(getOrdererForCertificate(name));setCandidates(null);setSelected(new Set());setCrop('');
    if(!preset && name.trim())void fetchStatementContact(name.trim()).then(contact=>{
      if(mounted.current && request===contactRequest.current)setDraft(prev=>({...prev,contact}));
    }).catch(()=>{});
  };
  const editLine=(id:string,change:Partial<StatementLine>)=>{changed.current=true;setDraft(prev=>({...prev,lines:prev.lines.map(line=>line.id===id?{...line,...change}:line)}));setError('');};
  const total=statementTotal(draft.lines);
  const visibleCandidates=(candidates || []).filter(order=>!crop||order.crop_name===crop);
  const crops=[...new Set((candidates || []).map(order=>order.crop_name))];

  const loadOrders=async()=>{
    if(operation.current)return;
    if(!sourceName.trim()){setError('현황에서 찾을 주문자 이름을 입력해 주세요.');return;}
    if(!isValidDate(draft.dateFrom)||!isValidDate(draft.dateTo)||draft.dateFrom>draft.dateTo){setError('불러올 기간을 확인해 주세요.');return;}
    operation.current=true;setBusy('현황을 불러오는 중…');setError('');
    try {const rows=await fetchStatementOrders(sourceName.trim(),draft.dateFrom,draft.dateTo,dateType,shippedOnly);setCandidates(rows);setSelected(new Set());setCrop('');}
    catch(error){setError(message(error));}finally{operation.current=false;setBusy('');}
  };
  const importOrders=()=>{
    try {const next=appendOrders(draft.lines,(candidates || []).filter(order=>selected.has(order.id)));patch({lines:next});setNotice(`${next.filter(line=>line.sourceId).length}건의 현황 내역이 포함되어 있습니다. 수량·단가를 확인해 주세요.`);setCandidates(null);setSelected(new Set());}
    catch(error){setError(message(error));}
  };
  const prepare=async()=>{
    if(operation.current)return;
    const validation=validateStatement(draft);if(validation){setError(validation);return;}
    operation.current=true;setBusy('명세서 미리보기를 만드는 중…');setError('');setNotice('');
    try {
      const id=crypto.randomUUID(),snapshot=makeSnapshot(draft,id,await fetchStatementProvider()),output=await createStatementOutput(snapshot);
      if(mounted.current)setPrepared({id,snapshot,output,record:null});else releaseStatementOutput(output);
    }catch(error){setError(message(error));}finally{operation.current=false;setBusy('');}
  };
  const issue=async()=>{
    if(!prepared||prepared.record||operation.current)return;
    operation.current=true;setBusy('발급내역을 저장하는 중…');setError('');
    try {
      const record=await saveStatement(prepared.id,prepared.snapshot);
      setPrepared(prev=>prev?{...prev,record}:prev);changed.current=false;
      setNotice('발급내역이 저장되었습니다. 아래에서 인쇄하거나 이미지를 공유하세요.');
    }catch(error){setError(`발급내역 저장을 확인하지 못했습니다. 아직 인쇄·공유하지 않았습니다. ${message(error)}`);}
    finally{operation.current=false;setBusy('');}
  };
  const loadHistory=async(nextPage=0,criteria=search)=>{
    if((criteria.from&&!isValidDate(criteria.from))||(criteria.to&&!isValidDate(criteria.to))||(criteria.from&&criteria.to&&criteria.from>criteria.to)){setError('검색 기간을 확인해 주세요.');return;}
    const request=++historyRequest.current;setBusy('발급내역을 검색하는 중…');setError('');
    try {const result=await searchStatements(criteria,nextPage);if(request!==historyRequest.current||!mounted.current)return;setHistory(result.rows);setCount(result.count);setPage(nextPage);appliedSearch.current=criteria;}
    catch(error){if(request===historyRequest.current)setError(message(error));}finally{if(request===historyRequest.current)setBusy('');}
  };
  const openSaved=async(id:string)=>{
    if(operation.current)return;
    operation.current=true;setBusy('보관된 명세서를 여는 중…');setError('');setNotice('');
    try {const record=await getStatement(id),output=await createStatementOutput(record.payload);if(mounted.current)setPrepared({id,snapshot:record.payload,record,output});else releaseStatementOutput(output);}
    catch(error){setError(message(error));}finally{operation.current=false;setBusy('');}
  };
  const share=(files:File[])=>{
    // This function is called directly by a tap: no database or rendering await before share().
    setError('');
    if(!navigator.share || !navigator.canShare?.({files})) {setNotice('이 브라우저에서는 파일 공유를 지원하지 않습니다. 아래 파일을 저장한 뒤 메시지에 첨부해 주세요.');return;}
    void navigator.share({files}).then(()=>setNotice('공유창 처리가 끝났습니다. 실제 전송 여부는 메시지 앱에서 확인해 주세요.')).catch(error=>{
      if(error instanceof Error&&error.name==='AbortError')setNotice('공유를 취소했습니다. 발급내역은 보관되어 있습니다.');
      else setError('공유창을 열지 못했습니다. 파일 저장 후 메시지에 첨부해 주세요.');
    });
  };
  const print=()=>{
    try {if(!printReady||!printFrame.current?.contentWindow)throw new Error();printFrame.current.contentWindow.focus();printFrame.current.contentWindow.print();setNotice('인쇄창에서 프린터·용지·매수를 선택하세요. 발급내역은 이미 저장되어 있습니다.');}
    catch{setError('인쇄창을 열지 못했습니다. PDF 방식으로 열어 인쇄해 주세요.');}
  };
  const startFresh=()=>{
    if(changed.current&&!window.confirm('작성 중인 내용을 지우고 새 명세서를 작성할까요?'))return;
    ++contactRequest.current;setDraft(blankStatement());setSourceName('');setCandidates(null);setSelected(new Set());setNotice('');setError('');changed.current=false;
  };

  if(isLoading)return <div className="p-6">불러오는 중…</div>;
  if(!user)return <Navigate to="/" replace/>;
  if(!allowed)return <div className="p-6"><p>거래명세서는 승인된 Lv0·Lv1 직원만 발급·조회할 수 있습니다.</p><Link to="/menu" className="mt-4 inline-block underline">메인메뉴</Link></div>;
  return <div className="h-full overflow-y-auto overscroll-contain bg-autumn-canvas pb-8" style={{WebkitOverflowScrolling:'touch'}}>
    <header className="sticky top-0 z-10 border-b border-autumn-border bg-autumn-canvas/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><h1 className="text-lg font-bold sm:text-2xl">거래명세서 출력</h1><Link className={button} to="/menu" onClick={e=>{if(changed.current&&!window.confirm('작성 중인 내용은 아직 발급되지 않았습니다. 메인메뉴로 이동할까요?'))e.preventDefault();}}>메인메뉴</Link></div>
    </header>
    <main className="mx-auto max-w-5xl space-y-4 p-3 sm:p-5">
      <div className="grid grid-cols-2 gap-2"><button className={tab==='write'?primary:button} disabled={!!busy} onClick={()=>{setTab('write');setError('');}}>새 명세서 작성</button><button className={tab==='history'?primary:button} disabled={!!busy} onClick={()=>{setTab('history');setNotice('');void loadHistory(0);}}>발급내역 검색</button></div>
      {error&&!prepared&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice&&!prepared&&<p role="status" className="rounded-xl bg-autumn-soft p-3 text-sm">{notice}</p>}
      {busy&&!prepared&&<p role="status" className="p-2 text-sm">{busy}</p>}
      {tab==='write'?<>
        <fieldset disabled={!!busy} className="space-y-4 disabled:opacity-70">
          <section className="space-y-3 rounded-2xl border border-autumn-border bg-autumn-surface p-4">
            <div className="flex items-center justify-between"><h2 className="font-bold">주문자 정보</h2><button className="text-sm underline" onClick={startFresh}>새로 작성</button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="주문자 이름"><input className={input} list="statement-customers" value={draft.customerName} maxLength={80} onChange={e=>changeName(e.target.value)} placeholder="이름 선택 또는 직접 입력"/></Field>
              <datalist id="statement-customers">{names.map(name=><option key={name} value={name}/>)}</datalist>
              <Field label="연락처"><input className={input} type="tel" value={draft.contact} maxLength={40} onChange={e=>{++contactRequest.current;patch({contact:e.target.value});}} placeholder="정보가 없으면 빈칸"/></Field>
              <div className="sm:col-span-2"><Field label="주소"><input className={input} value={draft.address} maxLength={120} onChange={e=>patch({address:e.target.value})} placeholder="정보가 없으면 빈칸"/></Field></div>
            </div><p className="text-xs text-autumn-secondary">등록된 주문자 정보가 있으면 자동 입력됩니다. 모든 칸을 직접 수정할 수 있습니다.</p>
          </section>
          <section className="space-y-3 rounded-2xl border border-autumn-border bg-autumn-surface p-4">
            <h2 className="font-bold">현황에서 불러오기 <span className="text-sm font-normal">(선택)</span></h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="현황 주문자"><input className={input} list="statement-customers" value={sourceName} onChange={e=>{setSourceName(e.target.value);setCandidates(null);}} placeholder="현황에 등록된 이름"/></Field>
              <Field label="기간 기준"><select className={input} value={dateType} onChange={e=>{setDateType(e.target.value as typeof dateType);setCandidates(null);}}><option value="shipping_date">출하일</option><option value="sowing_date">파종일</option></select></Field>
              <Field label="기간 시작"><input className={input} type="date" value={draft.dateFrom} onChange={e=>{patch({dateFrom:e.target.value});setCandidates(null);}}/></Field>
              <Field label="기간 종료"><input className={input} type="date" value={draft.dateTo} onChange={e=>{patch({dateTo:e.target.value});setCandidates(null);}}/></Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shippedOnly} onChange={e=>{setShippedOnly(e.target.checked);setCandidates(null);}}/>출하일·출하수량이 입력된 건만</label><button className={button} onClick={()=>void loadOrders()}>현황 조회</button></div>
            {candidates&&<div className="space-y-3 border-t border-autumn-border pt-3">
              <Field label="작물명 선택"><select className={input} value={crop} onChange={e=>{setCrop(e.target.value);setSelected(new Set());}}><option value="">전체 작물</option>{crops.map(c=><option key={c}>{c}</option>)}</select></Field>
              <div className="flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visibleCandidates.length>0&&visibleCandidates.every(o=>selected.has(o.id))} onChange={e=>setSelected(e.target.checked?new Set(visibleCandidates.map(o=>o.id)):new Set())}/>전체 선택 ({visibleCandidates.length}건)</label><button className={button} disabled={!selected.size} onClick={importOrders}>선택 {selected.size}건 추가</button></div>
              <div className="max-h-72 space-y-2 overflow-y-auto overscroll-contain">
                {!visibleCandidates.length&&<p className="p-3 text-sm">조건에 맞는 내역이 없습니다.</p>}
                {visibleCandidates.map(order=><label key={order.id} className="flex items-start gap-3 rounded-lg border border-autumn-border p-3 text-sm"><input type="checkbox" className="mt-1" checked={selected.has(order.id)} onChange={e=>setSelected(prev=>{const next=new Set(prev);if(e.target.checked)next.add(order.id);else next.delete(order.id);return next;})}/><span><strong>{order.crop_name}</strong> · {order.shipping_quantity??order.quantity_base}판 · {order.tray_type}<br/><span className="text-xs text-autumn-secondary">파종 {order.sowing_date} / 출하 {order.shipping_date||'미입력'}</span></span></label>)}
              </div>
              <p className="text-xs text-autumn-secondary">출하수량을 우선 사용하며, 미입력된 건은 기본수량을 넣습니다. 추가 후 수량과 가격을 확인하세요.</p>
            </div>}
          </section>
          <section className="space-y-3 rounded-2xl border border-autumn-border bg-autumn-surface p-4">
            <h2 className="font-bold">거래내역 <span className="text-sm font-normal">{draft.lines.filter(isUsedLine).length}줄</span></h2>
            <p className="text-xs text-autumn-secondary">직접 입력하거나 불러온 내용을 수정하세요. 금액은 수량 × 1판당 단가로 계산하며 직접 입력도 가능합니다.</p>
            {draft.lines.map((line,index)=><div key={line.id} className="space-y-2 rounded-xl border border-autumn-border bg-autumn-canvas p-3">
              <div className="flex justify-between text-sm"><strong>{index+1}번째 항목{line.sourceId?' · 현황에서 불러옴':''}</strong><button className="text-red-800 underline" onClick={()=>patch({lines:draft.lines.length===1?[blankStatementLine()]:draft.lines.filter(r=>r.id!==line.id)})}>삭제</button></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="작물명"><input className={input} maxLength={80} value={line.crop} onChange={e=>editLine(line.id,{crop:e.target.value})}/></Field>
                <Field label="수량(판)"><input className={input} inputMode="decimal" maxLength={40} value={line.quantity} onChange={e=>editLine(line.id,{quantity:e.target.value})}/></Field>
                <Field label="규격"><input className={input} maxLength={40} value={line.tray} onChange={e=>editLine(line.id,{tray:e.target.value})} placeholder="예: 200구"/></Field>
                <Field label="개당단가 (1판·원)"><input className={input} inputMode="numeric" maxLength={40} value={line.unitPrice} onChange={e=>editLine(line.id,{unitPrice:e.target.value})}/></Field>
                <div><Field label={`금액 (원·${line.amountOverride.trim()?'직접입력':'자동'})`}><input className={input} inputMode="numeric" maxLength={15} value={line.amountOverride.trim()?line.amountOverride:(lineAmount(line)===null?'':String(lineAmount(line)))} placeholder="직접 입력 가능" onChange={e=>editLine(line.id,{amountOverride:e.target.value})}/></Field>{line.amountOverride&&<button className="mt-1 text-xs underline" onClick={()=>editLine(line.id,{amountOverride:''})}>자동계산으로 복원</button>}</div>
                <Field label="출하일"><input className={input} type="date" value={line.shippingDate} onChange={e=>editLine(line.id,{shippingDate:e.target.value})}/></Field>
                <div className="col-span-2"><Field label="비고"><textarea className={input} rows={1} maxLength={80} value={line.note} onChange={e=>editLine(line.id,{note:e.target.value})}/></Field></div>
              </div>
            </div>)}
            <button className={`${button} w-full`} onClick={()=>patch({lines:[...draft.lines,blankStatementLine()]})} disabled={draft.lines.length>=120}>＋ 빈 줄 추가 · 직접 입력</button>
          </section>
          <section className="space-y-3 rounded-2xl border border-autumn-border bg-autumn-surface p-4">
            <h2 className="font-bold">금액 및 거래일</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="계약금 (원)"><input className={input} inputMode="numeric" value={draft.deposit} maxLength={15} placeholder="0" onChange={e=>patch({deposit:e.target.value})}/></Field>
              <div className="text-sm">총 금액<p className="mt-3 text-lg font-bold">{money(total)}원</p></div>
              <div className="text-sm">잔액<p className="mt-3 text-lg font-bold">{money(total-(numberValue(draft.deposit)||0))}원</p></div>
              <Field label="거래일"><input className={input} type="date" value={draft.tradeDate} onChange={e=>patch({tradeDate:e.target.value})}/></Field>
              <div className="col-span-2 sm:col-span-4"><Field label="정산 비고"><input className={input} value={draft.note} maxLength={80} onChange={e=>patch({note:e.target.value})} placeholder="예: 계좌이체 예정"/></Field></div>
            </div>
          </section>
          <button className={`${primary} w-full !py-4 !text-base`} onClick={()=>void prepare()}>미리보기 · 발급 방법 선택</button>
        </fieldset>
      </>:<section className="space-y-4 rounded-2xl border border-autumn-border bg-autumn-surface p-4">
        <h2 className="font-bold">보관된 거래명세서</h2>
        <form className="grid grid-cols-2 gap-3 sm:grid-cols-4" onSubmit={e=>{e.preventDefault();void loadHistory(0);}}>
          <div className="col-span-2"><Field label="주문자·작물명·명세서 번호"><input className={input} value={search.query} maxLength={120} onChange={e=>setSearch(prev=>({...prev,query:e.target.value}))} placeholder="검색어 입력 (빈칸이면 전체)"/></Field></div>
          <Field label="거래일 시작"><input className={input} type="date" value={search.from} onChange={e=>setSearch(prev=>({...prev,from:e.target.value}))}/></Field>
          <Field label="거래일 종료"><input className={input} type="date" value={search.to} onChange={e=>setSearch(prev=>({...prev,to:e.target.value}))}/></Field>
          <button className={primary} disabled={!!busy}>검색</button>
        </form>
        <p className="text-sm">총 {count}건 · 발급 당시 내용으로 보관됩니다.</p>
        {history.map(record=><button key={record.id} disabled={!!busy} className="block w-full rounded-xl border border-autumn-border p-4 text-left" onClick={()=>void openSaved(record.id)}><div className="flex flex-wrap justify-between gap-2"><strong>{record.customer_name}</strong><strong>{money(Number(record.total_amount))}원</strong></div><div className="mt-1 text-sm">거래일 {record.trade_date} · 잔액 {money(Number(record.total_amount)-Number(record.deposit_amount))}원</div><div className="mt-1 text-xs text-autumn-secondary">{record.document_number} · 상세보기 / 재출력 / 이미지 공유</div></button>)}
        {!busy&&!history.length&&<p className="py-8 text-center text-autumn-secondary">검색된 발급내역이 없습니다.</p>}
        <div className="flex items-center justify-between"><button className={button} disabled={!!busy||page===0} onClick={()=>void loadHistory(page-1,appliedSearch.current)}>이전</button><span className="text-sm">{page+1} / {Math.max(1,Math.ceil(count/30))}</span><button className={button} disabled={!!busy||(page+1)*30>=count} onClick={()=>void loadHistory(page+1,appliedSearch.current)}>다음</button></div>
      </section>}
    </main>
    {prepared&&createPortal(<div role="dialog" aria-modal="true" aria-label="거래명세서 확인 및 발급" className="fixed inset-0 z-[100] flex flex-col bg-autumn-canvas" style={{paddingTop:'env(safe-area-inset-top, 0px)',paddingBottom:'env(safe-area-inset-bottom, 0px)'}}>
      <div className="flex shrink-0 items-center justify-between border-b border-autumn-border p-3"><strong>{prepared.record?'저장된 거래명세서':'발급 전 확인'}</strong><button className={button} disabled={!!busy} onClick={()=>{setPrepared(null);setNotice('');setError('');}}>닫기</button></div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5" style={{WebkitOverflowScrolling:'touch'}}>
        <div className="mx-auto max-w-3xl space-y-4">
          {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {notice&&<p role="status" className="rounded-xl bg-autumn-soft p-3 text-sm">{notice}</p>}
          {busy&&<p role="status">{busy}</p>}
          <div className="grid grid-cols-2 gap-2"><button className={mode==='print'?primary:button} onClick={()=>setMode('print')}>종이 인쇄 · A4</button><button className={mode==='image'?primary:button} onClick={()=>setMode('image')}>문자용 이미지</button></div>
          <p className="text-sm">{mode==='print'?'고객용 + 보관용을 A4 한 장에 인쇄합니다.':'고객용 부분만 JPG 이미지로 공유합니다.'} {prepared.output.printUrls.length>1?`내용이 많아 ${prepared.output.printUrls.length}장으로 나뉩니다.`:''}</p>
          {!prepared.record?<div className="space-y-2"><button className={`${primary} w-full`} disabled={!!busy} onClick={()=>void issue()}>발급·저장하고 {mode==='print'?'인쇄':'이미지 공유'} 준비</button><p className="text-xs text-autumn-secondary">발급하면 내용이 자동 저장됩니다. 이후 인쇄·공유를 취소해도 발급내역에서 다시 열 수 있습니다.</p></div>:<div className="space-y-3 rounded-xl border border-autumn-border bg-autumn-surface p-4">
            <p className="text-sm font-semibold">저장 완료 · {prepared.record.document_number}</p>
            {mode==='print'?<>
              <Field label="출력 방식"><select className={input} value={printMethod} onChange={e=>setPrintMethod(e.target.value as typeof printMethod)}><option value="native">휴대폰·컴퓨터 인쇄창 (프린터 선택)</option><option value="pdf">PDF 열기·저장·프린터 앱 공유</option></select></Field>
              {printMethod==='native'?<><button className={`${primary} w-full`} disabled={!printReady} onClick={print}>{printReady?'프린터 선택 · 인쇄':'인쇄 문서 준비 중…'}</button><p className="text-xs">A4 세로·100% 크기로 선택하세요. 인쇄창이 뜨지 않으면 PDF 방식을 선택하세요.</p></>:<div className="flex flex-wrap gap-2"><a className={button} href={prepared.output.pdfUrl} target="_blank" rel="noopener noreferrer">PDF 열기</a><button className={button} onClick={()=>downloadStatementFile(prepared.output.pdf,prepared.output.pdfUrl)}>PDF 저장</button><button className={button} onClick={()=>share([prepared.output.pdf])}>PDF 공유 · 프린터 앱</button></div>}
              <details className="text-sm"><summary className="cursor-pointer py-2">캐논 TR160과 아이폰 연결 안내</summary><p className="py-2">프린터에서 LAN 설정 → 무선 직접 연결 → 스마트폰에 연결 → iPhone/iPad를 선택하고, QR 코드를 아이폰 카메라로 읽어 연결하세요. 인쇄창에서 TR160을 선택합니다. 같은 Wi-Fi에 연결해도 사용할 수 있습니다.</p><p className="text-xs">무선 직접 연결로 인터넷이 끊길 수 있으므로 먼저 발급·저장을 마치고 이 화면을 유지한 채 프린터에 연결하세요.</p><a className="underline" href="https://ij.manual.canon/ij/webmanual/Manual/All/TR160%20series/KO/NTR/ntr_n_01_07.html" target="_blank" rel="noopener noreferrer">캐논 연결 안내</a></details>
            </>:<>
              <button className={`${primary} w-full`} onClick={()=>share(prepared.output.customerFiles)}>고객용 이미지 공유 · 메시지 선택</button>
              <p className="text-sm">공유창에서 ‘메시지’를 선택하고 받는 사람을 확인한 뒤 전송하세요.</p>
              {prepared.snapshot.contact&&<p className="text-sm">고객 연락처: <strong>{prepared.snapshot.contact}</strong> <button className="ml-2 underline" onClick={()=>{void navigator.clipboard?.writeText(prepared.snapshot.contact).then(()=>setNotice('연락처를 복사했습니다.')).catch(()=>setNotice('연락처를 길게 눌러 복사해 주세요.'));}}>복사</button></p>}
              <div className="flex flex-wrap gap-2">{prepared.output.customerFiles.map((file,i)=><button className={button} key={file.name} onClick={()=>downloadStatementFile(file,prepared.output.customerUrls[i])}>이미지 {i+1} 저장</button>)}</div>
              <p className="text-xs text-autumn-secondary">파일 공유가 안 되면 이미지를 저장한 뒤 메시지에 첨부하세요. 실제 문자 전송·인쇄 완료 여부는 이 앱에서 확인할 수 없습니다.</p>
            </>}
            <button className="text-sm underline" onClick={()=>{
              if(changed.current&&!window.confirm('작성 중인 내용을 이 명세서 내용으로 바꿀까요?'))return;
              const {version:_v,documentNumber:_n,provider:_p,...copy}=prepared.snapshot;
              ++contactRequest.current;setDraft(structuredClone(copy));setSourceName(getOrdererForCertificate(copy.customerName));setCandidates(null);setPrepared(null);setTab('write');changed.current=true;setNotice('내용을 복사했습니다. 수정 후 새 번호로 발급할 수 있습니다.');
            }}>내용 복사해 새로 작성</button>
          </div>}
          {(mode==='print'?prepared.output.printUrls:prepared.output.customerUrls).map((url,i)=><img key={url} src={url} alt={`${mode==='print'?'A4 고객용·보관용':'고객용'} 거래명세서 ${i+1}페이지`} className="block h-auto w-full border border-autumn-border bg-white shadow-sm"/>)}
        </div>
      </div>
      {prepared.record&&<PrintFrame urls={prepared.output.printUrls} frame={printFrame} onReady={setPrintReady}/>}
    </div>,document.body)}
  </div>;
}
