(function(){
  var banner=document.createElement('div');banner.className='offline-status';banner.setAttribute('role','status');
  document.getElementById('topbar').after(banner);
  function status(text){banner.textContent=text+(window.TikuStorage&&!window.TikuStorage.persistent?' · 当前浏览器不允许保存记录，请使用正常浏览模式。':'');}
  if(!('serviceWorker' in navigator)||!window.isSecureContext){status('在线练习可用；此环境不支持离线缓存。');return;}
  status('正在准备离线题库与全部配图…');
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(function(reg){
    navigator.serviceWorker.ready.then(function(){status('离线题库已就绪 · 低压 / 高压全部配图已缓存');});
    reg.addEventListener('updatefound',function(){
      var worker=reg.installing;
      worker.addEventListener('statechange',function(){
        if(worker.state==='installed'&&navigator.serviceWorker.controller){status('发现新版题库，完成本题后刷新页面即可更新。');}
        if(worker.state==='redundant'){status('离线资源准备失败，请保持联网后刷新重试。');}
      });
    });
  }).catch(function(){status('离线缓存暂不可用；可继续联网练习，联网后刷新重试。');});
  document.addEventListener('error',function(e){
    if(e.target&&e.target.tagName==='IMG'&&!e.target.dataset.failed){
      e.target.dataset.failed='1';
      var note=document.createElement('span');note.className='data-issue';note.textContent='图片加载失败，请联网刷新后重试。';e.target.after(note);
    }
  },true);
})();
