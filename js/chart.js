/**
 * FORJA — Gráfico de linha em SVG (sem bibliotecas).
 *
 * Acessível: o <svg> tem role="img" + descrição textual, e quem monta a tela
 * deve oferecer também os mesmos dados em tabela (alternativa a gráfico).
 */
import { svgEl, fmtNum } from './utils.js';

const W = 320;
const H = 190;
const M = { l: 44, r: 14, t: 14, b: 28 };

/**
 * @param points [{ label: string, value: number }] em ordem cronológica
 * @param opts   { ariaLabel, unit }
 */
export function lineChart(points, { ariaLabel, unit = '' } = {}) {
  const svg = svgEl('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ariaLabel || 'Gráfico de evolução',
  });
  if (!points.length) return svg;

  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min = Math.max(0, min - pad);
  max += pad;

  const innerW = W - M.l - M.r;
  const innerH = H - M.t - M.b;
  const x = (i) => M.l + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v) => M.t + innerH - ((v - min) / (max - min)) * innerH;

  // Linhas de grade + rótulos do eixo Y
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    const yy = y(v);
    svg.append(
      svgEl('line', { class: 'grid', x1: M.l, x2: W - M.r, y1: yy, y2: yy }),
      svgEl('text', { class: 'axis', x: M.l - 6, y: yy + 3, 'text-anchor': 'end' }, fmtNum(v, max - min < 10 ? 1 : 0)),
    );
  }

  // Rótulos do eixo X (primeiro, último e, se couber, o do meio)
  const labelIdx = new Set([0, points.length - 1]);
  if (points.length > 4) labelIdx.add(Math.floor((points.length - 1) / 2));
  labelIdx.forEach((i) => {
    svg.append(svgEl('text', {
      class: 'axis', x: x(i), y: H - 8,
      'text-anchor': i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle',
    }, points[i].label));
  });

  // Linha
  if (points.length > 1) {
    svg.append(svgEl('polyline', {
      class: 'line', pathLength: 1, points: points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),
    }));
  }
  // Pontos (com <title> = dica ao passar o dedo/mouse)
  points.forEach((p, i) => {
    svg.append(svgEl('circle', {
      class: `dot${i === points.length - 1 ? ' last' : ''}`, cx: x(i), cy: y(p.value), r: 4,
    }, svgEl('title', {}, `${p.label}: ${fmtNum(p.value)}${unit ? ` ${unit}` : ''}`)));
  });
  return svg;
}
