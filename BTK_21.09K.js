// BTK_21.09K.js — port of core calculation and plotting to JS + Plotly

function calculate_G(a_rad, b_rad){
  let H = (b_rad === 0) ? 0 : a_rad / b_rad;
  let G;
  if(H < -1){
    G = 9 * Math.exp(1.0986 * H) + 3;
  } else if(H <= 1){
    G = (0.23 * Math.pow(H,5) + 0.67 * Math.pow(H,4) - 0.95 * Math.pow(H,3)
         - 0.17 * Math.pow(H,2) - 1.78 * H + 3.00);
  } else {
    G = -4 * Math.exp(-Math.log(2) * H) + 3;
  }
  return G;
}

function compute_wire_thickness(I_user_value, min_I=0.13, max_I=10.34, min_thick=1.0, max_thick=5.0){
  if(I_user_value <= 0) return min_thick;
  const I_clamped = Math.max(min_I, Math.min(I_user_value, max_I));
  if(max_I === min_I) return min_thick;
  const ratio = (I_clamped - min_I) / (max_I - min_I);
  return min_thick + ratio * (max_thick - min_thick);
}

function lerpColor(c1, c2, t){
  return [Math.round(c1[0] + (c2[0]-c1[0]) * t),
          Math.round(c1[1] + (c2[1]-c1[1]) * t),
          Math.round(c1[2] + (c2[2]-c1[2]) * t)];
}
function rgbToHex(rgb){
  return '#' + rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
}

function get_wire_color(E_GPa){
  const blue=[0,0,255], purple=[128,0,128], gray=[128,128,128];
  if(E_GPa <= 59.08) return rgbToHex(blue);
  if(E_GPa <= 80){
    const t=(E_GPa-59.08)/(80-59.08);
    return rgbToHex(lerpColor(blue,purple,t));
  }
  if(E_GPa <= 90) return rgbToHex(purple);
  if(E_GPa <= 190){
    const t=(E_GPa-90)/(190-90);
    return rgbToHex(lerpColor(purple,gray,t));
  }
  return rgbToHex(gray);
}

// Material and cross-section data (same values as Python source)
const MATERIALS_DATA = {
  "Stainless Steel": 207.0,
  "Beta Titanium": 87.0,
  "Nickel Titanium": 14.5
};

const CROSS_SECTIONS_DATA = {
  "0.009 Round": 0.13,
  "0.010 Round": 0.20,
  "0.012 Round": 0.42,
  "0.014 Round": 0.78,
  "0.016 Round": 1.34,
  "0.017 Round": 1.71,
  "0.018 Round": 2.14,
  "0.019 Round": 2.66,
  "0.020 Round": 3.27,
  "0.021 Round": 3.97,
  "0.022 Round": 4.79,
  "0.010x0.020 Rect": 0.69,
  "0.016x0.022 Rect": 3.13,
  "0.017x0.025 Rect": 4.26,
  "0.018x0.025 Rect": 5.06,
  "0.019x0.025 Rect": 5.95,
  "0.021x0.025 Rect": 8.03,
  "0.022x0.028 Rect": 10.34
};

function fmtCoeff(v){
  if(!isFinite(v) || Math.abs(v) < 1e-30) return '0';
  // format with 3 significant digits
  const absV = Math.abs(v);
  const exp = Math.floor(Math.log10(absV));
  const scale = Math.pow(10, exp - 2);
  const rounded = Math.round(absV / scale) * scale;
  let s = rounded.toString();
  // trim trailing zeros
  if(s.indexOf('.')>=0){ s = s.replace(/0+$/,'').replace(/\.$/,''); }
  return (v<0?'-':'') + s;
}

