import { DiagnosticState } from './types';
/** Normalize only whole-field absence markers; preserve actual safety advice. */
export function normalizeSafetyWarning(
  value: string | null | undefined,
): string {
  const text = value?.trim() || '';
  return /^(?:none(?: detected| identified)?|null|undefined|n\/a|not applicable|no safety warnings?|no safety concerns(?: identified)?)[.!。]*$/i.test(
    text,
  )
    ? ''
    : text;
}
export const SAFETY_STOP_WARNING =
  'Stop using and charging this device. Do not open, touch, puncture, or probe damaged batteries or high-voltage components. Keep people away. If there is active smoke or fire, move away and contact local emergency services. Have a qualified technician assess it.';
// Strip only explicit symptom negations; an additional hazard in the same
// message must still trigger a safety stop. This is deliberately conservative.
function withoutNegatedSymptoms(text: string): string {
  return text
    .replace(/\b(?:no|without|not)\s+(?:(?:any|visible|signs?\s+of)\s+)*(?:smoke|smoking|fire|sparks?|sparking|swollen|bulging|burning|leaks?|leakage|damage)\b/gi, '')
    .replace(/(?:بدون|هیچ)\s*(?:گونه\s*)?(?:دود|جرقه|آتش|حریق|نشتی|تورم|بادکردگی)/g, '')
    .replace(/(?:دود|جرقه|آتش|حریق|نشتی)\s*(?:نمی\s*(?:کند|کنه|دهد|ده)|ندارد|ندارم|نیست)/g, '')
    .replace(/(?:باد\s*نکرده|متورم\s*نیست|آسیب\s*ندیده)/g, '')
    .replace(/\b(?:kein(?:e|en|er|es)?|ohne)\s+(?:rauch|feuer|funken|brand|schwellung)\b/gi, '')
    .replace(/\bnicht\s+(?:aufgebläht|geschwollen|undicht|beschädigt|rauchend|brennend)\b/gi, '')
    .replace(/(?:duman|yangın|alev|kıvılcım|sızıntı)\s+(?:yok|çıkmıyor|çıkmadı)/giu, '')
    .replace(/(?:şişmedi|şişmemiş|şişkin\s+değil|sızdırmıyor)/giu, '');
}

// Keep the original English rules; extend common, high-confidence battery,
// smoke, electrical and capacitor hazards to Persian, German and Turkish.
// Keyword rules are defense in depth, not complete language understanding.
const englishHazards = /swollen|bulging|puffed|smok(?:e|ing)|burning|on fire|sparking|exposed mains|high.voltage|microwave|\bCRT\b|battery.{0,20}(leak|punctur|damag)|(?:discharg|short).{0,40}(?:capacitor|power.supply)|(?:mains|230\s*v|240\s*v|120\s*v).{0,40}(?:open|repair|prob|wir)|capacitor.{0,40}(?:discharg|short)|punctur.{0,30}(?:lithium|battery)/i;
const persianHazards = /(?:باتری|باطری|پیل).{0,35}(?:باد\s*کرده|ورم\s*کرده|متورم|بادکردگی|نشت|آسیب\s*دیده|سوراخ)|(?:دود|جرقه|حریق|آتش)|(?:برق\s*شهری|ولتاژ\s*بالا|برق\s*فشار\s*قوی|سیم\s*برق\s*لخت|سیم\s*لخت\s*برق)|(?:مایکروویو|ماکروویو).{0,25}(?:باز|تعمیر)|خازن.{0,35}(?:اتصال\s*کوتاه|تخلیه)/i;
const germanHazards = /(?:akku|batterie).{0,35}(?:aufgebläht|geschwollen|undicht|ausgelaufen|beschädigt)|\b(?:rauch|raucht|qualmt|funken|brennt|brand|hochspannung|netzspannung)\b|(?:mikrowelle).{0,30}(?:öffnen|reparier)|kondensator.{0,35}(?:entlad|kurzschließ|kurzgeschloss|kurzschloss)/i;
const turkishHazards = /(?:batarya|pil).{0,35}(?:şiş(?:ti|miş|iyor|kin|me)|delin(?:miş|di)|sızıntı|akıt(?:ıyor|tı)|hasar(?:lı|\s+gördü))|(?:duman|yangın|alev|kıvılcım)(?:\s+(?:çık(?:ıyor|tı|mış)|var|geliyor))?|yüksek\s*voltaj|şebeke\s*(?:elektriği|gerilimi)|mikrodalga.{0,30}(?:aç|onar|tamir)|kondansatör.{0,35}(?:deşarj|kısa\s*devre)/i;

