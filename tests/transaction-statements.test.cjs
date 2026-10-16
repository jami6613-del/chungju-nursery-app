const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(js,{module,exports:module.exports,require:id=>mocks[id]||require(id),crypto:require('node:crypto').webcrypto,structuredClone,Intl,Date,console},{filename:file});
  return module.exports;
}
const core=load('src/lib/transactionStatement.ts');
const provider={name:'견본 육묘장',account:'sample-account',stamp:'/stamp.png'};
const output=load('src/lib/transactionStatementOutput.ts',{'./transactionStatement':core});
const row=(change={})=>({...core.blankStatementLine(),crop:'케일',quantity:'15',tray:'406구',unitPrice:'9000',...change});
const draft=(change={})=>({...core.blankStatement(),customerName:'견본',lines:[row()],...change});

test('amounts preserve decimal trays, exact won rounding and zero; manual text quantity needs amount',()=>{
  assert.equal(core.lineAmount(row()),135000);
  assert.equal(core.lineAmount(row({quantity:'1.005',unitPrice:'100'})),101);
  assert.equal(core.lineAmount(row({quantity:'0',unitPrice:'9000'})),0);
  assert.equal(core.lineAmount(row({quantity:'2+1',amountOverride:'12000'})),12000);
  assert.equal(core.lineAmount(row({quantity:'2+1'})),null);
  for(const unitPrice of ['','-1','Infinity','1e5','1.2'])assert.equal(core.lineAmount(row({unitPrice})),null);
  assert.equal(core.lineAmount(row({amountOverride:'0'})),0);
  assert.equal(core.lineAmount(row({amountOverride:'1.5'})),null);
});
test('validate missing amounts, invalid date, excess deposit; blank rows never enter snapshots',()=>{
  assert.match(core.validateStatement(draft({lines:[row({unitPrice:''})]})),/단가/);
  assert.match(core.validateStatement(draft({tradeDate:'2026-02-30'})),/거래일/);
  assert.match(core.validateStatement(draft({deposit:'135001'})),/계약금/);
  assert.equal(core.validateStatement(draft({deposit:'135000'})),null);
  const input=draft({lines:[row(),core.blankStatementLine()]});
  const saved=core.makeSnapshot(input,'aabbccdd-0000-0000-0000-000000000000',provider);
  assert.equal(saved.lines.length,1);
  input.lines[0].crop='changed';
  assert.equal(saved.lines[0].crop,'케일');
  assert.equal(saved.provider.account,'sample-account');
  provider.name='changed provider';
  assert.equal(saved.provider.name,'견본 육묘장');
  assert.equal(saved.version,1);
});
test('status import uses shipped quantity including zero, fallback base, exact id de-duplication',()=>{
  const order={id:'order-1',crop_name:'케일',shipping_quantity:0,quantity_base:20,quantity_extra:2,tray_type:'406',shipping_date:'2026-10-16',note:null};
  assert.equal(core.orderToStatementLine(order).quantity,'0');
  assert.equal(core.orderToStatementLine({...order,shipping_quantity:null}).quantity,'20');
  const manual=row({crop:'수기 항목'});
  const imported=core.appendOrders([manual,core.blankStatementLine()],[order,order]);
  assert.equal(imported.length,2);assert.equal(imported[0].crop,'수기 항목');
  assert.equal(core.appendOrders(imported,[order]).length,2);
});
test('pagination keeps all rows, six normal rows per half, wraps long rows without truncation',()=>{
  const normal=Array.from({length:13},(_,i)=>({line:{id:String(i)},cells:[],height:6.2}));
  const pages=output.paginateStatementRows(normal);
  assert.deepEqual(Array.from(pages,p=>p.length),[6,6,1]);
  assert.equal(pages.flat().length,13);
  const tall=output.paginateStatementRows([{height:20},{height:20},{height:6.2}]);
  assert.deepEqual(Array.from(tall,p=>p.length),[1,2]);
  assert.throws(()=>output.paginateStatementRows([{height:40}]),/너무 길/);
  const value='장문 작물명 및 추가 비고';
  assert.equal(output.wrapText(value,5,s=>s.length).join(''),value);
});
test('statement privileges require approval and Lv0/Lv1',()=>{
  for(const role_level of [0,1])assert.equal(core.canUseStatements({role_level,is_approved:true}),true);
  for(const role_level of [2,3])assert.equal(core.canUseStatements({role_level,is_approved:true}),false);
  assert.equal(core.canUseStatements({role_level:0,is_approved:false}),false);
  assert.equal(core.canUseStatements(null),false);
});
test('ambiguous save response recovers same UUID instead of duplicating a statement',async()=>{
  const calls=[];const existing={id:'stable-id',payload:{}};
  const client={from(table){calls.push(table);return {
    insert(value){calls.push(value);return {select(){return {single:async()=>({data:null,error:{message:'timeout'}})}}};},
    select(){return {eq(column,id){calls.push([column,id]);return {maybeSingle:async()=>({data:existing,error:null})};}};},
  };}};
  const api=load('src/lib/transactionStatementApi.ts',{'../supabaseClient':{supabase:client}});
  assert.equal(await api.saveStatement('stable-id',{}),existing);
  assert.equal(calls.filter(x=>typeof x==='object'&&!Array.isArray(x)).length,1);
});
test('history search is server paginated and quotes punctuation as one filter value',async()=>{
  const calls=[];
  const query={then(resolve){return Promise.resolve(resolve({data:[],error:null,count:91}));}};
  for(const name of ['select','order','range','gte','lte','or'])query[name]=(...args)=>{calls.push([name,...args]);return query;};
  const api=load('src/lib/transactionStatementApi.ts',{'../supabaseClient':{supabase:{from:()=>query}}});
  const result=await api.searchStatements({query:'a,b%_"',from:'',to:''},2);
  assert.equal(result.count,91);
  assert.deepEqual(calls.find(c=>c[0]==='range'),['range',60,89]);
  assert.match(calls.find(c=>c[0]==='or')[1],/customer_name\.ilike\."/);
  assert.ok(calls.find(c=>c[0]==='or')[1].includes('a,b'));
});
