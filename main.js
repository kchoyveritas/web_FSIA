'use strict';

const DEFAULTS = {
    L: 7.0,
    a: 0.0,
    b: 0.0,
    E: 207.0,
    I: 1.34
};

const MATERIALS_DATA = {
    'Stainless Steel': 207.0,
    'Beta Titanium': 87.0,
    'Nickel Titanium': 14.5
};

const CROSS_SECTIONS_DATA = {
    '0.009 Round': 0.13,
    '0.010 Round': 0.20,
    '0.012 Round': 0.42,
    '0.014 Round': 0.78,
    '0.016 Round': 1.34,
    '0.017 Round': 1.71,
    '0.018 Round': 2.14,
    '0.019 Round': 2.66,
    '0.020 Round': 3.27,
    '0.021 Round': 3.97,
    '0.022 Round': 4.79,
    '0.010x0.020 Rect': 0.69,
    '0.016x0.022 Rect': 3.13,
    '0.017x0.025 Rect': 4.26,
    '0.018x0.025 Rect': 5.06,
    '0.019x0.025 Rect': 5.95,
    '0.021x0.025 Rect': 8.03,
    '0.022x0.028 Rect': 10.34
};

let debounceId = null;

function populateSelect(selectEl, dataMap) {
    const fragment = document.createDocumentFragment();
    Object.keys(dataMap).forEach((label) => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        fragment.appendChild(option);
    });
    selectEl.appendChild(fragment);
}

function linspace(start, stop, count) {
    const step = (stop - start) / (count - 1);
    const values = new Array(count);
    for (let i = 0; i < count; i += 1) {
        values[i] = start + step * i;
    }
    return values;
}

function computeWireThickness(IUserValue, minI = 0.13, maxI = 10.34, minThick = 1.0, maxThick = 5.0) {
    if (IUserValue <= 0) {
        return minThick;
    }
    const clamped = Math.min(Math.max(IUserValue, minI), maxI);
    if (maxI === minI) {
        return minThick;
    }
    const ratio = (clamped - minI) / (maxI - minI);
    return minThick + ratio * (maxThick - minThick);
}

function getWireColor(EGPa) {
    const blue = [0, 0, 255];
    const purple = [128, 0, 128];
    const gray = [128, 128, 128];

    const lerp = (a, b, t) => a + (b - a) * t;
    const mix = (c1, c2, t) => c1.map((v, idx) => lerp(v, c2[idx], t));

    let rgb;
    if (EGPa <= 59.08) {
        rgb = blue;
    } else if (EGPa <= 80) {
        const t = (EGPa - 59.08) / (80 - 59.08);
        rgb = mix(blue, purple, t);
    } else if (EGPa <= 90) {
        rgb = purple;
    } else if (EGPa <= 190) {
        const t = (EGPa - 90) / (190 - 90);
        rgb = mix(purple, gray, t);
    } else {
        rgb = gray;
    }
    return `rgb(${rgb.map((v) => Math.round(v)).join(',')})`;
}

function calculateG(aRad, bRad) {
    const epsilon = 1e-9;
    const H = Math.abs(bRad) < epsilon ? 0 : aRad / bRad;
    if (H < -1) {
        return 9 * Math.exp(1.0986 * H) + 3;
    }
    if (H <= 1) {
        return 0.23 * H ** 5 + 0.67 * H ** 4 - 0.95 * H ** 3 - 0.17 * H ** 2 - 1.78 * H + 3.0;
    }
    return -4 * Math.exp(-Math.log(2) * H) + 3;
}

function formatNumber(value, digits = 3) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    const absVal = Math.abs(value);
    if (absVal >= 1000 || absVal < 0.01) {
        return value.toExponential(digits - 1);
    }
    return value.toFixed(digits);
}

function formatEquation(c1, c2, c3) {
    const parts = [];
    if (Math.abs(c3) > 1e-30) {
        parts.push(`${formatCoef(c3)} x^3`);
    }
    if (Math.abs(c2) > 1e-30) {
        parts.push(`${formatCoef(c2, parts.length > 0)} x^2`);
    }
    if (Math.abs(c1) > 1e-30) {
        parts.push(`${formatCoef(c1, parts.length > 0)} x`);
    }
    if (parts.length === 0) {
        return 'y(x) = 0';
    }
    return `y(x) = ${parts.join(' ')}`;
}

function formatCoef(value, useSign = false) {
    const sign = value < 0 ? '-' : '+';
    const absValue = Math.abs(value);
    const magnitude = absValue >= 1e4 || absValue < 1e-3 ? absValue.toExponential(2) : absValue.toFixed(3);
    return useSign ? `${sign} ${magnitude}` : `${value < 0 ? '-' : ''}${magnitude}`;
}

function setValidationMessage(message) {
    const el = document.getElementById('validation-message');
    el.textContent = message;
}

