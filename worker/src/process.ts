/**
 * Email Queue Processing Module
 * 
 * Processes outbound emails from the queue and sends them via Resend.
 */

import { sendEmail } from './resend.js';
import type { QueueItem } from './claim.js';

export interface ProcessResult {
  success: boolean;
  email_sent?: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Process a single queue item - send email via Resend.
 */
export async function processQueueItem(item: QueueItem): Promise<ProcessResult> {
  try {
    // Validate required fields for sending
    if (!item.to_email) {
      return { 
        success: false, 
        email_sent: false,
        error: 'Missing to_email in queue item' 
      };
    }

    if (!item.subject) {
      return { 
        success: false, 
        email_sent: false,
        error: 'Missing subject in queue item' 
      };
    }

    if (!item.body_html && !item.body_text) {
      return { 
        success: false, 
        email_sent: false,
        error: 'Missing body (html or text) in queue item' 
      };
    }

    // Construct the from address
    let fromAddress: string | undefined;
    if (item.from_email) {
      if (item.from_name) {
        fromAddress = `${item.from_name} <${item.from_email}>`;
      } else {
        fromAddress = item.from_email;
      }
    }

    // Send via Resend
    const result = await sendEmail({
      to: item.to_email,
      subject: item.subject,
      html: item.body_html || undefined,
      text: item.body_text || undefined,
      from: fromAddress,
    });

    if (result.success) {
      console.log(`[process] Email sent successfully`, {
        to: item.to_email,
        messageId: result.messageId,
      });
      return { 
        success: true, 
        email_sent: true,
        messageId: result.messageId,
      };
    } else {
      console.error(`[process] Failed to send email:`, result.error);
      return { 
        success: false, 
        email_sent: false,
        error: result.error,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[process] Exception processing queue item:`, errorMessage);
    return { 
      success: false, 
      email_sent: false,
      error: errorMessage,
    };
  }
}
