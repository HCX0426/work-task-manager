// 分析真实 DG 周报文件结构
const ExcelJS = require('c:/Users/chongxuan-huang/Desktop/工作任务管理/exceljs.min.js');
const path = 'C:/Users/chongxuan-huang/Desktop/DG周报20260817-20260821.xlsx';

(async ()=>{
  const fs = require('fs');
  const wb = new ExcelJS.Workbook();
  const buf = fs.readFileSync(path);
  await wb.xlsx.load(buf);
  console.log('工作表:', wb.worksheets.map(w=>`${w.name}(行${w.rowCount}列${w.columnCount})`).join(', '));
  const ws = wb.getWorksheet(1);

  // 找表头行（首个非空>=3）
  let hr=1, found=false;
  for(;hr<=ws.rowCount;hr++){ let n=0; ws.getRow(hr).eachCell(()=>{n++;}); if(n>=3){found=true;break;} }
  console.log('\n表头行:', hr, 'foundHeader:', found);
  const headers=[];
  const maxCol=Math.max(ws.getRow(hr).cellCount||0, ws.columnCount||0);
  for(let c=1;c<=maxCol;c++){ const v=ws.getRow(hr).getCell(c).value; headers.push(v!=null?String(v).trim():''); }
  console.log('表头:', JSON.stringify(headers));

  // 找状态列
  const stIdx = headers.findIndex(h=>h.includes('完成状态')||h.includes('状态'));
  console.log('状态列索引:', stIdx, '列名:', headers[stIdx]);

  // 打印每个数据行的内容（关键列：项次、客户、专案、状态）
  const nameIdx=headers.findIndex(h=>h.includes('专案')||h.includes('项目'));
  const itemIdx=headers.findIndex(h=>h==='项次'||h.includes('序号')||h.includes('项'));
  console.log('\n=== 数据行详情 ===');
  for(let r=hr+1;r<=ws.rowCount;r++){
    const row=ws.getRow(r);
    let has=false; row.eachCell(()=>{has=true;});
    const get=v=>{const c=row.getCell(v+1); return c.value!=null?String(c.value).trim():'';};
    const st = stIdx>=0?get(stIdx):'?';
    const nm = nameIdx>=0?get(nameIdx):'?';
    const it = itemIdx>=0?get(itemIdx):'?';
    // 判断是否有内容
    let content=false;
    row.eachCell({includeEmpty:false},()=>{content=true;});
    console.log(`行${r}: 项次=${it||'·'} 专案=${(nm||'·').slice(0,12)} 状态=${st||'·'} ${content?'':'[空]'}`);
  }

  // 样式分析：取一行数据的样式（边框/填充/字体/合并）
  console.log('\n=== 样式分析（第'+(hr+1)+'行）===');
  const sample=ws.getRow(hr+1);
  console.log('行高:', sample.height);
  [1,2,3, stIdx+1].forEach(c=>{
    const cell=sample.getCell(c+1);
    console.log(`列${c+1}(${headers[c]||'?'}): 边框=${cell.border?'Y':'N'} 填充=${cell.fill?'Y':'N'} 字体=${cell.font?JSON.stringify(cell.font):'无'} 对齐=${cell.alignment?JSON.stringify(cell.alignment):'无'} 数字格式=${cell.numFmt}`);
  });
  console.log('\n合并单元格数: 通过 model.merges =', ws.model ? (ws.model.merges||[]).length : 'N/A');

  // 分析行1（标题行）
  console.log('\n=== 行1 内容 ===');
  const row1=ws.getRow(1);
  const r1=[];
  for(let c=1;c<=10;c++){ const v=row1.getCell(c).value; if(v!=null)r1.push(`C${c}=${String(v).slice(0,15)}`); }
  console.log(r1.join(' | ')||'(空)');

  // 分析行3 全15列是否有样式（含空单元格）
  console.log('\n=== 行3 全列样式 ===');
  for(let c=1;c<=15;c++){
    const cell=ws.getRow(3).getCell(c);
    console.log(`C${c}(${headers[c-1]||'?'}): 值=${cell.value!=null?String(cell.value).slice(0,8):'·'} 边框=${cell.border?'Y':'N'} 填充=${cell.fill?'Y':'N'} 字体=${cell.font?'Y':'N'}`);
  }

  // 分析底部预留空行（行12）是否有样式
  console.log('\n=== 行12(预留空行) 样式 ===');
  for(let c=1;c<=15;c++){
    const cell=ws.getRow(12).getCell(c);
    const hasStyle = cell.style && Object.keys(cell.style).length>0;
    if(hasStyle || cell.value!=null) console.log(`C${c}: 值=${cell.value!=null?String(cell.value):'·'} 边框=${cell.border?'Y':'N'} 填充=${cell.fill?'Y':'N'} 字体=${cell.font?'Y':'N'}`);
  }
  console.log('行12行高:', ws.getRow(12).height);
  console.log('rowCount(含空行):', ws.rowCount);
})().catch(e=>{ console.error('ERROR:', e.stack||e.message); });