function renderResults(results) {
    const list = document.getElementById('results-list');
    const rows = [
        ['Fa (g)', formatNumber(results.FaGrams, 4)],
        ['Fb (g)', formatNumber(results.FbGrams, 4)],
        ['Ma (g·mm)', formatNumber(results.MaGramMm, 4)],
        ['Mb (g·mm)', formatNumber(results.MbGramMm, 4)],
        ['Fa (N)', formatNumber(results.FaNewton, 4)],
        ['Fb (N)', formatNumber(results.FbNewton, 4)],
        ['Ma (Nm)', formatNumber(results.MaNewtonMeter, 5)],
        ['Mb (Nm)', formatNumber(results.MbNewtonMeter, 5)],
        ['Geometry factor G', formatNumber(results.G, 4)]
    ];
    list.innerHTML = rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('');
}

function updateEquationDisplay(equationText) {
    document.getElementById('equation').textContent = equationText;
}

function scheduleRecalc() {
    if (debounceId) {
        window.clearTimeout(debounceId);
    }
    debounceId = window.setTimeout(() => {
        debounceId = null;
        calculateAndPlot();
    }, 250);
}

function gatherInputs() {
    const L = Number.parseFloat(document.getElementById('input-L').value);
    const a = Number.parseFloat(document.getElementById('input-a').value);
    const b = Number.parseFloat(document.getElementById('input-b').value);
    const E = Number.parseFloat(document.getElementById('input-E').value);
    const I = Number.parseFloat(document.getElementById('input-I').value);
    return { L, a, b, E, I };
}

function validateInputs({ L, a, b, E, I }) {
    if (!Number.isFinite(L) || L < 1 || L > 50) {
        return 'IBD length must be between 1 mm and 50 mm.';
    }
    if (!Number.isFinite(a) || a < -80 || a > 80) {
        return 'Slot angle a must be between -80° and 80°.';
    }
    if (!Number.isFinite(b) || b < -80 || b > 80) {
        return 'Slot angle b must be between -80° and 80°.';
    }
    if (!Number.isFinite(E) || E < 14.5 || E > 207) {
        return 'Young\'s modulus must be between 14.5 and 207 GPa.';
    }
    if (!Number.isFinite(I) || I < 0.13 || I > 10.34) {
        return 'Moment of inertia must be between 0.13 and 10.34 ×10⁻¹⁵ m⁴.';
    }
    return '';
}

function calculateAndPlot() {
    const inputs = gatherInputs();
    const validationError = validateInputs(inputs);
    if (validationError) {
        setValidationMessage(validationError);
        return;
    }

    setValidationMessage('');

    const Lmm = inputs.L;
    const L = Lmm / 1000;
    const aRad = degToRad(inputs.a);
    const bRad = degToRad(inputs.b);
    const EGPa = inputs.E;
    const E = EGPa * 1e9;
    const IUser = inputs.I;
    const I = IUser * 1e-15;

    if (E === 0 || I === 0 || L === 0) {
        return;
    }

    const G = calculateG(aRad, bRad);

    const xMeters = linspace(0, L, 500);
    const yMeters = xMeters.map((x) => {
        const term1 = (aRad + bRad / 2) / (2 * L ** 2);
        const term2 = (bRad + aRad / 2) / (2 * L ** 2);
        return term1 * (2 * L ** 2 * x - 3 * L * x ** 2 + x ** 3) - term2 * (L ** 2 * x - x ** 3);
    });

    const xMm = xMeters.map((x) => x * 1000);
    const yMm = yMeters.map((y) => y * 1000);

    const wireThickness = computeWireThickness(IUser);
    const wireColor = getWireColor(EGPa);

    const Fa = -(6 * E * I / (L ** 2)) * (aRad + bRad) * 100 / 0.9817;
    const Fb = -Fa;
    const Ma = -(2 * E * I / L) * (2 * aRad + bRad) * 1e5 / 0.9817;
    const Mb = -(2 * E * I / L) * (aRad + 2 * bRad) * 1e5 / 0.9817;

    const FaRounded = Math.round(Fa);
    const FbRounded = Math.round(Fb);
    const MaRounded = Math.round(Ma);
    const MbRounded = Math.round(Mb);

    const results = {
        FaGrams: FaRounded,
        FbGrams: FbRounded,
        MaGramMm: MaRounded,
        MbGramMm: MbRounded,
        FaNewton: FaRounded * 0.00980665,
        FbNewton: FbRounded * 0.00980665,
        MaNewtonMeter: MaRounded * 0.00980665e-3,
        MbNewtonMeter: MbRounded * 0.00980665e-3,
        G
    };

    renderResults(results);

    const termA = (aRad + bRad / 2) / (2 * L ** 2);
    const termB = (bRad + aRad / 2) / (2 * L ** 2);
    const c1 = (2 * termA - termB) * (L ** 2);
    const c2 = -3 * termA * L / 1000;
    const c3 = (termA + termB) / 1e6;
    updateEquationDisplay(`${formatEquation(c1, c2, c3)}  (x, y in mm)`);

    const yMax = Math.max(...yMm.map((value) => Math.abs(value)));
    const yMargin = yMax === 0 ? 1 : yMax * 1.2;

    const trace = {
        x: xMm,
        y: yMm,
        mode: 'lines',
        line: {
            color: wireColor,
            width: wireThickness
        },
        hovertemplate: 'x = %{x:.2f} mm<br>y = %{y:.4f} mm<extra></extra>'
    };

    const annotations = [
        {
            x: 0.02 * Lmm,
            y: yMargin * 0.95,
            text: `Ma = ${formatNumber(results.MaNewtonMeter, 5)} Nm<br>Fa = ${formatNumber(results.FaNewton, 4)} N`,
            showarrow: false,
            xanchor: 'left',
            yanchor: 'top',
            font: { size: 12 }
        },
        {
            x: Lmm * 0.98,
            y: yMargin * 0.95,
            text: `Mb = ${formatNumber(results.MbNewtonMeter, 5)} Nm<br>Fb = ${formatNumber(results.FbNewton, 4)} N`,
            showarrow: false,
            xanchor: 'right',
            yanchor: 'top',
            font: { size: 12 }
        },
        {
            x: Lmm * 0.5,
            y: yMargin * 0.6,
            text: inputs.a === 0 && inputs.b === 0 ? 'Geometry = 0' : `Geometry = ${formatNumber(G, 4)}`,
            showarrow: false,
            xanchor: 'center',
            font: { size: 14 }
        }
    ];

    const layout = {
        margin: { l: 60, r: 30, t: 40, b: 60 },
        xaxis: {
            title: 'x [mm]',
            rangemode: 'tozero'
        },
        yaxis: {
            title: 'y [mm]',
            range: [-yMargin, yMargin]
        },
        showlegend: false,
        hovermode: 'closest',
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff',
        annotations,
        shapes: [
            {
                type: 'line',
                x0: -0.02 * Lmm,
                x1: Lmm * 1.02,
                y0: 0,
                y1: 0,
                line: { color: '#666666', width: 1, dash: 'dot' }
            }
        ]
    };

    const config = {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };

    Plotly.react('plot', [trace], layout, config).catch((error) => {
        setValidationMessage(`Plot error: ${error}`);
    });
}

