const $ = id => document.getElementById(id);
let active = null;
function cell(row, value) { const td = document.createElement('td'); td.textContent = value ?? ''; row.appendChild(td); }
async function startCrawl() {
  const payload={url:$('seed-url').value, max_pages:Number($('max-pages').value), concurrency:Number($('concurrency').value), render:$('render').checked};
  const response=await fetch('/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json(); if(!response.ok){ alert(typeof data.detail==='string'?data.detail:'Check the entered values'); return; }
  active=data.run_id; await refresh();
}
async function stopCrawl(){ await fetch('/stop',{method:'POST'}); await refresh(); }
async function refresh(){
  try {
    const status=await (await fetch('/status')).json();
    if(!active && status.run) active=status.run.id;
    $('start-btn').disabled=status.is_running; $('stop-btn').disabled=!status.is_running;
    $('status-text').textContent=status.run ? `${status.run.state} · run ${status.run.id}` : 'Ready';
    $('status-dot').classList.toggle('running',status.is_running);
    $('logs-container').textContent=status.logs.map(x=>`[${x.time}] ${x.message}`).join('\n');
    if(!active) return;
    const pages=await (await fetch(`/results?run_id=${active}&limit=100`)).json();
    $('result-count').textContent=`${status.counts.visited||0} visited · ${status.counts.queued||0} queued · ${status.counts.error||0} errors`;
    const body=document.querySelector('#results-table tbody'); body.replaceChildren();
    for(const p of pages){
      const row=document.createElement('tr'), td=document.createElement('td'), link=document.createElement('a');
      link.href=p.url; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent=p.title || p.url; td.appendChild(link); row.appendChild(td);
      cell(row,p.status_code || p.state); cell(row,p.findings.map(f=>`${f.severity}: ${f.description}`).join(' | ') || (p.error || 'No checks reported'));
      cell(row,p.truncated?'Truncated':p.depth); body.appendChild(row);
    }
  } catch(e){ $('status-text').textContent='Connection unavailable'; console.error(e); }
}
refresh(); setInterval(refresh,2500);
