import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UI_PRESETS, accentTokens, contrastRatio, customColorCss, hexToHsv, hsvToHex, navTokens, readableOn, resolveUiSettings, uiSettingsPatchSchema } from '@app/shared';

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
});
