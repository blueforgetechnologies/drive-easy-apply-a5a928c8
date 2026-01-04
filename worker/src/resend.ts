/**
 * Resend Email Sending Module
 * 
 * Sends emails via Resend API for outbound email queue processing.
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Send an email via Resend API.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.RESEND_FROM_EMAIL || 'no-reply@resend.dev';

  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY is not configured' };
  }

  if (!options.to) {
    return { success: false, error: 'Recipient email (to) is required' };
  }

  if (!options.subject) {
    return { success: false, error: 'Email subject is required' };
  }

  if (!options.html && !options.text) {
    return { success: false, error: 'Email body (html or text) is required' };
  }

  try {
    const payload: Record<string, any> = {
      from: options.from || defaultFrom,
      to: [options.to],
      subject: options.subject,
    };

    if (options.html) {
      payload.html = options.html;
    }
    if (options.text) {
      payload.text = options.text;
    }

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.message || data.error || `HTTP ${response.status}`;
      console.error('[resend] API error:', errorMessage, data);
      return { success: false, error: errorMessage };
    }

    return { 
      success: true, 
      messageId: data.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[resend] Exception:', errorMessage);
    return { success: false, error: errorMessage };
  }
}
