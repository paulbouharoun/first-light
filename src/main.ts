import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/im-fell-english-sc/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import './styles.css';

import { renderPoster, PAGE_W } from './render/poster';
import { THEMES } from './render/themes';
import { formatLat, formatLon } from './sky/format';
import { zoneFor } from './sky/time';
import { buildSpecFromState as buildSpec } from './spec';
import { geocode, parseCoords, type Place } from './ui/geocode';
import { readState, writeState, type State } from './ui/state';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  date: $<HTMLInputElement>('date'),
  time: $<HTMLInputElement>('time'),
  place: $<HTMLInputElement>('place'),
  find: $<HTMLButtonElement>('find'),
  results: $<HTMLUListElement>('results'),
  placeMeta: $<HTMLParagraphElement>('placeMeta'),
  placeError: $<HTMLParagraphElement>('placeError'),
  caption: $<HTMLInputElement>('caption'),
  themes: $<HTMLDivElement>('themes'),
  optConst: $<HTMLInputElement>('optConst'),
  optLabels: $<HTMLInputElement>('optLabels'),
  optMw: $<HTMLInputElement>('optMw'),
  optGrid: $<HTMLInputElement>('optGrid'),
  mag: $<HTMLInputElement>('mag'),
  magOut: $<HTMLOutputElement>('magOut'),
  download: $<HTMLButtonElement>('download'),
  downloadMeta: $<HTMLParagraphElement>('downloadMeta'),
  sheet: $<HTMLDivElement>('sheet'),
  canvas: $<HTMLCanvasElement>('poster'),
};

let state: State = readState(location.hash);

// ---------------------------------------------------------------- render

let raf = 0;
function schedule() {
  cancelAnimationFrame(raf);
  els.sheet.classList.add('busy');
  raf = requestAnimationFrame(() => {
    raf = requestAnimationFrame(draw);
  });
}

function draw() {
  try {
    const spec = buildSpec(state);
    const w = Math.min(2400, Math.round(els.sheet.clientWidth * Math.min(2, devicePixelRatio || 1)));
    renderPoster(spec, Math.max(300, w), els.canvas);
    const z = zoneFor(state.lat, state.lon);
    els.placeMeta.textContent = `${formatLat(state.lat)} ${formatLon(state.lon)} · ${z}`;
    document.title = `${state.caption || 'First Light'} — First Light`;
  } catch (err) {
    console.error(err);
  } finally {
    els.sheet.classList.remove('busy');
  }
}

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  history.replaceState(null, '', writeState(state));
  schedule();
}

// ---------------------------------------------------------------- form

function syncForm() {
  els.date.value = state.date;
  els.time.value = state.time;
  els.place.value = state.place;
  els.caption.value = state.caption;
  els.optConst.checked = state.constellations;
  els.optLabels.checked = state.labels;
  els.optMw.checked = state.milkyWay;
  els.optGrid.checked = state.grid;
  els.mag.value = String(state.mag);
  els.magOut.textContent = state.mag.toFixed(1);
  renderThemes();
}

function renderThemes() {
  els.themes.replaceChildren(
    ...THEMES.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(t.id === state.theme));
      b.title = t.note;
      b.innerHTML = `<span class="swatch" style="background:${t.paper}">
          <i style="left:22%;top:30%;width:9px;height:9px;background:${t.ink}"></i>
          <i style="left:48%;top:56%;width:5px;height:5px;background:${t.ink}"></i>
          <i style="left:66%;top:24%;width:8px;height:8px;background:${t.accent}"></i>
        </span>${t.name}`;
      b.addEventListener('click', () => {
        update({ theme: t.id });
        renderThemes();
      });
      return b;
    }),
  );
}

