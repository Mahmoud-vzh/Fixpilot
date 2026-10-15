import {
  blankState,
  DiagnosticState,
  DiagnosticTest,
  Hypothesis,
} from './types';
import { dangerous, safetyStop } from './safety';
export const scenarios = [
  {
    id: 'robot',
    name: 'Robot left motor failure',
    category: 'Robotics',
    problem: "My robot powers on normally, but the left wheel doesn't move.",
    detail: 'Follow the fault from wheel to driver.',
    time: '4–6 min',
    tag: 'FLAGSHIP DEMO',
  },
  {
    id: 'laptop',
    name: 'Laptop black screen',
    category: 'Computers',
    problem: 'My laptop turns on but the screen stays black.',
    detail: 'Separate display faults from boot issues.',
    time: '3–5 min',
    tag: 'DISPLAY & POWER',
  },
  {
    id: 'sensor',
    name: 'Arduino sensor reads zero',
    category: 'Embedded systems',
    problem: 'My Arduino sensor keeps returning zero.',
    detail: 'Check the signal before changing the code.',
    time: '3–5 min',
    tag: 'SIGNALS & FIRMWARE',
  },
  {
    id: 'wifi',
    name: 'Wi-Fi without internet',
    category: 'Networking',
    problem: 'My Wi-Fi is connected but there is no internet.',
    detail: 'Trace the connection beyond your device.',
    time: '2–4 min',
    tag: 'NETWORK ISOLATION',
  },
];
const test = (
  id: string,
  name: string,
  purpose: string,
  instructions: string[],
  outcomes: string[],
  tools: string[] = [],
  safety = 'Low risk · keep power off for physical checks',
): DiagnosticTest => ({
  id,
  name,
  purpose,
  instructions,
  outcomes,
  required_tools: tools,
  safety,
  difficulty: 'Easy',
  estimated_time: '2–3 minutes',
});
function rank(
  s: DiagnosticState,
  names: string[],
  values: number[],
): Hypothesis[] {
  return names.map((cause, i) => {
    let old =
      s.hypotheses.find((h) => h.cause === cause)?.probability ?? values[i];
    return {
      cause,
      probability: values[i],
      change:
        values[i] === 0
          ? 'ruled_out'
          : values[i] > old
            ? 'up'
            : values[i] < old
              ? 'down'
              : 'same',
      supporting_evidence:
        values[i] >= 40 ? s.confirmed_symptoms.slice(-2) : [],
      contradicting_evidence:
        values[i] < 10 ? s.confirmed_symptoms.slice(-1) : [],
    };
  });
}
const robotNames = [
  'Motor or motor wiring',
  'Motor driver channel',
  'PWM / firmware',
  'Mechanical obstruction',
  'Power supply',
];
const laptopNames = [
  'Internal display / backlight',
  'Display cable / connector',
  'Boot / GPU output',
  'Power instability',
];
const sensorNames = [
  'Sensor wiring / pin mapping',
  'Firmware configuration',
  'Sensor fault',
  'Power or ground',
];
const wifiNames = [
  'Router / upstream connection',
  'Device configuration',
  'DNS resolution',
  'Wi-Fi signal',
];
export function startDemo(id: string): DiagnosticState {
  let s = blankState(),
    item = scenarios.find((x) => x.id === id) ?? scenarios[0];
  s.category = item.category;
  s.problem_summary = item.problem;
  s.timeline = ['Problem reported', 'Initial hypotheses created'];
  s.confirmed_symptoms = [item.problem];
  if (id === 'robot') {
    s.device = 'Two-wheel Arduino robot';
    s.hypotheses = rank(s, robotNames, [30, 25, 20, 15, 10]);
    s.assistant_message =
      'The right wheel working gives us a useful comparison. Let’s first rule out a simple mechanical obstruction, before touching the wiring.';
    s.unknowns = [
      'Does the left wheel turn freely?',
      'Does the fault follow the motor or the driver?',
    ];
    s.next_test = test(
      'robot-mech',
      'Check the wheel, with power off',
      'Separate a physical jam from an electrical fault.',
      [
        'Switch off the robot and disconnect its battery.',
        'Lift the wheels clear of the surface. Keep fingers away from gears.',
        'Gently check the left wheel for visible debris and unusual resistance. Do not force a geared motor. Compare with the right wheel.',
      ],
      ['Moves freely', 'Obstruction found', 'I cannot perform this test'],
    );
  }
  if (id === 'laptop') {
    s.device = 'Laptop';
    s.hypotheses = rank(s, laptopNames, [40, 25, 25, 10]);
    s.assistant_message =
      'We need to separate a screen problem from a computer that is not completing startup. An external display is a useful first check.';
    s.next_test = test(
      'laptop-display',
      'Connect an external display',
      'Check whether the laptop can produce a usable video signal.',
      [
        'Connect a known-working monitor with a compatible cable.',
        'Select the correct monitor input.',
        'Turn the laptop on and wait for startup. Use its documented display-toggle key if needed.',
      ],
      [
        'External display works',
        'No image on either display',
        'I cannot perform this test',
      ],
      ['External monitor', 'Compatible video cable'],
      'Low risk · no disassembly',
    );
  }
  if (id === 'sensor') {
    s.device = 'Arduino sensor project';
    s.hypotheses = rank(s, sensorNames, [40, 30, 15, 15]);
    s.assistant_message =
      'A zero reading can come from wiring, pin mapping, or firmware. First compare the circuit with the exact sensor pinout.';
    s.next_test = test(
      'sensor-wiring',
      'Verify the sensor connections',
      'Identify a mismatched signal pin or missing ground.',
      [
        'Disconnect USB and external power.',
        'Use the manufacturer pinout for the exact sensor model. Never infer pin order from appearance.',
        'Compare signal, ground and rated supply connections with your code. Do not change voltage without checking the sensor rating.',
      ],
      [
        'Signal pin does not match code',
        'Connections match documentation',
        'I cannot perform this test',
      ],
      ['Sensor documentation'],
    );
  }
  if (id === 'wifi') {
    s.device = 'Wi-Fi network';
    s.hypotheses = rank(s, wifiNames, [40, 30, 20, 10]);
    s.assistant_message =
      'Let’s find out whether this affects one device or the whole network. This check leaves your router settings unchanged.';
    s.next_test = test(
      'wifi-device',
      'Try another device',
      'Separate a device-specific issue from a network-wide outage.',
      [
        'Connect another trusted device to the same Wi-Fi.',
        'Temporarily turn off cellular data on that device.',
        'Try opening two unrelated websites.',
      ],
      [
        'Other device also has no internet',
        'Other device works',
        'I cannot perform this test',
      ],
      ['Second device'],
      'Low risk · no reset',
    );
  }
  return s;
}
export function advanceDemo(
  previous: DiagnosticState,
  input: string,
): DiagnosticState {
  let s = structuredClone(previous);
  if (s.status === 'safety_stop') return s;
  if (dangerous(input)) return safetyStop(s);
  let t = s.next_test;
  if (!t)
    return {
      ...s,
      assistant_message:
        'This guided demo is complete. Start a new diagnosis for another problem, or export this report.',
    };
  if (!t.outcomes.includes(input)) {
    s.assistant_message =
      'This is a guided demo with scripted outcomes, so I cannot interpret free-form evidence or photos here. Choose the outcome that matches this test, or use a live diagnosis for your own issue.';
    return s;
  }
  if (input === 'I cannot perform this test') {
    s.assistant_message =
      'That’s okay. This test is still unperformed, so the hypotheses have not changed. You can return to it when you have the equipment, or take this incomplete report to a technician.';
    s.unknowns = [...new Set([...s.unknowns, `Not tested: ${t.name}`])];
    return s;
  }
  s.tests_completed.push({ name: t.name, result: input });
  s.confirmed_symptoms.push(input);
  s.timeline.push(`${t.name}: ${input}`);
  const finish = (
    cause: string,
    confidence: number,
    plan: string[],
    verification: string,
  ) => {
    s.status = 'diagnosed';
    s.next_test = null;
    s.diagnosis_confidence = confidence;
    s.assistant_message = `The evidence points most strongly to ${cause}. This is a provisional diagnosis, not a confirmed component failure. Review the repair plan and verify the result.`;
    s.repair_plan = plan;
    s.verification = verification;
    s.timeline.push('Provisional diagnosis prepared');
    s.unknowns = ['Repair effectiveness must be verified'];
    return s;
  };
  if (t.id === 'robot-mech') {
    if (input === 'Obstruction found') {
      s.hypotheses = rank(s, robotNames, [10, 5, 5, 75, 5]);
      return finish(
        'a mechanical obstruction',
        75,
        [
          'Keep battery disconnected. Remove only loose, accessible debris without disassembly.',
          'If the gearbox binds or requires force, stop and seek mechanical service.',
          'Reconnect only after securing the robot with wheels clear and guards in place.',
        ],
        'Run a brief low-speed test with hands clear; both wheels should rotate smoothly.',
      );
    }
    s.hypotheses = rank(s, robotNames, [38, 32, 20, 2, 8]);
    s.assistant_message =
      'Free movement makes a mechanical jam less likely. Next, isolate whether the fault follows the motor assembly or stays with the driver channel.';
    s.next_test = test(
      'robot-swap',
      'Swap the motor output connectors',
      'A controlled comparison separates the motor assembly from its drive channel.',
      [
        'Only use this check on a small low-voltage hobby robot with identical, compatible motors and clearly labeled connectors. Otherwise choose “I cannot perform this test”.',
        'Disconnect battery and USB. Record the original connector positions.',
        'Swap the left and right motor plugs at the driver outputs. Never swap power inputs or rewire a live board.',
        'Secure the robot with wheels off the surface; keep people and fingers clear. Reconnect power and run the same brief low-speed command.',
        'Switch off and disconnect power again before restoring connections.',
      ],
      [
        'Fault follows the motor',
        'Fault stays on the driver channel',
        'Both motors now work',
        'I cannot perform this test',
      ],
      ['Driver pinout', 'Compatible motor connectors'],
      'Moderate · low-voltage hobby robots only',
    );
    return s;
  }
  if (t.id === 'robot-swap') {
    if (input === 'Both motors now work') {
      s.hypotheses = rank(s, robotNames, [72, 10, 8, 2, 8]);
      return finish(
        'an intermittent motor connection',
        72,
        [
          'Disconnect all power. Inspect the accessible motor connectors for loose seating.',
          'Reseat compatible connectors according to the driver documentation; replace damaged leads through a qualified repairer.',
        ],
        'Repeat brief low-speed tests after restoring the original connector arrangement.',
      );
    }
    if (input === 'Fault follows the motor') {
      s.hypotheses = rank(s, robotNames, [80, 5, 5, 2, 8]);
      s.assistant_message =
        'The fault moving with the motor points to the motor or its attached cable. It does not prove the motor itself is faulty. Let’s inspect that cable with power disconnected.';
      s.next_test = test(
        'robot-cable',
        'Inspect the motor lead',
        'Separate a visible wiring defect from an internal motor fault.',
        [
          'Disconnect all sources of power.',
          'Inspect the accessible cable and connector on the failing motor.',
          'Look for an unseated plug, severed lead or visibly damaged connector. Do not open the motor or probe a powered circuit.',
        ],
        [
          'Loose or broken connection found',
          'No visible wiring problem',
          'I cannot perform this test',
        ],
      );
      return s;
    }
    s.hypotheses = rank(s, robotNames, [5, 58, 30, 2, 5]);
    s.assistant_message =
      'Because the same output channel fails with either motor, the motor is less likely. The driver and its control signal remain possible. Check the pin mapping before replacing the driver.';
    s.next_test = test(
      'robot-pwm',
      'Compare the control pin mapping',
      'Separate a configuration mistake from a possible driver-channel fault.',
      [
        'Disconnect all power before checking connections.',
        'Compare left/right enable and direction pins against the driver documentation and source code.',
        'Confirm the chosen PWM pin supports PWM and the enable/jumper settings match the intended mode. Do not probe live signals.',
      ],
      [
        'Left PWM pin mapping is wrong',
        'Pin mapping matches documentation',
        'I cannot perform this test',
      ],
      ['Source code', 'Board and driver documentation'],
    );
    return s;
  }
  if (t.id === 'robot-cable') {
    let found = input === 'Loose or broken connection found';
    s.hypotheses = rank(s, robotNames, [
      found ? 90 : 78,
      found ? 3 : 7,
      4,
      1,
      found ? 2 : 10,
    ]);
    return finish(
      found
        ? 'a motor wiring connection fault'
        : 'the motor or its attached cable',
      found ? 90 : 78,
      found
        ? [
            'Disconnect all power. Reseat a loose connector according to its documentation.',
            'Have damaged wiring replaced with a correctly rated lead; do not twist bare wires together.',
          ]
        : [
            'Keep the unit powered off. Ask a technician to check cable continuity and the motor separately.',
            'Do not replace the driver solely on this result.',
          ],
      'Restore original outputs, secure the robot and repeat the same low-speed command.',
    );
  }
  if (t.id === 'robot-pwm') {
    let wrong = input === 'Left PWM pin mapping is wrong';
    s.hypotheses = rank(
      s,
      robotNames,
      wrong ? [3, 5, 87, 1, 4] : [5, 65, 25, 1, 4],
    );
    return finish(
      wrong
        ? 'a PWM pin mapping mismatch'
        : 'the driver channel or its control signal',
      wrong ? 87 : 65,
      wrong
        ? [
            'Back up the firmware. Correct the left enable/PWM mapping using the board documentation.',
            'Upload the corrected firmware with the motor supply disconnected; then disconnect USB and restore the documented power configuration.',
          ]
        : [
            'A matching pin map does not confirm the electrical PWM signal.',
            'Have a qualified technician check the control signal and driver output before replacing parts.',
          ],
      'With wheels raised and hands clear, run a brief low-speed command and compare both channels.',
    );
  }
  if (t.id === 'laptop-display') {
    let works = input === 'External display works';
    s.hypotheses = rank(
      s,
      laptopNames,
      works ? [60, 30, 5, 5] : [20, 10, 60, 10],
    );
    s.assistant_message = works
      ? 'A working external display makes a complete GPU or boot failure less likely. It does not distinguish the panel from its cable.'
      : 'No image on either display leaves boot failure possible, but monitor compatibility is still a factor.';
    s.next_test = works
      ? test(
          'laptop-light',
          'Look for a faint screen image',
          'A faint image can suggest a backlight problem.',
          [
            'Leave the laptop assembled.',
            'In a dim room, shine a normal flashlight at an angle across the screen.',
            'Look for a faint desktop or login image. Do not press the panel.',
          ],
          [
            'Faint image visible',
            'No faint image',
            'I cannot perform this test',
          ],
          ['Flashlight'],
          'Low risk · external inspection only',
        )
      : test(
          'laptop-boot',
          'Check startup indicators',
          'Gather evidence of a startup fault without opening the laptop.',
          [
            'Watch for a manufacturer logo or an error LED pattern.',
            'Listen for documented diagnostic beeps.',
            'Check the exact laptop manual; patterns vary by model.',
          ],
          [
            'Documented boot error present',
            'No specific error found',
            'I cannot perform this test',
          ],
          ['Model documentation'],
          'Low risk · external inspection only',
        );
    return s;
  }
  if (t.id.startsWith('laptop-')) {
    let faint = input === 'Faint image visible';
    s.hypotheses = rank(
      s,
      laptopNames,
      faint ? [75, 18, 3, 4] : [40, 25, 25, 10],
    );
    return finish(
      faint
        ? 'the display backlight path'
        : 'an unresolved display or startup fault',
      faint ? 75 : 40,
      [
        'Back up your data through an external display if available.',
        'Have the panel, cable and backlight supply assessed by a qualified technician. Do not open the laptop while powered.',
      ],
      'Confirm several normal cold starts and stable display operation.',
    );
  }
  if (t.id === 'sensor-wiring') {
    let mismatch = input === 'Signal pin does not match code';
    s.hypotheses = rank(
      s,
      sensorNames,
      mismatch ? [82, 10, 3, 5] : [20, 45, 20, 15],
    );
    if (mismatch)
      return finish(
        'a signal-pin mismatch',
        82,
        [
          'Disconnect power. Align the signal connection and configured pin using the exact board/sensor documentation.',
          'Reconnect the documented supply voltage only.',
        ],
        'Apply a safe known input and confirm readings change in the expected range.',
      );
    s.assistant_message =
      'Matching connections leave firmware configuration and the sensor itself in question. A minimal manufacturer example removes application complexity.';
    s.next_test = test(
      'sensor-example',
      'Try the manufacturer example',
      'Check the sensor independently of the main application.',
      [
        'Back up the sketch.',
        'Use the manufacturer example for the exact sensor and board. Set its documented pin/address.',
        'Upload with actuators disconnected and observe the serial output.',
      ],
      [
        'Example gives changing readings',
        'Example still returns zero',
        'I cannot perform this test',
      ],
      ['Manufacturer example'],
      'Low risk · disconnect actuators',
    );
    return s;
  }
  if (t.id === 'sensor-example') {
    let works = input === 'Example gives changing readings';
    s.hypotheses = rank(
      s,
      sensorNames,
      works ? [5, 85, 3, 7] : [25, 25, 30, 20],
    );
    return finish(
      works
        ? 'an application firmware issue'
        : 'an unresolved sensor or supply issue',
      works ? 85 : 30,
      works
        ? [
            'Compare pin mode, address, initialization and sampling timing with the working example.',
            'Change one configuration item at a time and retain the known-working sketch.',
          ]
        : [
            'Do not assume the sensor has failed. Record the exact model, pinout and output.',
            'Have a qualified person check the rated supply and signal before buying replacement parts.',
          ],
      'Confirm stable readings for several known safe inputs.',
    );
  }
  if (t.id === 'wifi-device') {
    let all = input === 'Other device also has no internet';
    s.hypotheses = rank(s, wifiNames, all ? [75, 5, 15, 5] : [5, 65, 25, 5]);
    return finish(
      all
        ? 'a router or upstream connection issue'
        : 'a device-specific network setting',
      all ? 75 : 65,
      all
        ? [
            'Check the router’s external status lights and your provider’s outage information.',
            'If safe for connected users, restart using the manufacturer’s normal power procedure. Do not factory-reset it.',
            'Contact the provider if the connection remains down.',
          ]
        : [
            'Temporarily disconnect a personal VPN if permitted.',
            'Reconnect to the trusted Wi-Fi and check the device’s automatic IP and DNS settings.',
            'On a managed device, contact your administrator before changing configuration.',
          ],
      'Open multiple websites on two devices with cellular fallback off.',
    );
  }
  return s;
}
