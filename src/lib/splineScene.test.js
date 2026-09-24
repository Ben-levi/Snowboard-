import { describe, expect, it } from 'vitest';
import { pickDeclared, sceneVariablesFor, sectionFromObjectName, STATUS_CODE, tintsFor, TINT_COLORS } from './splineScene.js';

describe('sectionFromObjectName', () => {
  it('maps section names and prefixed children', () => {
    expect(sectionFromObjectName('head')).toBe('head');
    expect(sectionFromObjectName('Head')).toBe('head');
    expect(sectionFromObjectName('head-helmet')).toBe('head');
    expect(sectionFromObjectName('upper_jacket 2')).toBe('upper');
    expect(sectionFromObjectName('equipment.board')).toBe('equipment');
  });

  it('ignores everything else', () => {
    expect(sectionFromObjectName('Camera')).toBeNull();
    expect(sectionFromObjectName('headlight')).toBeNull();
    expect(sectionFromObjectName('')).toBeNull();
    expect(sectionFromObjectName(undefined)).toBeNull();
  });
});

describe('sceneVariablesFor', () => {
  it('encodes rider type, name and per-section status', () => {
    const m = { name: 'Ido', rider: 'ski', items: { helmet: { status: 'buy' }, skis: { status: 'own' } } };
    const vars = sceneVariablesFor(m);
    expect(vars.rider).toBe(1);
    expect(vars.name).toBe('Ido');
    expect(vars.head_status).toBe(STATUS_CODE.buy);
    expect(vars.equipment_status).toBe(STATUS_CODE.partial);
    expect(vars.feet_status).toBe(STATUS_CODE.empty);
  });

  it('only keeps variables the scene declares', () => {
    expect(pickDeclared({ rider: 0, head_status: 3, name: 'x' }, { head_status: 0 })).toEqual({ head_status: 3 });
    expect(pickDeclared({ rider: 0 }, undefined)).toEqual({});
  });
});

describe('tintsFor', () => {
  it('gives a colour per section tint object', () => {
    const t = tintsFor({ rider: 'snowboard', items: { helmet: { status: 'buy' } } });
    expect(t['head-tint']).toBe(TINT_COLORS.buy);
    expect(t['feet-tint']).toBe(TINT_COLORS.empty);
  });
});
