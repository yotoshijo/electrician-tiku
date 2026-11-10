const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('offline install caches all shipped files and fetches never return HTML for a missing image',async()=>{
  const handlers={},stored=[],removed=[];let fetches=0;
  const cache={addAll:async reqs=>stored.push(...reqs.map(r=>r.url)),match:async(req)=>req==='index.html'?{kind:'html'}:undefined};
  const context={URL,Request:class{constructor(url){this.url=url;}},self:{location:{origin:'https://test.example'},addEventListener:(n,fn)=>handlers[n]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>['other-app-cache','electrician-tiku-old'],delete:async k=>removed.push(k)},fetch:async()=>{fetches++;throw Error('offline');}};
  vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),context);
  let pending;handlers.install({waitUntil:p=>pending=p});await pending;
  assert.equal(stored.filter(s=>s.startsWith('data/img/')).length,68);
  assert.ok(stored.includes('js/core.js')&&stored.includes('js/notice.js')&&stored.includes('data/banks.js'));
  handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(removed,['electrician-tiku-old']);
  handlers.fetch({request:{method:'GET',url:'https://test.example/',mode:'navigate'},respondWith:p=>pending=p});
  assert.deepEqual(await pending,{kind:'html'});
  handlers.fetch({request:{method:'GET',url:'https://test.example/missing.png',mode:'cors'},respondWith:p=>pending=p});
  await assert.rejects(pending,/offline/);assert.equal(fetches,1);
  let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://other.example/data',mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});
