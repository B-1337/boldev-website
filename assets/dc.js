/* Kleine runtime die de Bold-ontwerpbestanden als gewone webpagina laat draaien. */
(function () {
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (partial) {
    var p = typeof partial === 'function' ? partial(this.state) : partial;
    this.state = Object.assign({}, this.state, p || {});
    schedule(this);
  };
  window.DCLogic = DCLogic;

  var pending = false;
  function schedule(c) {
    if (!c.__mounted || pending) return;
    pending = true;
    Promise.resolve().then(function () { pending = false; render(c); });
  }

  function get(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var o = scope;
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function evalStr(str, scope) {
    var m = str.match(/^\s*\{\{([^}]*)\}\}\s*$/);
    if (m) return get(m[1], scope);
    return str.replace(/\{\{([^}]*)\}\}/g, function (_, p) {
      var v = get(p, scope);
      return v == null || typeof v === 'function' ? '' : String(v);
    });
  }
  var EVENTS = { onclick: 'click', onkeydown: 'keydown', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave', onchange: 'change' };

  function proc(node, scope) {
    var kids = Array.prototype.slice.call(node.childNodes);
    for (var k = 0; k < kids.length; k++) {
      var ch = kids[k];
      if (ch.nodeType === 3) { if (ch.nodeValue.indexOf('{{') > -1) ch.nodeValue = evalStr(ch.nodeValue, scope); continue; }
      if (ch.nodeType !== 1) { if (ch.nodeType === 8) ch.remove(); continue; }
      var tag = ch.tagName.toLowerCase();
      if (tag === 'sc-if') {
        if (evalStr(ch.getAttribute('value') || '', scope)) { proc(ch, scope); while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch); }
        ch.remove(); continue;
      }
      if (tag === 'sc-for') {
        var list = evalStr(ch.getAttribute('list') || '', scope) || [];
        var as = ch.getAttribute('as');
        for (var i = 0; i < list.length; i++) {
          var cl = ch.cloneNode(true); var sc = Object.create(scope); sc[as] = list[i];
          proc(cl, sc);
          while (cl.firstChild) ch.parentNode.insertBefore(cl.firstChild, ch);
        }
        ch.remove(); continue;
      }
      var attrs = Array.prototype.slice.call(ch.attributes);
      for (var a = 0; a < attrs.length; a++) {
        var name = attrs[a].name, val = attrs[a].value;
        if (name.indexOf('hint-') === 0) { ch.removeAttribute(name); continue; }
        if (EVENTS[name]) {
          var fn = evalStr(val, scope); ch.removeAttribute(name);
          if (typeof fn === 'function') {
            var type = EVENTS[name];
            if (name === 'onchange' && !(tag === 'input' && /checkbox|radio/i.test(ch.getAttribute('type') || '')) && tag !== 'select') type = 'input';
            ch.__h = ch.__h || {}; ch.__h[type] = fn;
          }
          continue;
        }
        if (val.indexOf('{{') > -1) {
          var v = evalStr(val, scope);
          if (name === 'value') { ch.__value = v == null ? '' : String(v); ch.removeAttribute(name); continue; }
          if (name === 'checked') { ch.__checked = !!v; ch.removeAttribute(name); continue; }
          if (name.indexOf('aria-') === 0 && (v === false || v === true)) ch.setAttribute(name, String(v));
          else if (v === false || v == null) ch.removeAttribute(name);
          else ch.setAttribute(name, v === true ? (name.indexOf('aria-') === 0 ? 'true' : '') : String(v));
        }
      }
      if (tag === 'textarea' && ch.__value === undefined && ch.getAttribute('value') != null) { ch.__value = ch.getAttribute('value'); }
      proc(ch, scope);
    }
  }

  function bind(el) {
    el.__b = el.__b || {};
    for (var t in el.__h) {
      if (!el.__b[t]) {
        el.__b[t] = true;
        (function (type) { el.addEventListener(type, function (e) { var f = el.__h && el.__h[type]; if (f) f(e); }); })(t);
      }
    }
  }
  function applyProps(el) {
    if (el.__value !== undefined && el.value !== el.__value) el.value = el.__value;
    if (el.__checked !== undefined) el.checked = el.__checked;
  }
  function morph(a, b) {
    if (a.nodeType !== b.nodeType || (a.nodeType === 1 && a.tagName !== b.tagName)) { a.parentNode.replaceChild(b, a); hydrate(b); return; }
    if (a.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    if (a.nodeType !== 1) return;
    var i, at;
    for (i = a.attributes.length - 1; i >= 0; i--) { at = a.attributes[i].name; if (!b.hasAttribute(at)) a.removeAttribute(at); }
    for (i = 0; i < b.attributes.length; i++) { at = b.attributes[i]; if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value); }
    a.__h = b.__h; a.__value = b.__value; a.__checked = b.__checked;
    bind(a); applyProps(a);
    var ac = a.childNodes, bc = Array.prototype.slice.call(b.childNodes);
    for (i = 0; i < bc.length; i++) { if (i < ac.length) morph(ac[i], bc[i]); else { a.appendChild(bc[i]); hydrate(bc[i]); } }
    while (ac.length > bc.length) a.removeChild(a.lastChild);
  }
  function hydrate(n) {
    if (n.nodeType !== 1) return;
    if (n.__h) bind(n);
    applyProps(n);
    for (var i = 0; i < n.childNodes.length; i++) hydrate(n.childNodes[i]);
  }

  function build(c) {
    var frag = c.__tpl.content.cloneNode(true);
    var vals = c.renderVals ? c.renderVals() : {};
    proc(frag, vals);
    var wrap = document.createElement('div');
    wrap.appendChild(frag);
    return wrap;
  }
  function render(c) {
    var next = build(c), a = c.__root, i;
    var bc = Array.prototype.slice.call(next.childNodes), ac = a.childNodes;
    for (i = 0; i < bc.length; i++) { if (i < ac.length) morph(ac[i], bc[i]); else { a.appendChild(bc[i]); hydrate(bc[i]); } }
    while (ac.length > bc.length) a.removeChild(a.lastChild);
  }

  window.DCMount = function (Component) {
    var tpl = document.getElementById('dc-template');
    var root = document.getElementById('dc-root');
    var c = new Component({});
    c.__tpl = tpl; c.__root = root;
    var first = build(c);
    while (first.firstChild) root.appendChild(first.firstChild);
    hydrate(root);
    c.__mounted = true;
    if (c.componentDidMount) c.componentDidMount();
    window.__dc = c;
  };
})();
