const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context={};vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/js/core.js','utf8'),context);
vm.runInContext(fs.readFileSync('dist/data/banks.js','utf8').replace('window.BANKS','BANKS'),context);
const {TikuCore:core,BANKS:banks}=context;
const plain=v=>JSON.parse(JSON.stringify(v));
test('all 2739 source questions are retained with unique stable identifiers',()=>{
  assert.deepEqual(plain(banks.map(b=>[b.id,b.q.length])),[['lv',1303],['gy',1436]]);
  for(const b of banks){
    assert.equal(new Set(b.q.map(q=>q.sourceId)).size,b.q.length);
    assert.deepEqual(plain(b.q.map(q=>q.idx)),Array.from({length:b.q.length},(_,i)=>i+1));
    for(const q of b.q){
      assert.ok(q.tm.trim());assert.ok(q.cat);assert.ok(q.sourceId);
      const options=core.optionsOf(q), answer=({对:'A',错:'B'})[q.daan]||q.daan;
      assert.ok(options.some(o=>o.letter===answer),`${b.id}:${q.idx}: answer without option`);
      if(q.tizhong==='判断')assert.equal(options.length,2,`${b.id}:${q.idx}`);
      else assert.ok(options.length>=2&&options.length<=4,`${b.id}:${q.idx}`);
    }
  }
});
test('zero is retained as a real option, including the missing low-voltage question 69',()=>{
  const q=banks[0].q[68];assert.match(q.tm,/穿管导线/);assert.equal(q.daan,'C');
  assert.equal(core.optionsOf(q)[2].html,'0');
  assert.equal(core.optionsOf(banks[1].q[1246])[2].html,'0');
});
test('every image reference resolves and encoded / broken image tags are removed',()=>{
  let refs=0;
  for(const b of banks)for(const q of b.q)for(const k of ['tm','xxa','xxb','xxc','xxd','daanjiexi']){
    assert.doesNotMatch(q[k],/&(?:lt|gt|amp|quot);|<img>/);
    for(const m of q[k].matchAll(/(?:data\/img\/)?([a-z0-9]+\.(?:png|jpg))/g)){
      assert.ok(fs.existsSync(path.join('dist/data/img',m[1])),`${b.id}:${q.idx}:${m[1]}`);refs++;
    }
  }
  assert.ok(refs>=65);
  assert.equal(banks[1].q[881].tm,banks[1].q[1352].tm);
  assert.equal(banks[1].q[882].tm,banks[1].q[1353].tm);
  const issues=banks.flatMap(b=>b.q.filter(q=>q.issue).map(q=>[b.id,q.idx]));
  assert.deepEqual(plain(issues),[['gy',1409]]);
});
test('safe renderer keeps superscripts and local images while rejecting executable HTML',()=>{
  assert.equal(core.safeHtml('25mm<sup>2</sup>'),'25mm<sup>2</sup>');
  assert.doesNotMatch(core.safeHtml('<img src="https://evil.test/a.png" onerror="alert(1)"><script>alert(1)</script>'),/script|onerror|evil|alert/);
  assert.match(core.safeHtml('<img src="data/img/lv650fd43008.png" onerror="x()">'),/src="data\/img\/lv650fd43008.png"/);
  assert.doesNotMatch(core.safeHtml('<img src="data/img/lv650fd43008.png" onerror="x()">'),/onerror/);
});
test('state recovery removes corrupt indices without dropping full-bank resume history',()=>{
  const s=core.normalizeState({pos:-10,ans:{0:'A',1302:'B',1303:'A',bad:'A'},wrong:{0:2,1303:1},fav:[0,0,-1,1303],records:[null,{score:90,dur:60,date:'2026-11-10'}],last:{mode:'rand',pos:1200,list:Array.from({length:1303},(_,i)=>i),retry:{0:'A'}}},1303);
  assert.deepEqual(plain(s.ans),{0:'A',1302:'B'});assert.deepEqual(plain(s.fav),[0]);
  assert.equal(s.last.list.length,1303);assert.equal(s.last.pos,1200);assert.equal(s.records.length,1);
});
test('backup validation accepts the app format, rejects malformed input, and allowlists keys',()=>{
  const ids=Object.fromEntries(banks.map(b=>[b.id,b.q.map(q=>q.sourceId)]));
  const obj={app:'lvdg-tiku',ver:3,bankQuestionIds:ids,data:{jhw_lv_ans:'{"0":"A"}',jhw_theme:'dark',jhw_malicious:'payload'}};
  const result=core.validateBackup(JSON.stringify(obj),banks);
  assert.equal(result.data.jhw_lv_ans,'{"0":"A"}');assert.equal(result.data.jhw_malicious,undefined);
  assert.throws(()=>core.validateBackup('{',banks));
  assert.throws(()=>core.validateBackup('{"app":"other","ver":3,"data":{}}',banks));
  obj.bankQuestionIds.lv=[];assert.throws(()=>core.validateBackup(JSON.stringify(obj),banks),/版本不同/);
});
test('legacy Android version 2 backup can restore original-source indices',()=>{
  const r=core.validateBackup(JSON.stringify({app:'lvdg-tiku',ver:2,data:{jhw_gy_fav:'[881,882]'}}),banks);
  assert.equal(r.data.jhw_gy_fav,'[881,882]');
});
