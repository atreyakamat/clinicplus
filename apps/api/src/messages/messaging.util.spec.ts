import { normalizePhoneE164, phoneLookupCandidates } from './phone.util';
import { computeTwilioSignature, verifyTwilioSignature } from './twilio-signature';
import { contentVariablesFor, renderTemplate, unknownTemplateVariables } from './template-render';
import { mapTwilioStatus, shouldApplyStatus } from './messaging.types';

describe('phone normalisation', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['098765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['0014155238886', '+14155238886'],
    ['whatsapp:+14155238886', '+14155238886'],
  ])('%s → %s', (input, out) => expect(normalizePhoneE164(input)).toBe(out));

  it.each(['', '12345', 'abc', '+0123456789'])('rejects %s', (input) => expect(normalizePhoneE164(input)).toBeNull());

  it('lookup candidates include common stored spellings', () => {
    const c = phoneLookupCandidates('+919876543210');
    expect(c).toEqual(expect.arrayContaining(['+919876543210', '9876543210', '919876543210', '98765 43210']));
  });
});

describe('twilio signature', () => {
  // Example from Twilio's security docs.
  it('matches the documented example', () => {
    const sig = computeTwilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', {
      CallSid: 'CA1234567890ABCDE',
      Caller: '+12349013030',
      Digits: '1234',
      From: '+12349013030',
      To: '+18005551212',
    });
    expect(sig).toBe('0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
  });

  it('verifies and rejects', () => {
    const p = { A: '1', B: '2' };
    const s = computeTwilioSignature('tok', 'https://x/y', p);
    expect(verifyTwilioSignature('tok', 'https://x/y', p, s)).toBe(true);
    expect(verifyTwilioSignature('tok', 'https://x/y', { ...p, B: '3' }, s)).toBe(false);
    expect(verifyTwilioSignature('tok', 'https://x/y', p, undefined)).toBe(false);
  });
});

describe('template rendering', () => {
  it('replaces known variables and blanks missing ones', () => {
    expect(renderTemplate('Hi {{ firstName }}, see {{doctorName}} {{link}}', { firstName: 'Asha', doctorName: 'Dr. Rao' })).toBe('Hi Asha, see Dr. Rao');
  });
  it('detects unknown variables', () => {
    expect(unknownTemplateVariables('{{firstName}} {{foo}}')).toEqual(['foo']);
  });
  it('builds ordered Twilio ContentVariables', () => {
    expect(contentVariablesFor('{{firstName}} {{appointmentTime}} {{firstName}}', { firstName: 'A', appointmentTime: '10' })).toEqual({ '1': 'A', '2': '10' });
  });
});

describe('twilio status mapping', () => {
  it('maps and orders statuses', () => {
    expect(mapTwilioStatus('queued')).toBe('QUEUED');
    expect(mapTwilioStatus('delivered')).toBe('DELIVERED');
    expect(mapTwilioStatus('undelivered')).toBe('UNDELIVERED');
    expect(shouldApplyStatus('DELIVERED', 'SENT')).toBe(false);
    expect(shouldApplyStatus('QUEUED', 'DELIVERED')).toBe(true);
    expect(shouldApplyStatus('FAILED', 'DELIVERED')).toBe(false);
  });
});
