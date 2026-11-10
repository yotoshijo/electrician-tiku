(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };
  function safeHtml(value) {
    return String(value || '').replace(/<(script|style|iframe)[\s\S]*?<\/\1\s*>/gi, '').split(/(<[^>]*>)/g).map(function (part) {
      if (part[0] !== '<') return esc(part);
      if (/^<\/?(?:sup|sub|b|strong|em|i|p)\s*>$/i.test(part) || /^<br\s*\/?\s*>$/i.test(part)) return part;
      if (/^<img\b/i.test(part)) {
        var src = part.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
        if (src && /^data\/img\/[a-zA-Z0-9_-]+\.(png|jpe?g)$/i.test(src[1])) return '<img src="' + esc(src[1]) + '" alt="题目配图，点击可放大">';
      }
      return '';
    }).join('');
  }
  function optionsOf(q) {
    var keys = (q.tizhong || '').indexOf('判') >= 0 ? ['xxa','xxb'] : ['xxa','xxb','xxc','xxd'];
    var out=[];
    keys.forEach(function(k,i){
      var v=String(q[k] == null ? '' : q[k]).trim();
      if(!v) return;
      out.push({letter:'ABCD'[i],html:/^[a-zA-Z0-9_-]+\.(png|jpe?g)$/i.test(v) ? '<img src="data/img/'+esc(v)+'" alt="选项 '+ 'ABCD'[i] +' 配图，点击可放大">' : safeHtml(v)});
    });
    return out;
  }
  function object(v){return v && typeof v==='object' && !Array.isArray(v);}
  function normalizeState(s,n){
    var valid=function(i){return /^(0|[1-9]\d*)$/.test(String(i)) && Number(i)<n;};
    var clean=function(v,predicate){var r={};if(object(v))Object.keys(v).forEach(function(k){if(valid(k)&&predicate(v[k]))r[k]=v[k];});return r;};
    var answer=function(v){return typeof v==='string' && /^[A-D]$/.test(v);};
    var flag=function(v){return v===1||v===true;};
    var list=function(v){return Array.isArray(v)?Array.from(new Set(v.filter(function(i){return Number.isInteger(i)&&valid(i);}))).slice(0,n):[];};
    s.pos=Number.isInteger(s.pos)?Math.max(0,Math.min(n-1,s.pos)):0;
    s.ans=clean(s.ans,answer);s.wrong=clean(s.wrong,function(v){return Number.isInteger(v)&&v>0;});
    s.fav=list(s.fav);s.reciteKnown=clean(s.reciteKnown,flag);s.reciteUnknown=clean(s.reciteUnknown,flag);
    s.records=Array.isArray(s.records)?s.records.filter(function(r){return object(r)&&Number.isFinite(r.score)&&r.score>=0&&r.score<=100&&Number.isFinite(r.dur)&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&['right','wrong','blank'].every(function(k){return r[k]==null || (Number.isInteger(r[k])&&r[k]>=0);});}).slice(0,30):[];
    var daily={};if(object(s.daily))Object.keys(s.daily).forEach(function(k){if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isInteger(s.daily[k])&&s.daily[k]>=0)daily[k]=s.daily[k];});s.daily=daily;
    if(object(s.last)&&Array.isArray(s.last.list)){
      s.last={list:list(s.last.list),mode:/^(seq|rand|cat|smart|wrong|fav)$/.test(s.last.mode)?s.last.mode:'seq',pos:Number.isInteger(s.last.pos)?s.last.pos:0,retry:clean(s.last.retry,answer)};
      s.last.pos=Math.max(0,Math.min(s.last.list.length-1,s.last.pos));if(!s.last.list.length)s.last=null;
    }else s.last=null;
    return s;
  }
  function validateBackup(text,banks){
    var obj=JSON.parse(text);
    if(!object(obj)||obj.app!=='lvdg-tiku'||![2,3].includes(obj.ver)||!object(obj.data)) throw new Error('不是支持的电工题库备份文件');
    if(!Object.keys(obj.data).length) throw new Error('备份文件没有学习记录');
    var data={};
    var prefs={jhw_bank:function(v){return banks.some(function(b){return b.id===v;});},jhw_theme:function(v){return /^(light|dark)$/.test(v);},jhw_vibrate:function(v){return /^(true|false)$/.test(v);},jhw_goal:function(v){return /^\d+$/.test(v)&&Number(v)>0&&Number(v)<=10000;},jhw_notice_39:function(v){return v==='1';},jhw_remind:function(v){try{var r=JSON.parse(v);return object(r)&&typeof r.on==='boolean'&&Number.isInteger(r.h)&&r.h>=0&&r.h<24&&Number.isInteger(r.m)&&r.m>=0&&r.m<60;}catch(e){return false;}}};
    Object.keys(obj.data).forEach(function(k){
      if(typeof obj.data[k]!=='string') throw new Error('备份中的记录格式不正确');
      if(Object.prototype.hasOwnProperty.call(prefs,k)){if(!prefs[k](obj.data[k]))throw new Error('备份设置无效');data[k]=obj.data[k];}
    });
    banks.forEach(function(b){
      if(obj.ver===3&&(!object(obj.bankQuestionIds)||!Array.isArray(obj.bankQuestionIds[b.id])||JSON.stringify(obj.bankQuestionIds[b.id])!==JSON.stringify(b.q.map(function(q){return q.sourceId;}))))throw new Error('备份题库版本不同，不能直接覆盖题号，请保留文件并联系维护者迁移。');
      var pre='jhw_'+b.id+'_',s={}, keys=['pos','ans','wrong','fav','records','known','unknown','daily','last'];
      keys.forEach(function(k){if(obj.data[pre+k]!=null){try{s[k==='known'?'reciteKnown':k==='unknown'?'reciteUnknown':k]=JSON.parse(obj.data[pre+k]);}catch(e){throw new Error('备份记录无法解析');}}});
      normalizeState(s,b.q.length);
      keys.forEach(function(k){if(obj.data[pre+k]!=null)data[pre+k]=JSON.stringify(s[k==='known'?'reciteKnown':k==='unknown'?'reciteUnknown':k]);});
    });
    if(!Object.keys(data).length) throw new Error('备份没有可恢复的记录');
    return {data:data};
  }
  root.TikuCore={safeHtml:safeHtml,optionsOf:optionsOf,normalizeState:normalizeState,validateBackup:validateBackup};
  var memory={},backend=null;
  try{backend=root.localStorage;void backend.length;}catch(e){}
  root.TikuStorage={
    getItem:function(k){try{return backend?backend.getItem(k):(memory[k]??null);}catch(e){return null;}},
    setItem:function(k,v){if(backend)backend.setItem(k,String(v));else memory[k]=String(v);},
    removeItem:function(k){if(backend)backend.removeItem(k);else delete memory[k];},
    key:function(i){return backend?backend.key(i):Object.keys(memory)[i];},
    get length(){return backend?backend.length:Object.keys(memory).length;},
    persistent:!!backend
  };
})(typeof window!=='undefined'?window:globalThis);