function calculate_and_plot(){
  const L_mm = parseFloat(document.getElementById('L').value);
  const a_deg = parseFloat(document.getElementById('a').value);
  const b_deg = parseFloat(document.getElementById('b').value);
  const E_GPa = parseFloat(document.getElementById('E').value);
  const I_user_input = parseFloat(document.getElementById('I').value);

  if(isNaN(L_mm) || isNaN(a_deg) || isNaN(b_deg) || isNaN(E_GPa) || isNaN(I_user_input)){
    alert('Please enter valid numbers');
    return;
  }
  if(L_mm < 1 || L_mm > 50){ alert('L must be 1..50 mm'); return; }
  if(a_deg < -80 || a_deg > 80){ alert('a must be -80..80 deg'); return; }
  if(b_deg < -80 || b_deg > 80){ alert('b must be -80..80 deg'); return; }
  if(E_GPa < 14.5 || E_GPa > 207.0){ alert('E must be 14.5..207 GPa'); return; }

  const L = L_mm / 1000.0;
  const a_rad = a_deg * Math.PI/180;
  const b_rad = b_deg * Math.PI/180;
  const E = E_GPa * 1e9;
  const I = I_user_input * 1e-15;
  if(E===0 || I===0 || L===0) return;

  const G = calculate_G(a_rad, b_rad);

  const N = 500;
  const x_m = new Array(N);
  const y_m = new Array(N);
  for(let i=0;i<N;i++){
    const xm = L * (i/(N-1));
    x_m[i]=xm;
    y_m[i]=((a_rad + b_rad/2)/(2*Math.pow(L,2))) * (2*Math.pow(L,2)*xm - 3*L*Math.pow(xm,2) + Math.pow(xm,3))
           - ((b_rad + a_rad/2)/(2*Math.pow(L,2))) * (Math.pow(L,2)*xm - Math.pow(xm,3));
  }
  const x_mm_plot = x_m.map(v=>v*1000);
  const y_mm_plot = y_m.map(v=>v*1000);

  const wire_thickness = compute_wire_thickness(I_user_input);
  const wire_color = get_wire_color(E_GPa);

  const Fa = -(6 * E * I / Math.pow(L,2)) * (a_rad + b_rad) * 100 / 0.9817;
  const Fb = -Fa;
  const Ma = -(2 * E * I / L) * (2 * a_rad + b_rad) * 1e5 / 0.9817;
  const Mb = -(2 * E * I / L) * (a_rad + 2 * b_rad) * 1e5 / 0.9817;

  const Ma_rounded = Math.round(Ma), Mb_rounded = Math.round(Mb);
  const Fa_rounded = Math.round(Fa), Fb_rounded = Math.round(Fb);

  const Fa_N = Fa_rounded * 0.00980665;
  const Fb_N = Fb_rounded * 0.00980665;
  const Ma_Nm = Ma_rounded * 0.00980665e-3;
  const Mb_Nm = Mb_rounded * 0.00980665e-3;

  // equation coefficients in mm as in Python conversion
  const A = (a_rad + b_rad/2) / (2 * Math.pow(L,2));
  const B = (b_rad + a_rad/2) / (2 * Math.pow(L,2));
  const c1 = (2 * A - B) * Math.pow(L,2);
  const c2 = -3 * A * L / 1000;
  const c3 = (A + B) / 1e6;

  // build equation string
  function buildMathEq(){
    const parts = [];
    const items = [[c3,3],[c2,2],[c1,1]];
    let first=true;
    for(const it of items){
      const coeff = it[0]; const power = it[1];
      if(Math.abs(coeff) < 1e-30) continue;
      const coeffStr = fmtCoeff(Math.abs(coeff));
      const sign = first ? (coeff<0?'-':'') : (coeff<0 ? ' - ' : ' + ');
      first=false;
      if(power===1) parts.push(sign + coeffStr + ' x');
      else parts.push(sign + coeffStr + ' x^' + power);
    }
    if(parts.length===0) return 'y=0';
    return 'y=' + parts.join('');
  }

  const math_eq = buildMathEq();

  const showEq = document.getElementById('showEq').checked;

  const layout = {
    title: 'Force systems from an ideal arch',
    autosize: true,
    margin: { t: 50, b: 50, l: 60, r: 20 },
    xaxis: { title: 'x [mm]' },
    yaxis: { title: 'y [mm]' },
    annotations: []
  };
  // (Equation placement moved to above the left Fa/Ma label below)

  // place Fa/Ma on the left support and Fb/Mb on the right support in red (data coords)
  // compute vertical offset so the labels don't overlap the arch
  const ymax = Math.max.apply(null, y_mm_plot);
  const ymin = Math.min.apply(null, y_mm_plot);
  const yspan = Math.max(1e-6, ymax - ymin);
  const voffset = Math.max(1, 0.04 * yspan);
  const leftY = y_mm_plot[0] + voffset;
  const rightY = y_mm_plot[y_mm_plot.length - 1] + voffset;

  layout.annotations.push({
    x: x_mm_plot[0],
    y: leftY,
    xref: 'x',
    yref: 'y',
    text: `<b>Fa</b>: ${Fa_rounded} g<br><b>Ma</b>: ${Ma_rounded} g·mm`,
    showarrow: false,
    xanchor: 'left',
    yanchor: 'bottom',
    font: { color: 'red', size: 12 },
    bgcolor: 'rgba(255,255,255,0.8)'
  });

  layout.annotations.push({
    x: x_mm_plot[x_mm_plot.length - 1],
    y: rightY,
    xref: 'x',
    yref: 'y',
    text: `<b>Fb</b>: ${Fb_rounded} g<br><b>Mb</b>: ${Mb_rounded} g·mm`,
    showarrow: false,
    xanchor: 'right',
    yanchor: 'bottom',
    font: { color: 'red', size: 12 },
    bgcolor: 'rgba(255,255,255,0.8)'
  });

  // place the equation just above the left Fa/Ma label if requested
  if(showEq){
    const eqY = leftY + Math.max(1, 0.03 * yspan);
    layout.annotations.push({
      x: x_mm_plot[0],
      y: eqY,
      xref: 'x',
      yref: 'y',
      text: math_eq,
      showarrow: false,
      xanchor: 'left',
      yanchor: 'bottom',
      font: { color: 'black', size: 12 },
      bgcolor: 'rgba(255,255,255,0.85)'
    });
  }

  const trace = {
    x: x_mm_plot,
    y: y_mm_plot,
    mode: 'lines',
    // ensure minimum visible width
    line: { color: wire_color, width: Math.max(1, wire_thickness) },
    name: 'wire'
  };

  // Hide Plotly's floating modebar (pan/zoom toolbar) and logo for a cleaner UI
  Plotly.newPlot('plot', [trace], layout, {responsive:true, displayModeBar:false, displaylogo:false});

  // Display both the original g / g·mm units (rounded) and SI converted values
  document.getElementById('results').innerHTML =
    `<b>Ma</b>: ${Ma_rounded.toLocaleString()} g·mm (${Ma_Nm.toExponential(3)} Nm) &nbsp; ` +
    `<b>Mb</b>: ${Mb_rounded.toLocaleString()} g·mm (${Mb_Nm.toExponential(3)} Nm)<br>` +
    `<b>Fa</b>: ${Fa_rounded.toLocaleString()} g (${Fa_N.toExponential(3)} N) &nbsp; ` +
    `<b>Fb</b>: ${Fb_rounded.toLocaleString()} g (${Fb_N.toExponential(3)} N)<br>` +
    `Geometry = ${ (a_rad===0 && b_rad===0) ? 0 : G.toFixed(1) }`;
}

