/* Mobile navigation overlay — built at runtime from the page's own .nav-links.
   Zero per-page markup; injected on every chapter page. v11.2 (audit batch #2). */
(function () {
  if (window.self !== window.top) return; // never inside an iframe embed
  var nav = document.querySelector('nav.nav');
  if (!nav) return;
  var links = nav.querySelector('.nav-links');
  if (!links) return;

  var btn = document.createElement('button');
  btn.className = 'nav-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Open menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'mobileMenu');
  btn.innerHTML = '<span></span><span></span>';
  nav.appendChild(btn);

  var ov = document.createElement('div');
  ov.className = 'nav-overlay';
  ov.id = 'mobileMenu';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', 'Site navigation');

  var inner = document.createElement('nav');
  inner.className = 'nav-overlay-links';
  var home = document.createElement('a');
  home.href = '/';
  home.textContent = 'Home';
  inner.appendChild(home);
  links.querySelectorAll('a').forEach(function (a) {
    inner.appendChild(a.cloneNode(true));
  });

  var foot = document.createElement('div');
  foot.className = 'nav-overlay-foot';
  foot.innerHTML =
    '<a href="tel:+18478499828">(847) 849-9828</a>' +
    '<a href="mailto:pmilhaupt@jamesonsir.com">pmilhaupt@jamesonsir.com</a>';

  ov.appendChild(inner);
  ov.appendChild(foot);
  document.body.appendChild(ov);

  var open = false, prevFocus = null;
  function setOpen(v) {
    open = v;
    btn.setAttribute('aria-expanded', String(v));
    btn.setAttribute('aria-label', v ? 'Close menu' : 'Open menu');
    btn.classList.toggle('open', v);
    ov.classList.toggle('open', v);
    document.documentElement.classList.toggle('nav-locked', v);
    if (v) {
      prevFocus = document.activeElement;
      var first = inner.querySelector('a');
      if (first) first.focus();
    } else if (prevFocus && prevFocus.focus) {
      prevFocus.focus();
    }
  }

  btn.addEventListener('click', function () { setOpen(!open); });
  ov.addEventListener('click', function (e) { if (e.target === ov) setOpen(false); });
  inner.addEventListener('click', function (e) { if (e.target.tagName === 'A') setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'Tab') {
      var f = ov.querySelectorAll('a');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
})();
