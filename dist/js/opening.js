(function () {
  'use strict';
  var opening = document.getElementById('opening');
  var enter = document.getElementById('opening-enter');
  if (!opening || !enter) return;
  var closed = false;
  var app = document.querySelector('.app');
  if (app) app.inert = true;
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    opening.classList.add('is-closing');
    setTimeout(function () {
      opening.remove();
      if (app) app.inert = false;
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600);
  }
  enter.addEventListener('click', close);
  opening.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' || event.key === 'Enter') close();
  });
  var timer = setTimeout(close, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 4200);
})();