function degToRad(value) {
    return value * Math.PI / 180;
}

function applyMaterialDefaults() {
    const materialSelect = document.getElementById('select-material');
    const crossSectionSelect = document.getElementById('select-cross-section');
    const selectedMaterial = materialSelect.value;
    const selectedCross = crossSectionSelect.value;

    if (selectedMaterial && MATERIALS_DATA[selectedMaterial] !== undefined) {
        document.getElementById('input-E').value = MATERIALS_DATA[selectedMaterial].toFixed(2);
    }
    if (selectedCross && CROSS_SECTIONS_DATA[selectedCross] !== undefined) {
        document.getElementById('input-I').value = CROSS_SECTIONS_DATA[selectedCross].toFixed(2);
    }
    scheduleRecalc();
}

function resetToDefaults() {
    document.getElementById('input-L').value = DEFAULTS.L.toFixed(2);
    document.getElementById('input-a').value = DEFAULTS.a.toFixed(1);
    document.getElementById('input-b').value = DEFAULTS.b.toFixed(1);
    document.getElementById('input-E').value = DEFAULTS.E.toFixed(1);
    document.getElementById('input-I').value = DEFAULTS.I.toFixed(2);

    const materialSelect = document.getElementById('select-material');
    const crossSectionSelect = document.getElementById('select-cross-section');
    if (materialSelect.options.length > 0) {
        materialSelect.value = 'Stainless Steel';
    }
    if (crossSectionSelect.options.length > 0) {
        crossSectionSelect.value = '0.016 Round';
    }
    scheduleRecalc();
}

window.addEventListener('DOMContentLoaded', () => {
    const materialSelect = document.getElementById('select-material');
    const crossSectionSelect = document.getElementById('select-cross-section');

    populateSelect(materialSelect, MATERIALS_DATA);
    populateSelect(crossSectionSelect, CROSS_SECTIONS_DATA);

    resetToDefaults();

    materialSelect.addEventListener('change', applyMaterialDefaults);
    crossSectionSelect.addEventListener('change', applyMaterialDefaults);

    document.getElementById('controls-form').addEventListener('submit', (evt) => {
        evt.preventDefault();
        calculateAndPlot();
    });

    document.querySelectorAll('#controls-form input').forEach((input) => {
        input.addEventListener('input', scheduleRecalc);
        input.addEventListener('change', scheduleRecalc);
    });

    document.getElementById('reset-button').addEventListener('click', () => {
        resetToDefaults();
    });

    calculateAndPlot();
});
