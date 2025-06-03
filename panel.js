/* global CSInterface ***************************************************
 * Speedpunk-AI Panel – Illustrator CEP
 * panel.js  v 4.4.3    (2025-06-03)
 * - Heavy load auto-stop (>1 s) + dens-up re-enable
 * - Tick spacing & Color-map params
 * - Selection change no longer stops Live
 ***********************************************************************/

const PANEL_VERSION = '4.4.3';
const HOST_VERSION  = '4.1.0';     // ← host.jsx と合わせてください



(() => {
  /* ---------- safety check ---------- */
  if (typeof CSInterface === 'undefined') {
    document.body.innerHTML =
      '<h2 style="color:#f55">CSInterface.js missing</h2>';
    return;
  }

  /* ---------- shortcuts & footer ---------- */
  const cs  = new CSInterface();
  const $   = s => document.querySelector(s);
  const log = msg => { $('#msg').textContent = msg; };

  const foot = $('#ver');
  if (foot) foot.textContent =
      `Panel v${PANEL_VERSION} | Host v${HOST_VERSION}`;

  /* ---------- constants ---------- */
  const DEF_STEP  = 0.05;
  const POLL_MS   = 400;                 // ms
  const AUTO_OFF  = 10 * 60 * 1000;      // 10 min
  const MAX_MS    = 1000;                // heavy if >1 s

  /* ---------- timers & state ---------- */
  let liveID = null, autoID = null, pollID = null;
  let lastSig = 'none';
  let heavy = false, heavyStep = 0;

  /* ---------- helpers ---------- */
  const ui = () => ({
    step :  parseFloat($('#step').value),
    mag  :  parseFloat($('#mag').value),
    opacity : parseInt($('#opacity').value, 10),
    dir  :  $('#combDir').value,
    layer:  $('#layerPos').value,
    lock :  $('#lockLayer').checked,
    gamma : parseFloat($('#gamma').value),
    stroke: parseFloat($('#stroke').value),
    interval : parseInt($('#interval').value, 10),
    cmap :  $('#colormap').value,
    tick :  parseInt($('#tickSpace').value, 10)
  });

  const resetDensity = () => {
    $('#step').value = DEF_STEP;
    $('#stepVal').textContent = DEF_STEP;
  };

  const liveOff = () => {
    if (liveID) { clearInterval(liveID); liveID = null; }
    if (autoID) { clearTimeout(autoID);  autoID = null; }
    if (pollID) { clearInterval(pollID); pollID = null; }
    $('#liveMode').checked = false;
  };

  /* robust selection signature (doc-path + ids) */
  const getSig = cb => cs.evalScript(
    '(function(){' +
      'if(app.selection.length===0) return "none";' +
      'var d=app.activeDocument?app.activeDocument.fullName.fsName:"doc";' +
      'var ids=[]; for(var i=0;i<app.selection.length;i++) ids.push(app.selection[i].id);' +
      'return d+"|"+ids.sort().join(",");' +
    '})()', cb);

  /* send analyze and measure exec-time */
  const sendAnalyze = done => {
    const p = ui();
    const arg = [
      p.step, p.mag, p.opacity, p.lock ? 1 : 0,
      {inner:0, outer:1, both:2}[p.dir],
      {top:0, bottom:1}[p.layer],
      p.gamma, p.stroke,
      '"' + p.cmap.replace(/"/g,'\\"') + '"',   // ★ string needs quotes
      p.tick
    ].join(',');
    const t0 = Date.now();
    cs.evalScript('sp_speedpunkAnalyze(' + arg + ')',
      res => done(res, Date.now() - t0));
  };

  const onHeavy = ms => {
    heavy = true;
    heavyStep = parseFloat($('#step').value);
    liveOff();
    $('#liveMode').disabled = true;
    log(
      'Analyze ' + ms +
      ' ms – Live stopped. Increase “step” above ' +
      heavyStep + ' to re-enable.'
    );
  };

  /* guarded analyze (checks heavy only) */
  const analyze = () => {
    log('Analyzing…');
    sendAnalyze((res, ms) => {
      log(res || '');
      if (ms > MAX_MS) onHeavy(ms);
    });
  };

  /* ---------- label sync & heavy解除 ---------- */
  ['step','mag','opacity','gamma','stroke','tickSpace'].forEach(id => {
    const el = $('#'+id);
    if (!el) return;
    const labelId =
      id === 'opacity'   ? 'opVal'   :
      id === 'tickSpace' ? 'tickVal' : id + 'Val';
    const lbl = $('#'+labelId);
    el.addEventListener('input', () => {
      lbl && (lbl.textContent = el.value);
      if (heavy && id==='step' && parseFloat(el.value) > heavyStep) {
        heavy = false;
        $('#liveMode').disabled = false;
        log('Density increased. Live can be enabled again.');
      }
    });
  });

  /* ---------- manual analyze ---------- */
  $('#btnAnalyze').addEventListener('click', analyze);
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toUpperCase() === 'X')
      analyze();
  });

  /* ---------- Live checkbox ---------- */
  $('#liveMode').addEventListener('change', e => {
    if (e.target.checked) {
      if (heavy) { e.target.checked = false; return; }
      analyze();
      liveID = setInterval(analyze, ui().interval);
      autoID = setTimeout(() => {
        liveOff();
        log('Live auto-stopped after 10 min.');
      }, AUTO_OFF);

      /* poll selection only to keep signature (no stop) */
      getSig(sig => { lastSig = sig; });
      pollID = setInterval(() => getSig(sig => { lastSig = sig; }), POLL_MS);
    } else {
      liveOff();
    }
  });
})();
