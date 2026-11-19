import{i as e,n as t}from"./rolldown-runtime-Dd_uD5pT.js";import{t as n}from"./storage-company-DsSC5GwG.js";import{C as r,S as i}from"./index-BmOuKNNy.js";import{t as a}from"./vendor-excel-D11IVER6.js";import"./format-DckLq8E2.js";var o=e(a(),1),s=class{platform=`web`;isDesktop=!1;canSilentPrint=!1;async saveFile(e,t,n){try{let r;if(e instanceof Blob)r=e;else if(typeof e==`string`)r=new Blob([e],{type:n?.mimeType||`text/plain;charset=utf-8`});else{let t=new Uint8Array(e.byteLength);t.set(e),r=new Blob([t.buffer],{type:n?.mimeType||`application/octet-stream`})}if(`showSaveFilePicker`in window&&window.isSecureContext)try{let e={suggestedName:t,types:n?.filters?.map(e=>({description:e.name,accept:{[n.mimeType||`application/octet-stream`]:e.extensions.map(e=>`.${e}`)}}))},i=await(await window.showSaveFilePicker(e)).createWritable();return await i.write(r),await i.close(),!0}catch(e){if(e.name===`AbortError`)return!1}let i=URL.createObjectURL(r),a=document.createElement(`a`);return a.href=i,a.download=t,document.body.appendChild(a),a.click(),setTimeout(()=>{document.body.removeChild(a),URL.revokeObjectURL(i)},500),!0}catch(e){return console.error(`[WebPlatformAdapter] saveFile failed`,e),!1}}async openFile(e){return new Promise(t=>{let n=document.createElement(`input`);n.type=`file`,n.accept=e?.accept||e?.filters?.flatMap(e=>e.extensions.map(e=>`.${e}`)).join(`,`)||`*/*`,n.onchange=async()=>{let e=n.files?.[0];if(!e){t(null);return}try{let n=await e.arrayBuffer(),r=await e.text();t({file:e,name:e.name,size:e.size,buffer:n,text:r})}catch{t(null)}},n.oncancel=()=>t(null),n.click()})}async printDocument(e){let t=e.contentHtml||``;if(!t&&e.elementId){let n=document.getElementById(e.elementId);n&&(t=n.outerHTML)}if(t){let n=document.createElement(`iframe`);n.style.position=`fixed`,n.style.right=`0`,n.style.bottom=`0`,n.style.width=`0`,n.style.height=`0`,n.style.border=`0`,n.style.visibility=`hidden`,document.body.appendChild(n);let r=n.contentWindow?.document;if(!r){window.print();return}let i=Array.from(document.querySelectorAll(`link[rel="stylesheet"], style`)).map(e=>e.outerHTML).join(`
`),a=e.orientation||`portrait`,o=e.pageSize||`A4`,s=o.startsWith(`80mm`)||o.startsWith(`58mm`)?`${o} auto`:`${o} ${a}`;r.open(),r.write(`
        <!doctype html>
        <html lang="ar" dir="rtl">
          <head>
            <meta charset="UTF-8" />
            <title>${e.title||document.title}</title>
            ${i}
            <style>
              @page {
                size: ${s};
                margin: ${o.includes(`mm`)?`3mm`:`8mm`};
              }
              body {
                margin: 0;
                padding: 0;
                background: #ffffff !important;
                color: #0f172a !important;
                font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif !important;
                direction: rtl !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            </style>
          </head>
          <body>
            ${t}
          </body>
        </html>
      `),r.close(),setTimeout(()=>{n.contentWindow?.focus(),n.contentWindow?.print(),setTimeout(()=>{document.body.removeChild(n)},1e3)},350);return}window.print()}async copyToClipboard(e){try{if(navigator.clipboard?.writeText)return await navigator.clipboard.writeText(e),!0;let t=document.createElement(`textarea`);return t.value=e,t.style.position=`fixed`,t.style.opacity=`0`,document.body.appendChild(t),t.select(),document.execCommand(`copy`),document.body.removeChild(t),!0}catch{return!1}}openExternalUrl(e){window.open(e,`_blank`,`noopener,noreferrer`)}},c=class{platform;isDesktop=!0;canSilentPrint=!0;constructor(e){this.platform=e}async saveFile(e,t,n){if(this.platform===`tauri`&&window.__TAURI__!==void 0)try{let{invoke:r}=window.__TAURI__.core||window.__TAURI__,i;return i=e instanceof Blob?Array.from(new Uint8Array(await e.arrayBuffer())):typeof e==`string`?Array.from(new TextEncoder().encode(e)):Array.from(e),await r(`save_file_native`,{filename:t,bytes:i,defaultPath:n?.defaultPath}),!0}catch(e){console.warn(`[DesktopPlatformAdapter] Tauri native save failed, falling back to Web adapter`,e)}if(this.platform===`electron`&&window.electron!==void 0)try{let r;return r=e instanceof Blob?new Uint8Array(await e.arrayBuffer()):typeof e==`string`?new TextEncoder().encode(e):e,await window.electron.saveFile({filename:t,data:r,options:n})}catch(e){console.warn(`[DesktopPlatformAdapter] Electron save failed, falling back`,e)}return new s().saveFile(e,t,n)}async openFile(e){return new s().openFile(e)}async printDocument(e){if(this.platform===`tauri`&&window.__TAURI__!==void 0)try{let{invoke:t}=window.__TAURI__.core||window.__TAURI__;await t(`print_document_native`,e);return}catch{}if(this.platform===`electron`&&window.electron!==void 0)try{await window.electron.print(e);return}catch{}return new s().printDocument(e)}async copyToClipboard(e){return new s().copyToClipboard(e)}openExternalUrl(e){if(this.platform===`tauri`&&window.__TAURI__?.shell?.open){window.__TAURI__.shell.open(e);return}if(this.platform===`electron`&&window.electron?.openExternal){window.electron.openExternal(e);return}window.open(e,`_blank`,`noopener,noreferrer`)}},l=null;function u(){if(l)return l;if(typeof window<`u`){if(window.__TAURI__)return l=new c(`tauri`),l;if(window.electron||window.process?.type===`renderer`)return l=new c(`electron`),l}return l=new s,l}function d(e){if(typeof e!=`string`)return e;let t=e.trim();return t.startsWith(`=`)||t.startsWith(`+`)||t.startsWith(`-`)||t.startsWith(`@`)||t.startsWith(`	`)||t.startsWith(`\r`)?`'${e}`:e}var f=t({ExportEngine:()=>p}),p=class{static async exportExcel(e){let t=i({type:`EXPORT_EXCEL`,title:`تصدير إكسل: ${e.title}`,meta:{rowCount:e.data.length}});try{r(t.id,{status:`running`,progress:10});let i=n(),a=new o.default.Workbook;if(a.creator=i.nameAr||`IDHAM ERP`,a.lastModifiedBy=`IDHAM ERP`,a.created=new Date,a.modified=new Date,await this.buildSheet(a,e,i),r(t.id,{progress:60}),e.additionalSheets&&e.additionalSheets.length>0)for(let t of e.additionalSheets)await this.buildSheet(a,{...e,title:t.title,sheetName:t.sheetName,columns:t.columns,data:t.data},i);r(t.id,{progress:85});let s=await a.xlsx.writeBuffer(),c=new Blob([s],{type:`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`}),l=new Date().toISOString().slice(0,10),d=(e.filename||`${e.title}-${l}`).replace(/\.xlsx$/i,``)+`.xlsx`,f=await u().saveFile(c,d,{mimeType:`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,filters:[{name:`Excel Workbook`,extensions:[`xlsx`]}]});return r(t.id,{status:f?`completed`:`failed`,progress:100,filename:d,fileBlob:c}),f}catch(e){return console.error(`[ExportEngine] exportExcel error`,e),r(t.id,{status:`failed`,error:e.message||`فشل توليد ملف الإكسل`}),!1}}static async buildSheet(e,t,n){let r=(t.sheetName||t.title).slice(0,31).replace(/[\\/?*[\]]/g,`-`),i=e.addWorksheet(r,{views:[{state:`normal`,rightToLeft:!0}],properties:{defaultRowHeight:22}}),a=1;if(t.includeHeaderBanner!==!1){let e=i.getRow(a++);e.values=[n.nameAr||`شركة نظم إمداد للتقنية والحلول الرقمية (AZM)`],e.font={name:`IBM Plex Sans Arabic`,size:14,bold:!0,color:{argb:`FF0F172A`}},e.alignment={horizontal:`right`,vertical:`middle`};let r=i.getRow(a++);r.values=[[t.title,t.periodLabel?`الفترة: ${t.periodLabel}`:null,t.branchName?`الفرع: ${t.branchName}`:null,`العملة: ${t.currency||n.baseCurrency||`SAR`}`].filter(Boolean).join(` • `)],r.font={name:`IBM Plex Sans Arabic`,size:11,bold:!0,color:{argb:`FF0284C7`}},r.alignment={horizontal:`right`,vertical:`middle`};let o=i.getRow(a++);o.values=[`تاريخ التصدير: ${new Date().toLocaleString(`ar-SA`)} | الرقم الضريبي: ${n.taxNumber||`310123456700003`}`],o.font={name:`IBM Plex Sans Arabic`,size:9,italic:!0,color:{argb:`FF64748B`}},o.alignment={horizontal:`right`,vertical:`middle`},a++}let o=a,s=i.getRow(a++);s.values=t.columns.map(e=>e.header),s.height=28,s.eachCell(e=>{e.font={name:`IBM Plex Sans Arabic`,size:10,bold:!0,color:{argb:`FFFFFFFF`}},e.fill={type:`pattern`,pattern:`solid`,fgColor:{argb:`FF0F172A`}},e.alignment={horizontal:`center`,vertical:`middle`,wrapText:!0},e.border={top:{style:`thin`,color:{argb:`FF334155`}},bottom:{style:`medium`,color:{argb:`FF0F172A`}},left:{style:`thin`,color:{argb:`FF334155`}},right:{style:`thin`,color:{argb:`FF334155`}}}});let c=a;for(let e=0;e<t.data.length;e++){let n=t.data[e],r=i.getRow(a++);r.height=20;let o=e%2==1,s=[];t.columns.forEach(e=>{let t=n[e.key];if(t===!0?t=`نعم`:t===!1?t=`لا`:t??=``,e.type===`number`||e.type===`currency`||e.type===`percent`){let e=typeof t==`number`?t:Number(t);s.push(isNaN(e)?0:e)}else s.push(d(String(t)))}),r.values=s,r.eachCell((e,n)=>{let r=t.columns[n-1];e.font={name:`IBM Plex Sans Arabic`,size:9.5},o&&(e.fill={type:`pattern`,pattern:`solid`,fgColor:{argb:`FFF8FAFC`}}),e.border={bottom:{style:`thin`,color:{argb:`FFE2E8F0`}},left:{style:`thin`,color:{argb:`FFE2E8F0`}},right:{style:`thin`,color:{argb:`FFE2E8F0`}}},r&&(r.type===`currency`||r.type===`number`?(e.numFmt=r.format||`#,##0.00`,e.alignment={horizontal:`left`,vertical:`middle`}):r.type===`percent`?(e.numFmt=r.format||`0.00%`,e.alignment={horizontal:`left`,vertical:`middle`}):e.alignment=r.type===`date`?{horizontal:`center`,vertical:`middle`}:{horizontal:`right`,vertical:`middle`})})}let l=a-1;if(t.columns.some(e=>e.isTotal||e.type===`currency`)&&l>=c){let e=i.getRow(a++);e.height=24;let n=[];t.columns.forEach((e,t)=>{if(t===0)n.push(`الإجمالي الكلي:`);else if(e.isTotal||e.type===`currency`){let e=this.getColumnLetter(t+1);n.push({formula:`SUM(${e}${c}:${e}${l})`})}else n.push(``)}),e.values=n,e.eachCell((e,n)=>{let r=t.columns[n-1];e.font={name:`IBM Plex Sans Arabic`,size:10,bold:!0,color:{argb:`FF0F172A`}},e.fill={type:`pattern`,pattern:`solid`,fgColor:{argb:`FFE2E8F0`}},e.border={top:{style:`thin`,color:{argb:`FF0F172A`}},bottom:{style:`double`,color:{argb:`FF0F172A`}}},r&&(r.isTotal||r.type===`currency`)?(e.numFmt=r.format||`#,##0.00`,e.alignment={horizontal:`left`,vertical:`middle`}):e.alignment={horizontal:`right`,vertical:`middle`}})}if(t.columns.forEach((e,t)=>{let n=i.getColumn(t+1);if(e.width)n.width=e.width;else{let t=(e.header||``).length;n.width=Math.max(t*1.5,14)}}),i.views=[{state:`frozen`,ySplit:o,rightToLeft:!0}],l>=c){let e=this.getColumnLetter(t.columns.length);i.autoFilter={from:`A${o}`,to:`${e}${l}`}}return i}static async exportPdf(e){let t=i({type:`EXPORT_PDF`,title:`تصدير PDF: ${e.title}`,meta:{rowCount:e.data.length}});try{r(t.id,{status:`running`,progress:30});let i=n(),a=new Date().toLocaleString(`ar-SA`),o=e.currency||i.baseCurrency||`SAR`,s={};e.columns.forEach(t=>{if(t.isTotal||t.type===`currency`||t.type===`number`){let n=0;e.data.forEach(e=>{let r=e[t.key],i=typeof r==`number`?r:Number(r);isNaN(i)||(n+=i)}),s[t.key]=n}});let c=e.columns.map(e=>`<th style="background:#0f172a;color:#ffffff;padding:8px 10px;text-align:${e.type===`currency`||e.type===`number`||e.type===`percent`?`left`:`right`};font-size:11px;font-weight:700;border:1px solid #1e293b;white-space:nowrap;">${e.header}</th>`).join(``),l=e.data.map((t,n)=>`<tr style="background:${n%2==1?`#f8fafc`:`#ffffff`};page-break-inside:avoid;">${e.columns.map(e=>{let n=t[e.key];n===!0?n=`نعم`:n===!1?n=`لا`:n??=`—`;let r=String(n),i=`right`;if(e.type===`currency`||e.type===`number`){i=`left`;let e=typeof n==`number`?n:Number(n);isNaN(e)||(r=e.toLocaleString(`en-US`,{minimumFractionDigits:2,maximumFractionDigits:2}))}else if(e.type===`percent`){i=`left`;let e=typeof n==`number`?n:Number(n);isNaN(e)||(r=`${e.toFixed(2)}%`)}else e.type===`date`&&(i=`center`);return`<td style="padding:6px 10px;font-size:10.5px;color:#1e293b;border-bottom:1px solid #e2e8f0;border-inline:1px solid #f1f5f9;text-align:${i};">${r}</td>`}).join(``)}</tr>`).join(``),d=Object.keys(s).length>0,f=``;d&&(f=`<tfoot><tr style="page-break-inside:avoid;">${e.columns.map((e,t)=>t===0?`<td style="padding:8px 10px;font-size:11px;font-weight:bold;color:#0f172a;background:#f1f5f9;border-top:2px solid #0f172a;border-bottom:3px double #0f172a;text-align:right;">الإجمالي الكلي:</td>`:s[e.key]===void 0?`<td style="padding:8px 10px;background:#f1f5f9;border-top:2px solid #0f172a;border-bottom:3px double #0f172a;"></td>`:`<td style="padding:8px 10px;font-size:11px;font-weight:bold;color:#0f172a;background:#f1f5f9;border-top:2px solid #0f172a;border-bottom:3px double #0f172a;text-align:left;font-family:monospace;">${s[e.key].toLocaleString(`en-US`,{minimumFractionDigits:2,maximumFractionDigits:2})} ${e.type===`currency`?o:``}</td>`).join(``)}</tr></tfoot>`);let p=`
        <div style="direction:rtl;font-family:'IBM Plex Sans Arabic',system-ui,Arial,sans-serif;padding:12px;color:#0f172a;background:#ffffff;">
          <!-- Top Executive Header -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;">
            <div style="max-width:380px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <div style="width:28px;height:28px;border-radius:6px;background:#0f172a;color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;">ع</div>
                <div>
                  <div style="font-size:15px;font-weight:800;color:#0f172a;line-height:1.2;">${i.nameAr||`شركة نظم إمداد للتقنية والحلول الرقمية`}</div>
                  <div style="font-size:10px;color:#64748b;font-weight:600;">${i.nameEn||`AZM TECH & DIGITAL SOLUTIONS`}</div>
                </div>
              </div>
              <div style="font-size:10px;color:#475569;margin-top:4px;line-height:1.4;">
                الرقم الضريبي (VAT): <span style="font-family:monospace;font-weight:bold;">${i.taxNumber||`310123456700003`}</span>
                ${i.commercialReg?` | س.ت: <span style="font-family:monospace;">${i.commercialReg}</span>`:``}
              </div>
            </div>

            <div style="text-align:center;align-self:center;">
              <div style="background:#0f172a;color:#ffffff;padding:5px 16px;border-radius:8px;font-size:13px;font-weight:800;display:inline-block;letter-spacing:0.5px;">
                ${e.title}
              </div>
              <div style="font-size:10.5px;color:#475569;margin-top:4px;font-weight:600;">
                ${e.periodLabel?`الفترة: ${e.periodLabel} • `:``}الفرع: ${e.branchName||`المقر الرئيسي`}
              </div>
            </div>

            <div style="text-align:left;font-size:10px;color:#64748b;line-height:1.5;">
              <div>التاريخ: <span style="font-weight:bold;color:#0f172a;">${a}</span></div>
              <div>إجمالي السجلات: <span style="font-weight:bold;color:#0f172a;">${e.data.length}</span></div>
              <div>العملة: <span style="font-weight:bold;color:#0f172a;">${o}</span></div>
            </div>
          </div>

          <!-- Data Table -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead>
              <tr style="page-break-inside:avoid;">${c}</tr>
            </thead>
            <tbody>
              ${l}
            </tbody>
            ${f}
          </table>

          <!-- Official Signatures & Stamp Footer -->
          <div style="margin-top:24px;padding-top:12px;border-top:1px solid #cbd5e1;page-break-inside:avoid;">
            <div style="display:flex;justify-content:space-between;text-align:center;font-size:11px;margin-bottom:20px;">
              <div style="width:28%;">
                <div style="font-weight:bold;color:#1e293b;">إعداد المحاسب المسؤول</div>
                <div style="margin-top:25px;border-bottom:1px dashed #94a3b8;width:80%;margin-inline:auto;"></div>
              </div>
              <div style="width:28%;">
                <div style="font-weight:bold;color:#1e293b;">المراجعة والتدقيق المالي</div>
                <div style="margin-top:25px;border-bottom:1px dashed #94a3b8;width:80%;margin-inline:auto;"></div>
              </div>
              <div style="width:28%;">
                <div style="font-weight:bold;color:#1e293b;">اعتماد الإدارة والختم الرسمي</div>
                <div style="margin-top:25px;border-bottom:1px dashed #94a3b8;width:80%;margin-inline:auto;"></div>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:6px;">
              <span>منظومة إدهام لإدارة الموارد والمحاسبة (IDHAM ERP) • مستند رقمي رسمي معتمد</span>
              <span>صفحة 1 من 1</span>
            </div>
          </div>
        </div>
      `;return r(t.id,{progress:85}),await u().printDocument({contentHtml:p,title:`${e.title} - IDHAM ERP`,pageSize:`A4`,orientation:e.columns.length>6?`landscape`:`portrait`}),r(t.id,{status:`completed`,progress:100}),!0}catch(e){return console.error(`[ExportEngine] exportPdf error`,e),r(t.id,{status:`failed`,error:e.message||`فشل تصدير مستند PDF`}),!1}}static async exportCsv(e){let t=i({type:`EXPORT_CSV`,title:`تصدير CSV: ${e.title}`,meta:{rowCount:e.data.length}});try{r(t.id,{status:`running`,progress:20});let n=[e.columns.map(e=>`"${e.header.replace(/"/g,`""`)}"`).join(`,`)];for(let t=0;t<e.data.length;t++){let r=e.data[t],i=e.columns.map(e=>{let t=r[e.key];return t===!0?t=`نعم`:t===!1?t=`لا`:t??=``,`"${d(String(t)).replace(/"/g,`""`)}"`});n.push(i.join(`,`))}r(t.id,{progress:80});let i=`﻿`+n.join(`\r
`),a=new Blob([i],{type:`text/csv;charset=utf-8`}),o=new Date().toISOString().slice(0,10),s=(e.filename||`${e.title}-${o}`).replace(/\.csv$/i,``)+`.csv`,c=await u().saveFile(a,s,{mimeType:`text/csv;charset=utf-8`,filters:[{name:`CSV File`,extensions:[`csv`]}]});return r(t.id,{status:c?`completed`:`failed`,progress:100,filename:s,fileBlob:a}),c}catch(e){return console.error(`[ExportEngine] exportCsv error`,e),r(t.id,{status:`failed`,error:e.message||`فشل تصدير ملف CSV`}),!1}}static getColumnLetter(e){let t,n=``;for(;e>0;)t=(e-1)%26,n=String.fromCharCode(t+65)+n,e=(e-t-1)/26;return n}};export{f as n,u as r,p as t};