export function dangerous(text: string) {
  const normalized = text
    .normalize('NFKC')
    .replace(/\u200c/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک');
  const symptoms = withoutNegatedSymptoms(normalized);
  return [englishHazards, persianHazards, germanHazards, turkishHazards].some(
    (pattern) => pattern.test(symptoms),
  );
}
type SafetyLanguage = 'en' | 'fa' | 'de' | 'tr';

// Used only for deterministic safety messages. Other product text remains as-is.
// Match distinctive words so English troubleshooting does not accidentally
// switch language; unknown languages fall back to English.
export function detectSafetyLanguage(text: string): SafetyLanguage {
  const value = text.normalize('NFKC').toLowerCase();
  if (/[\u0600-\u06FF]/u.test(value)) return 'fa';
  if (
    /[ğşı]/u.test(value) ||
    /(?:^|[^\p{L}])(?:batarya\p{L}*|pil(?:im|in|i|ler|leri|den|de|e)?|cihaz\p{L}*|duman|yangın|alev|kıvılcım|kondansatör|şebeke|telefonum|laptopum|yüksek\s+voltaj)(?=$|[^\p{L}])/u.test(value)
  ) return 'tr';
  if (
    /(?:^|[^\p{L}])(?:mein|meine|meinen|akku|batterie|gerät|geräts|raucht|rauch|qualmt|funken|brennt|aufgebläht|geschwollen|hochspannung|netzspannung|kondensator|mikrowelle)(?=$|[^\p{L}])/u.test(value) ||
    /[äß]/u.test(value)
  ) return 'de';
  return 'en';
}

const localizedSafety = {
  en: {
    title: 'Stop troubleshooting',
    message: 'A potential electrical or battery hazard needs professional attention. I have paused the diagnostic tests.',
    warning: SAFETY_STOP_WARNING,
    repair: 'Arrange an assessment by a qualified repair professional.',
    timeline: 'Safety stop — diagnostic tests paused',
    status: 'Safety stop',
    paused: 'Paused for safety',
    composer: 'Troubleshooting paused for safety',
  },
  fa: {
    title: 'توقف عیب‌یابی',
    message: 'احتمال وجود خطر برقی یا باتری آسیب‌دیده وجود دارد. برای حفظ ایمنی، آزمایش‌های عیب‌یابی را متوقف کرده‌ام.',
    warning: 'استفاده و شارژ دستگاه را متوقف کنید. باتری آسیب‌دیده یا قطعات با ولتاژ بالا را باز نکنید، لمس نکنید و دست‌کاری نکنید. دیگران را از دستگاه دور نگه دارید. اگر دود یا آتش وجود دارد، از محل فاصله بگیرید و با خدمات اضطراری تماس بگیرید. دستگاه باید توسط تعمیرکار متخصص بررسی شود.',
    repair: 'برای بررسی ایمن دستگاه به تعمیرکار متخصص مراجعه کنید.',
    timeline: 'توقف ایمنی — آزمایش‌های عیب‌یابی متوقف شدند',
    status: 'توقف ایمنی',
    paused: 'متوقف‌شده برای ایمنی',
    composer: 'عیب‌یابی برای حفظ ایمنی متوقف شده است',
  },
  de: {
    title: 'Fehlersuche stoppen',
    message: 'Es besteht möglicherweise eine Gefahr durch Strom oder einen beschädigten Akku. Ich habe die Diagnosetests aus Sicherheitsgründen gestoppt.',
    warning: 'Benutzen oder laden Sie das Gerät nicht weiter. Öffnen, berühren, durchstechen oder untersuchen Sie keine beschädigten Akkus oder Hochspannungsbauteile. Halten Sie andere Personen fern. Bei Rauch oder Feuer entfernen Sie sich und rufen Sie den örtlichen Notdienst. Lassen Sie das Gerät von einer Fachkraft überprüfen.',
    repair: 'Lassen Sie das Gerät von einer qualifizierten Fachkraft überprüfen.',
    timeline: 'Sicherheitsstopp — Diagnosetests angehalten',
    status: 'Sicherheitsstopp',
    paused: 'Aus Sicherheitsgründen angehalten',
    composer: 'Fehlersuche aus Sicherheitsgründen angehalten',
  },
  tr: {
    title: 'Sorun gidermeyi durdurun',
    message: 'Elektrik veya hasarlı batarya nedeniyle tehlike olabilir. Güvenlik için tanılama testlerini durdurdum.',
    warning: 'Cihazı kullanmayı ve şarj etmeyi bırakın. Hasarlı bataryaları veya yüksek voltajlı parçaları açmayın, dokunmayın, delmeyin veya kurcalamayın. İnsanları cihazdan uzak tutun. Duman ya da yangın varsa uzaklaşın ve yerel acil servisi arayın. Cihazı uzman bir teknisyene kontrol ettirin.',
    repair: 'Cihazı yetkin bir tamir uzmanına kontrol ettirin.',
    timeline: 'Güvenlik durdurması — tanılama testleri durduruldu',
    status: 'Güvenlik durdurması',
    paused: 'Güvenlik nedeniyle durduruldu',
    composer: 'Sorun giderme güvenlik nedeniyle durduruldu',
  },
} as const;

export function getSafetyCopy(text: string) {
  return localizedSafety[detectSafetyLanguage(text)];
}

export function safetyStop(
  s: DiagnosticState,
  latestUserText = '',
): DiagnosticState {
  const copy = getSafetyCopy(latestUserText || s.safety_warning || s.problem_summary);
  return {
    ...s,
    status: 'safety_stop',
    next_test: null,
    diagnosis_confidence: 0,
    safety_warning: copy.warning,
    assistant_message: copy.message,
    repair_plan: [copy.repair],
    timeline: [...s.timeline, copy.timeline],
  };
}