// wire up events
document.getElementById('plotBtn').addEventListener('click', calculate_and_plot);
const auto = document.getElementById('autoCalc');

// Sync numeric inputs with newly added range sliders. Use 'input' for live updates while dragging.
['L','a','b','E','I'].forEach(id=>{
  const num = document.getElementById(id);
  const range = document.getElementById(id + '_range');
  if(range){
    // initialize range to numeric value (keeps them consistent if HTML defaults differ)
    range.value = num.value;

    // when slider moves, update numeric input and optionally auto-calc
    range.addEventListener('input', ()=>{
      num.value = range.value;
      if(auto.checked) calculate_and_plot();
    });

    // when numeric input changes, update slider; 'input' keeps slider in sync while typing
    num.addEventListener('input', ()=>{ range.value = num.value; });

    // on commit (change), trigger calculation if auto is set
    num.addEventListener('change', ()=>{ if(auto.checked) calculate_and_plot(); });
  } else {
    // fallback: no slider present, still trigger on change
    num.addEventListener('change', ()=>{ if(auto.checked) calculate_and_plot(); });
  }
});

// initial plot
// Initialize material and cross-section selects and wire them to E/I
const materialSelect = document.getElementById('material');
const crossSectionSelect = document.getElementById('cross_section');
// set defaults
if(materialSelect){ materialSelect.value = 'Stainless Steel'; }
if(crossSectionSelect){ crossSectionSelect.value = '0.016 Round'; }

function update_E_from_material(){
  if(!materialSelect) return;
  const val = MATERIALS_DATA[materialSelect.value];
  if(typeof val === 'number'){
    document.getElementById('E').value = val;
    const r = document.getElementById('E_range'); if(r) r.value = val;
    if(auto.checked) calculate_and_plot();
  }
}

function update_I_from_cross_section(){
  if(!crossSectionSelect) return;
  const val = CROSS_SECTIONS_DATA[crossSectionSelect.value];
  if(typeof val === 'number'){
    // CROSS_SECTIONS_DATA values are in the same user-friendly units (×10^-15 m^4)
    document.getElementById('I').value = val;
    const r = document.getElementById('I_range'); if(r) r.value = val;
    if(auto.checked) calculate_and_plot();
  }
}

if(materialSelect){ materialSelect.addEventListener('change', update_E_from_material); }
if(crossSectionSelect){ crossSectionSelect.addEventListener('change', update_I_from_cross_section); }

// apply initial updates so the E/I fields match the dropdowns
update_E_from_material();
update_I_from_cross_section();

// initial plot
calculate_and_plot();

// Ensure plot resizes on window changes. Plotly's responsive option usually handles this,
// but calling Plotly.Plots.resize gives a reliable immediate resize for complex layouts.
window.addEventListener('resize', ()=>{
  try{
    const p = document.getElementById('plot');
    if(p) Plotly.Plots.resize(p);
  }catch(e){ /* ignore resize errors */ }
});