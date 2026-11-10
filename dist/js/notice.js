/* 首次启动公告：仅供参考学习 / 三玖 */
(function () {
  var KEY = 'jhw_notice_39';
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}

  function show() {
    if (document.querySelector('.notice-mask')) return;
    var m = document.createElement('div');
    m.className = 'notice-mask';
    m.innerHTML =
      '<div class="notice-card">' +
        '<span class="notice-mark" aria-hidden="true">⚡</span>' +
        '<div class="notice-title">电工考证题库</div>' +
        '<div class="notice-sub">低压 / 高压电工作业 · 安全技术培训</div>' +
        '<div class="notice-box">' +
          '<div class="notice-text">仅供参考学习</div>' +
          '<div class="notice-sign">——三玖 · yotoshijo</div>' +
        '</div>' +
        '<button class="notice-btn" type="button">我知道了</button>' +
      '</div>';
    document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add('on'); });

    var btn = m.querySelector('.notice-btn');
    btn.addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      m.classList.remove('on');
      setTimeout(function () {
        if (m.parentNode) m.parentNode.removeChild(m);
      }, 280);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 80); });
  } else {
    setTimeout(show, 80);
  }
})();
