import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PALETTES, UI_PRESETS, accentTokens, contrastRatio, customColorCss, hexToHsv, hsvToHex, navTokens, paletteTokens, readableOn, resolveUiSettings, uiSettingsPatchSchema } from '@app/shared';

describe('custom colours', () => {
  it('round-trips hex ↔ HSV and keeps greys and primaries exact', () => {
    for (const hex of ['#7f56d9', '#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#808080', '#1e293b']) {
      const back = hsvToHex(hexToHsv(hex));
      const diff = [0, 2, 4].map((i) => Math.abs(parseInt(hex.slice(1 + i, 3 + i), 16) - parseInt(back.slice(1 + i, 3 + i), 16)));
      assert.ok(diff.every((d) => d <= 1), `${hex} → ${back}`);
    }
  });

  it('picks readable text for any background and keeps link colours accessible', () => {
    for (const hex of ['#fde047', '#7f56d9', '#101828', '#ffffff', '#f04438', '#00072d']) {
      assert.ok(contrastRatio(hex, readableOn(hex)) >= 4.5, `text on ${hex}`);
      const { light, dark } = accentTokens(hex);
      assert.ok(contrastRatio(light['--link'], '#ffffff') >= 4.5, `light link for ${hex}`);
      assert.ok(contrastRatio(dark['--link'], '#0a0a0b') >= 4.5, `dark link for ${hex}`);
    }
    const nav = navTokens('#1e293b');
    assert.equal(nav['--sidebar'], '#1e293b');
    assert.ok(contrastRatio(nav['--sidebar'], nav['--sidebar-ink']) >= 7, 'nav ink is readable');
  });

  it('generates CSS only for the colours that are set', () => {
    assert.equal(customColorCss({}), '');
    assert.match(customColorCss({ accentHex: '#12b76a' }), /data-accent="custom".*--accent:#12b76a/s);
    assert.match(customColorCss({ navHex: '#1e293b' }), /data-nav-color="custom".*--sidebar:#1e293b/s);
    assert.equal(customColorCss({ accentHex: 'javascript:alert(1)' }), '', 'never emits anything that is not a #rrggbb colour');
  });

  it('validates colour settings: hex only, normalised, null clears', () => {
    assert.deepEqual(uiSettingsPatchSchema.parse({ navHex: '#ABCDEF' }), { navHex: '#abcdef' });
    assert.deepEqual(uiSettingsPatchSchema.parse({ accentHex: null }), { accentHex: null });
    for (const bad of ['red', '#fff', '#12345g', 'url(x)', 123]) assert.equal(uiSettingsPatchSchema.safeParse({ navHex: bad }).success, false, String(bad));
    assert.equal(resolveUiSettings({ accentHex: 'nope' }).accentHex, null, 'stored garbage falls back to the default');
  });

  it('every theme preset is a valid colour patch with readable colours', () => {
    assert.ok(UI_PRESETS.length >= 6);
    assert.equal(new Set(UI_PRESETS.map((p) => p.id)).size, UI_PRESETS.length, 'unique ids');
    for (const preset of UI_PRESETS) {
      assert.equal(uiSettingsPatchSchema.safeParse(preset.ui).success, true, `${preset.id} is accepted by the API schema`);
      if (preset.ui.navHex) assert.ok(contrastRatio(preset.ui.navHex, navTokens(preset.ui.navHex)['--sidebar-ink']) >= 7, `${preset.id} navigation text`);
      if (preset.ui.accentHex) assert.ok(contrastRatio(accentTokens(preset.ui.accentHex).light['--accent'], accentTokens(preset.ui.accentHex).light['--accent-ink']) >= 3, `${preset.id} button text`);
    }
  });

  it('whole-app palettes are readable in light and dark and generate CSS for both', () => {
    const real = PALETTES.filter((p) => p.light);
    assert.ok(real.length >= 6);
    for (const palette of real) {
      for (const mode of ['light', 'dark']) {
        const c = palette[mode];
        assert.ok(contrastRatio(c.ink, c.surface) >= 7, `${palette.id} ${mode}: text on cards`);
        assert.ok(contrastRatio(c.ink, c.inset) >= 7, `${palette.id} ${mode}: text on the page`);
        assert.ok(contrastRatio(c.muted, c.surface) >= 4.5, `${palette.id} ${mode}: secondary text`);
        assert.ok(contrastRatio(c.ink, c.sidebar) >= 7, `${palette.id} ${mode}: text on the navigation`);
        assert.equal(Object.keys(paletteTokens(palette, mode).surfaces).length, 9);
      }
      const css = customColorCss({ palette: palette.id });
      assert.match(css, new RegExp(`data-palette="${palette.id}"`));
      assert.match(css, /data-theme="dark"\]\[data-palette/, 'has a dark rule');
      assert.match(css, /data-accent="custom"/, "uses the palette's own accent");
    }
    assert.equal(customColorCss({ palette: 'default' }), '', 'the built-in palette adds nothing');
    assert.equal(uiSettingsPatchSchema.safeParse({ palette: 'nonexistent' }).success, false);
  });
});
