import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../src/App';
import { HypothesisPanel } from '../src/components/fixpilot/diagnostic-panels';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { startDemo } from '../src/lib/diagnostic/demo';

test('Home renders guided demos and no owner-editing controls', () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /Motor not working/);
  assert.match(html, /Black screen/);
  assert.doesNotMatch(html, /Edit site|Owner:|Learn with a guided demo/);
});
test('Evidence panel does not display premature diagnosis confidence', () => {
  const html = renderToStaticMarkup(
    createElement(TooltipProvider, {
      children: createElement(HypothesisPanel, {
        state: startDemo('robot'),
        mode: 'demo',
      }),
    }),
  );
  assert.match(html, /Not reached yet/);
  assert.doesNotMatch(html, /Demo confidence/);
});
