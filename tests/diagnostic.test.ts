import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankState } from '../src/lib/diagnostic/types';
import { stateSchema, validateAgentOutput } from '../src/lib/diagnostic/schema';
import { scenarios, startDemo, advanceDemo } from '../src/lib/diagnostic/demo';
import { hasDiagnosticContent } from '../src/lib/diagnostic/session';
import { dangerous, getSafetyCopy, safetyStop } from '../src/lib/diagnostic/safety';

test('Structured model output rejects malformed data and normalizes weights', () => {
  assert.throws(() => validateAgentOutput('{}'), /validated/);
  assert.equal(
    stateSchema.safeParse({ ...blankState(), diagnosis_confidence: 101 })
      .success,
    false,
  );
  const h = {
    cause: 'A',
    probability: 1,
    change: 'same',
    supporting_evidence: [],
    contradicting_evidence: [],
  };
  const state = validateAgentOutput(
    JSON.stringify({
      ...blankState(),
      safety_warning: 'None',
      hypotheses: [h, { ...h, cause: 'B' }, { ...h, cause: 'C' }],
    }),
  );
  assert.equal(state.safety_warning, '');
  assert.equal(
    state.hypotheses.reduce((sum, h) => sum + h.probability, 0),
    100,
  );
  assert.throws(
    () =>
      validateAgentOutput(
        JSON.stringify({ ...blankState(), status: 'diagnosed' }),
      ),
    /incomplete/,
  );
});
test('Unsafe proposed actions become safety stops', () => {
  const state = validateAgentOutput(
    JSON.stringify({
      ...blankState(),
      repair_plan: ['Short the capacitor with a screwdriver'],
    }),
  );
  assert.equal(state.status, 'safety_stop');
  assert.equal(state.next_test, null);
});
test('All authored demo outcome paths terminate; skipped evidence does not advance', () => {
  let terminals = 0;
  const walk = (state: ReturnType<typeof startDemo>, depth = 0) => {
    assert.ok(depth < 10);
    if (state.status === 'diagnosed') {
      terminals++;
      assert.equal(state.next_test, null);
      assert.ok(state.repair_plan.length);
      return;
    }
    assert.ok(state.next_test);
    const skipped = advanceDemo(state, 'I cannot perform this test');
    assert.equal(skipped.next_test?.id, state.next_test.id);
    const ambiguous = advanceDemo(state, 'Something different happened');
    assert.equal(
      ambiguous.tests_completed.length,
      state.tests_completed.length,
    );
    for (const outcome of state.next_test.outcomes.filter(
      (o) => o !== 'I cannot perform this test',
    ))
      walk(advanceDemo(state, outcome), depth + 1);
  };
  for (const scenario of scenarios) walk(startDemo(scenario.id));
  assert.equal(terminals, 15);
});
test('Greeting intake filter preserves short technical and hazard reports', () => {
  for (const text of [
    '',
    'Hello!',
    'Hey there',
    'Hi, can you help me?',
    'Thanks',
  ])
    assert.equal(hasDiagnosticContent(text), false);
  for (const text of ['Smoke', 'WiFi', 'E42', 'My laptop will not start'])
    assert.equal(hasDiagnosticContent(text), true);
});

test('Multilingual hazards trigger stops and explicit symptom negations avoid false stops', () => {
  const hazardReports = [
    'My lithium battery is swollen',
    'Smoke is coming out of the laptop',
    'Short the capacitor with a screwdriver',
    'باتری لپ تاپم باد کرده است',
    'لپ‌تاپ من دود می‌کند',
    'جرقه از سیم برق بیرون می‌زند',
    'خازن را اتصال کوتاه کن',
    'باتری متورم نیست ولی دود می‌کند',
    'Mein Akku ist aufgebläht',
    'Aus meinem Laptop kommt Rauch',
    'Der Kondensator soll kurzgeschlossen werden',
    'Akku ist nicht aufgebläht, aber das Gerät qualmt',
    'Bataryam şişti',
    'Cihazdan duman çıkıyor',
    'Kondansatörü kısa devre yapın',
    'My battery is swollen but there is no smoke',
    'دود ندارد ولی باتری متورم است',
  ];
  for (const text of hazardReports) {
    assert.equal(dangerous(text), true, text);
    const output = validateAgentOutput(
      JSON.stringify({
        ...blankState(),
        repair_plan: [text],
      }),
    );
    assert.equal(output.status, 'safety_stop', text);
    assert.equal(output.next_test, null, text);
  }
  const ordinaryReports = [
    'My battery is not swollen and there is no smoke',
    'باتری باد نکرده و دود ندارد',
    'Mein Akku ist nicht aufgebläht und kein Rauch',
    'Batarya şişmedi ve duman yok',
    'Telefonumdan duman çıkmıyor',
    'My laptop cannot connect to Wi-Fi',
    'Mein WLAN funktioniert nicht',
    'اینترنت وصل نمی شود',
    'Telefonum şarj olmuyor',
  ];
  for (const text of ordinaryReports) {
    assert.equal(dangerous(text), false, text);
  }
});

test('Safety-stop messaging follows English, Persian, German and Turkish input', () => {
  const examples = [
    { input: 'My battery is swollen', marker: 'A potential electrical', language: 'en' },
    { input: 'باتری لپ‌تاپ من باد کرده است', marker: 'احتمال وجود خطر', language: 'fa' },
    { input: 'Mein Akku ist aufgebläht', marker: 'Es besteht möglicherweise', language: 'de' },
    { input: 'Bataryam şişti', marker: 'Elektrik veya hasarlı', language: 'tr' },
  ];
  for (const example of examples) {
    const state = safetyStop(blankState(), example.input);
    assert.equal(state.status, 'safety_stop');
    assert.match(state.assistant_message, new RegExp(example.marker));
    assert.ok(state.safety_warning.length > 80);
    assert.ok(state.repair_plan[0].length > 15);
    assert.equal(state.timeline.length, 1);
    assert.equal(state.next_test, null);
    assert.ok(getSafetyCopy(state.safety_warning).title);
    assert.match(
      validateAgentOutput(JSON.stringify({ ...blankState(), repair_plan: [example.input] }), example.input).assistant_message,
      new RegExp(example.marker),
    );
  }
  assert.match(safetyStop(blankState(), 'Device fault').assistant_message, /A potential electrical/);
});