els.date.addEventListener('input', () => els.date.value && update({ date: els.date.value }));
els.time.addEventListener('input', () => els.time.value && update({ time: els.time.value }));
els.caption.addEventListener('input', () => update({ caption: els.caption.value }));
els.optConst.addEventListener('change', () => update({ constellations: els.optConst.checked }));
els.optLabels.addEventListener('change', () => update({ labels: els.optLabels.checked }));
els.optMw.addEventListener('change', () => update({ milkyWay: els.optMw.checked }));
els.optGrid.addEventListener('change', () => update({ grid: els.optGrid.checked }));
els.mag.addEventListener('input', () => {
  els.magOut.textContent = Number(els.mag.value).toFixed(1);
  update({ mag: Number(els.mag.value) });
});

// Place search: explicit only (Enter or the Find button), never per keystroke.
let lastSearch = 0;
async function search() {
  const q = els.place.value.trim();
  els.placeError.hidden = true;
  if (!q) return;
  const coords = parseCoords(q);
  if (coords) {
    els.results.hidden = true;
    update({ ...coords, place: '' });
    els.place.value = '';
    return;
  }
  const wait = 1100 - (Date.now() - lastSearch);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  els.find.disabled = true;
  els.find.textContent = '…';
  try {
    const places = await geocode(q);
    showResults(places);
    if (!places.length) showError('No such place in the gazetteer. Try a nearby town, or type “lat, lon”.');
  } catch {
    showError('The gazetteer could not be reached. You can type coordinates instead, e.g. “51.48, -0.0”.');
  } finally {
    els.find.disabled = false;
    els.find.textContent = 'Find';
  }
}

function showError(msg: string) {
  els.placeError.textContent = msg;
  els.placeError.hidden = false;
}

function showResults(places: Place[]) {
  els.results.replaceChildren(
    ...places.map((p) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.name;
      const small = document.createElement('small');
      small.textContent = p.full;
      b.append(small);
      b.addEventListener('click', () => choose(p));
      li.append(b);
      return li;
    }),
  );
  els.results.hidden = places.length === 0;
  if (places.length) (els.results.querySelector('button') as HTMLButtonElement).focus();
}

function choose(p: Place) {
  els.results.hidden = true;
  els.place.value = p.name;
  update({ lat: p.lat, lon: p.lon, place: p.name });
}

els.find.addEventListener('click', search);
els.place.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    search();
  }
});
// Editing the label after choosing a place only changes the printed text.
els.place.addEventListener('input', () => update({ place: els.place.value }));
document.getElementById('form')!.addEventListener('submit', (e) => e.preventDefault());

// ---------------------------------------------------------------- export

const PRINT_WIDTHS = [3508, 2480]; // A3 @ 300 dpi, then 212 dpi for memory-limited browsers

async function exportPoster() {
  els.download.disabled = true;
  els.download.textContent = 'Pulling the print…';
  await new Promise((r) => setTimeout(r, 30));
  try {
    const spec = buildSpec(state);
    let blob: Blob | null = null;
    let used = 0;
    for (const w of PRINT_WIDTHS) {
      try {
        const c = renderPoster(spec, w);
        blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
        c.width = c.height = 0;
        if (blob) {
          used = w;
          break;
        }
      } catch {
        /* try a smaller plate */
      }
    }
    if (!blob) throw new Error('export failed');
    const slug = (state.caption || 'first-light')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug || 'first-light'}-${state.date}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    const dpi = Math.round(used / (PAGE_W / 25.4));
    els.downloadMeta.textContent = `PNG · ${used} × ${Math.round((used * 420) / 297)} px · ${dpi} dpi · saved`;
  } catch {
    els.downloadMeta.textContent = 'This browser ran out of canvas memory. Try a desktop browser.';
  } finally {
    els.download.disabled = false;
    els.download.textContent = 'Download A3 print';
  }
}
els.download.addEventListener('click', exportPoster);

// ---------------------------------------------------------------- boot

window.addEventListener('resize', schedule);
window.addEventListener('hashchange', () => {
  state = readState(location.hash);
  syncForm();
  schedule();
});

syncForm();
Promise.all(
  [
    '20px "IM Fell English"',
    'italic 20px "IM Fell English"',
    '20px "IM Fell English SC"',
    '20px "IBM Plex Mono"',
  ].map((f) => document.fonts.load(f)),
)
  .catch(() => undefined)
  .then(() => draw());
