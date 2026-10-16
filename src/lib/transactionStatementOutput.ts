import { lineAmount, money, numberValue, statementTotal, type StatementLine, type StatementSnapshot } from './transactionStatement';

const WIDTHS=[43,19,20,26,30,30,26];
const FONT='StatementNanum';
const SCALE=8; // 203 dpi, exact integer A4 / half-A4 dimensions (1680 x 2376).
export interface StatementOutput { customerFiles: File[]; customerUrls: string[]; printUrls: string[]; pdf: File; pdfUrl: string; }
let assetsPromise: Promise<HTMLImageElement> | null = null;
async function assets(): Promise<HTMLImageElement> {
  if (!assetsPromise) assetsPromise=(async()=>{
    const faces=await Promise.all([
      new FontFace(FONT,'url(/statement-assets/NanumGothic-Regular.woff)',{weight:'400'}).load(),
      new FontFace(FONT,'url(/statement-assets/NanumGothic-Bold.woff)',{weight:'700'}).load(),
    ]);
    faces.forEach(face=>document.fonts.add(face));
    const stamp=new Image();
    stamp.src='/stamp.png';
    await stamp.decode();
    return stamp;
  })().catch(error=>{assetsPromise=null;throw error;});
  return assetsPromise;
}
function font(ctx: CanvasRenderingContext2D, size: number, bold=false) {
  ctx.font=`${bold?'700':'400'} ${size*25.4/72}px ${FONT}, sans-serif`;
}
export function wrapText(text: string, width: number, measure: (text: string)=>number): string[] {
  const output: string[]=[];
  for (const part of text.split('\n')) {
    let current='';
    for (const char of Array.from(part)) {
      if (current && measure(current+char)>width) {output.push(current);current=char;}
      else current+=char;
    }
    output.push(current);
  }
  return output;
}
type LaidOutRow={line: StatementLine; cells: string[][]; height: number};
export function paginateStatementRows(rows: LaidOutRow[]): LaidOutRow[][] {
  const pages: LaidOutRow[][]=[];
  let current: LaidOutRow[]=[],height=0;
  for (const row of rows) {
    if (row.height>37.2+0.001) throw new Error('한 항목의 내용이 너무 길어 반쪽 용지에 들어가지 않습니다. 비고를 나누어 적어 주세요.');
    if (current.length && (current.length===6 || height+row.height>37.2+0.001)) {pages.push(current);current=[];height=0;}
    current.push(row);height+=row.height;
  }
  if (current.length) pages.push(current);
  return pages;
}
function layout(ctx: CanvasRenderingContext2D, snapshot: StatementSnapshot): LaidOutRow[][] {
  font(ctx,8.4);
  return paginateStatementRows(snapshot.lines.map(line=>{
    const values=[line.crop,line.quantity,line.tray,line.unitPrice ? (numberValue(line.unitPrice)!==null?money(Number(line.unitPrice.replaceAll(',',''))):line.unitPrice) : '',money(lineAmount(line) ?? 0),line.shippingDate.replaceAll('-','.'),line.note];
    const cells=values.map((value,i)=>wrapText(value,WIDTHS[i]-4,text=>ctx.measureText(text).width));
    return {line,cells,height:Math.max(6.2,Math.max(...cells.map(cell=>cell.length))*3.5+1.7)};
  }));
}
function drawHalf(ctx: CanvasRenderingContext2D,s: StatementSnapshot,rows: LaidOutRow[],stamp: HTMLImageElement,label: string,page: number,pageCount: number) {
  const text=(value:string,x:number,y:number,size=8.5,bold=false,align:CanvasTextAlign='left')=>{
    ctx.fillStyle='#111';font(ctx,size,bold);ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,x,y);
  };
  const line=(x1:number,y1:number,x2:number,y2:number,weight=.18)=>{
    ctx.strokeStyle='#404040';ctx.lineWidth=weight;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  };
  const box=(x:number,y:number,w:number,h:number,fill=false)=>{
    if(fill){ctx.fillStyle='#f2f2f2';ctx.fillRect(x,y,w,h);}
    ctx.strokeStyle='#404040';ctx.lineWidth=.18;ctx.strokeRect(x,y,w,h);
  };
  const cell=(value:string,x:number,y:number,w:number,h:number,size=8.5,bold=false,align:CanvasTextAlign='center')=>{
    let lines: string[]=[];
    // Shrink only when necessary; never crop customer data silently.
    let actual=size;
    for(;actual>=5.5;actual-=.25){font(ctx,actual,bold);lines=wrapText(value,w-3,t=>ctx.measureText(t).width);if(lines.length*actual*.39<=h-1)break;}
    if(actual<5.5)throw new Error('주문자 정보나 비고가 인쇄 칸보다 깁니다. 내용을 줄이거나 나누어 주세요.');
    const step=actual*.39;
    const start=y+h/2-(lines.length-1)*step/2;
    lines.forEach((part,i)=>text(part,align==='center'?x+w/2:align==='right'?x+w-1.5:x+1.5,start+i*step,actual,bold,align));
  };
  text(s.documentNumber,8,12,6.9);
  text('거 래 명 세 서',105,12,18,true,'center');
  box(180,8,22,7.2);cell(label,180,8,22,7.2,9.4,true);
  if(pageCount>1)text(`${page+1} / ${pageCount} · 전체 합계`,202,18,6.5,false,'right');
  const top=20;
  box(8,top,194,30);
  box(8,top,8,30,true);box(16,top,15,30,true);
  box(86,top,8,30,true);box(94,top,16,30,true);
  cell('주\n문\n자',8,top,8,30,9,true);cell('인\n수\n자',86,top,8,30,9,true);
  for(const x of [31,86,110])line(x,top,x,50);
  for(const offset of [10,20])line(16,top+offset,86,top+offset);
  ['성명','주소','연락처'].forEach((v,i)=>cell(v,16,top+i*10,15,10,8.7,true));
  cell(s.customerName,31,20,55,10,10.5,true,'left');
  cell(s.address,31,30,55,10,8.5,false,'left');
  cell(s.contact,31,40,55,10,9.3,false,'left');
  for(const offset of [6,18,25])line(94,top+offset,202,top+offset);
  cell('등록번호',94,20,16,6,7.5,true);cell(s.provider.registration,110,20,92,6,10.3,true);
  cell('상호\n(법인명)',94,26,16,12,7.8);
  cell(`${s.provider.name}\n(${s.provider.department})`,110,26,54,12,8,true);
  box(164,26,10,12,true);cell('성\n명',164,26,10,12,7.8);
  cell(s.provider.representative,174,26,15,12,9.2,true);
  ctx.save();ctx.globalCompositeOperation='multiply';ctx.drawImage(stamp,188.3,25.2,12.2,12.8);ctx.restore();
  cell('사업장\n주소',94,38,16,7,7.5);cell(s.provider.address,110,38,92,7,8,false,'left');
  cell('업태',94,45,16,5,7.8,true);cell(s.provider.business,110,45,37,5,8);
  box(147,45,13,5,true);cell('종목',147,45,13,5,7.8,true);cell(s.provider.category,160,45,42,5,8);
  text(`거래기간  ${s.dateFrom.replaceAll('-','.')} ~ ${s.dateTo.replaceAll('-','.')}`,8,54.1,8.3,true);
  text('금액 단위: 원 / 개당단가: 1판 기준',202,54.1,7.2,false,'right');
  let x=8;
  const heads=['작물명','수량(판)','규격','개당단가','금액','출하일','비고'];
  heads.forEach((value,i)=>{box(x,57,WIDTHS[i],7,true);cell(value,x,57,WIDTHS[i],7,8.7,true);x+=WIDTHS[i];});
  let y=64;
  for(const row of rows){
    x=8;
    row.cells.forEach((parts,i)=>{
      box(x,y,WIDTHS[i],row.height);
      const align: CanvasTextAlign=i===0?'left':[1,3,4].includes(i)?'right':'center';
      parts.forEach((part,j)=>text(part,align==='left'?x+2:align==='right'?x+WIDTHS[i]-2:x+WIDTHS[i]/2,y+row.height/2-(parts.length-1)*1.75+j*3.5,8.4,i===4,align));
      x+=WIDTHS[i];
    });y+=row.height;
  }
  // Preserve blank writing space down to the same position in both halves.
  while(y<101.19){const h=Math.min(6.2,101.2-y);x=8;WIDTHS.forEach(w=>{box(x,y,w,h);x+=w;});y+=h;}
  const total=statementTotal(s.lines),deposit=numberValue(s.deposit)||0;
  const sumWidths=[44,49,49,52];x=8;
  ['계약금','총 금액','잔액','비고'].forEach((head,i)=>{
    const w=sumWidths[i];box(x,104,w,5,true);cell(head,x,104,w,5,8.6,true);box(x,109,w,8);
    const value=i===0?`${money(deposit)} 원`:i===1?`${money(total)} 원`:i===2?`${money(total-deposit)} 원`:s.note;
    cell(value,x,109,w,8,i<3?11.2:8.5,i<3);x+=w;
  });
  const [year,month,day]=s.tradeDate.split('-');
  text(`거래일  ${year}년.  ${Number(month)}월.  ${Number(day)}일`,105,122.4,10,true,'center');
  line(8,127,202,127);
  text(`${s.provider.bank}  ${s.provider.account}`,8,131,9.1,true);
  text(`예금주  ${s.provider.accountHolder}`,8,135.4,8.5);
  text(`대표 ${s.provider.representative} : ${s.provider.phone}`,202,131,8.7,true,'right');
  text(`팩스 : ${s.provider.fax}`,202,135.4,8.5,false,'right');
}
function canvas(height: number): HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=210*SCALE;canvas.height=height*SCALE;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이미지 생성 기능을 사용할 수 없습니다.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(SCALE,SCALE);
  return canvas;
}
function blob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('이미지를 만들지 못했습니다. 다시 시도해 주세요.')),'image/jpeg',.95));
}
export async function createStatementOutput(snapshot: StatementSnapshot): Promise<StatementOutput> {
  const stamp=await assets();
  const probe=canvas(1);const pages=layout(probe.getContext('2d')!,snapshot);probe.width=1;
  const {jsPDF}=await import('jspdf');
  const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
  const safeName=snapshot.customerName.replace(/[\\/:*?"<>|]/g,'_');
  const base=`거래명세서_${safeName}_${snapshot.tradeDate}_${snapshot.documentNumber.slice(-8)}`;
  const customerFiles: File[]=[],customerUrls: string[]=[],printUrls: string[]=[];
  try {
    for(const [index,rows] of pages.entries()) {
      const half=canvas(148.5),ctx=half.getContext('2d')!;
      drawHalf(ctx,snapshot,rows,stamp,'고객용',index,pages.length);
      const file=new File([await blob(half)],`${base}_고객용_${index+1}.jpg`,{type:'image/jpeg'});
      customerFiles.push(file);customerUrls.push(URL.createObjectURL(file));
      const full=canvas(297),fullCtx=full.getContext('2d')!;
      fullCtx.drawImage(half,0,0,210,148.5);
      fullCtx.save();fullCtx.translate(0,148.5);drawHalf(fullCtx,snapshot,rows,stamp,'보관용',index,pages.length);fullCtx.restore();
      fullCtx.strokeStyle='#999';fullCtx.lineWidth=.15;fullCtx.setLineDash([1,1]);fullCtx.beginPath();fullCtx.moveTo(8,148.5);fullCtx.lineTo(202,148.5);fullCtx.stroke();
      if(index)pdf.addPage();
      pdf.addImage(full.toDataURL('image/jpeg',.95),'JPEG',0,0,210,297);
      printUrls.push(URL.createObjectURL(await blob(full)));
      half.width=1;full.width=1;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const pdfFile=new File([pdf.output('blob')],`${base}.pdf`,{type:'application/pdf'});
    return {customerFiles,customerUrls,printUrls,pdf:pdfFile,pdfUrl:URL.createObjectURL(pdfFile)};
  } catch(error) { [...customerUrls,...printUrls].forEach(url=>URL.revokeObjectURL(url));throw error; }
}
export function releaseStatementOutput(output: StatementOutput) {
  [...output.customerUrls,...output.printUrls,output.pdfUrl].forEach(url=>URL.revokeObjectURL(url));
}
export function downloadStatementFile(file: File,url: string) {
  const a=document.createElement('a');a.href=url;a.download=file.name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
}
