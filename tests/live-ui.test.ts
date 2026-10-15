import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModeIndicator, ModeDetails } from '../src/components/fixpilot/mode-indicator';
import { modeLabel, type PublicConfig, LIVE_DISABLED_MESSAGE } from '../src/lib/live-config';
import { diagnose } from '../src/lib/diagnose';
import { draftSession } from '../src/lib/diagnostic/session';

test('Free text with live off returns friendly guidance without fetch or persistence', async (t) => {
  let requests = 0;
  t.mock.method(globalThis,'fetch',async()=>{requests++;throw new Error('Must not fetch');});
  const result = await diagnose(draftSession('live'),'My laptop screen is black',undefined,false);
  assert.deepEqual(result,{type:'live_disabled',message:LIVE_DISABLED_MESSAGE});
  assert.equal(requests,0);
});
test('Mode indicator is a labelled button and renders only real current quota metadata', () => {
  const off:PublicConfig={liveAI:false,provider:'gemini',model:'fixture-model',usage:null};
  const trigger = renderToStaticMarkup(createElement(ModeIndicator,{config:off,onRefresh(){}}));
  assert.match(trigger,/aria-label="Mode and usage: Live: off"/);
  assert.match(trigger,/aria-haspopup="dialog"/);
  const details = renderToStaticMarkup(createElement(ModeDetails,{config:off}));
  assert.match(details,/Guided demo/); assert.doesNotMatch(details,/Live messages today/);
  const now = new Date();
  const live:PublicConfig={...off,liveAI:true,usage:{used:3,limit:8,day:now.toISOString().slice(0,10),resetsAt:now.toISOString()}};
  assert.equal(modeLabel(live,now),'fixture-model · 3 of 8 today');
  assert.match(renderToStaticMarkup(createElement(ModeDetails,{config:live})),/3 of 8/);
  assert.equal(modeLabel({...live,usage:null},now),'fixture-model · usage unavailable');
  assert.equal(modeLabel({...live,usage:{...live.usage!,day:'2000-01-01'}},now),'fixture-model · usage unavailable');
  assert.match(renderToStaticMarkup(createElement(ModeDetails,{config:live,guided:true})),/Guided demo/);
});
