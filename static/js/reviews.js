(function () {
  var form = document.querySelector('.rv-form');
  if (!form || !window.fetch) return;
  var msg = form.querySelector('.rv-msg');
  var btn = form.querySelector('button[type="submit"]');
  function show(text, kind) { msg.textContent = text; msg.className = 'rv-msg ' + kind; }
  form.addEventListener('input', function () { if (msg.className.indexOf('err') > -1) show('', ''); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements;
    if (!form.querySelector('input[name="rating"]:checked')) { show('Choose a star rating first.', 'err'); return; }
    if (f.name.value.trim().length < 2) { show('Please enter your name.', 'err'); f.name.focus(); return; }
    if (f.text.value.trim().length < 10) { show('Please write at least a short sentence.', 'err'); f.text.focus(); return; }
    btn.disabled = true;
    fetch('/review', { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'Something went wrong. Please try again.' }; }); })
      .then(function (d) {
        if (d.ok) {
          form.reset();
          show(d.message, 'ok');
        } else {
          show(d.message, 'err');
          btn.disabled = false;
        }
      })
      .catch(function () { show('Could not send your review. Check your connection and try again.', 'err'); btn.disabled = false; });
  });
})();
