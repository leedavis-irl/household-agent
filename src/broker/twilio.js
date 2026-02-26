const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;

export function isConfigured() {
  return !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);
}

export async function sendSms(toNumber, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');

  const params = new URLSearchParams({
    To: toNumber,
    From: TWILIO_FROM,
    Body: body,
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.message || `Twilio error ${res.status}` };
    }
    return { success: true, sid: data.sid };
  } catch (err) {
    return { success: false, error: `Twilio request failed: ${err.message}` };
  }
}
