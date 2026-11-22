import { describe, expect, test } from 'bun:test';
import { clampPan, MAX_ZOOM, pinchView, zoomAt } from './zoom-math';

const screenOf = (v: { s: number; x: number; y: number }, q: { x: number; y: number }) => ({ x: v.x + v.s * q.x, y: v.y + v.s * q.y });

describe('zoom da foto ampliada', () => {
  test('o ponto sob o dedo fica parado ao ampliar', () => {
    const v0 = { s: 1, x: 0, y: 0 };
    const p = { x: 80, y: -40 };
    const v1 = zoomAt(v0, 2.5, p);
    const q = { x: (p.x - v0.x) / v0.s, y: (p.y - v0.y) / v0.s };
    const after = screenOf(v1, q);
    expect(after.x).toBeCloseTo(80);
    expect(after.y).toBeCloseTo(-40);
  });

  test('o zoom não passa de 4x nem fica menor que o tamanho normal', () => {
    expect(zoomAt({ s: 1, x: 0, y: 0 }, 10, { x: 0, y: 0 }).s).toBe(MAX_ZOOM);
    expect(zoomAt({ s: 2, x: 0, y: 0 }, 0.2, { x: 0, y: 0 }).s).toBe(1);
  });

  test('afastar os dedos ao dobro da distância dobra o zoom', () => {
    const v = pinchView({ s: 1, x: 0, y: 0 }, { x: -50, y: 0 }, { x: 50, y: 0 }, { x: -100, y: 0 }, { x: 100, y: 0 });
    expect(v.s).toBeCloseTo(2);
    expect(v.x).toBeCloseTo(0);
  });

  test('a foto não é arrastada para fora da tela e volta ao centro sem zoom', () => {
    const box = { stageW: 400, stageH: 600, imgW: 400, imgH: 400 };
    expect(clampPan({ s: 2, x: 999, y: 999 }, box)).toEqual({ s: 2, x: 200, y: 100 });
    expect(clampPan({ s: 1, x: 50, y: 50 }, box)).toEqual({ s: 1, x: 0, y: 0 });
  });
});
