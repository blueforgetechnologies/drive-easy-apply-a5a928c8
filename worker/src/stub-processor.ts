/**
 * Stub Processor for VPS Worker
 * 
 * Processes stub items from the enqueue-only webhook:
 * 1. Fetches Gmail token for the inbox
 * 2. Calls Gmail API to get new messages
 * 3. Routes messages to tenants
 * 4. Stores payloads and updates queue items
 * 5. Existing inbound processor handles parsing
 */

import { supabase } from './supabase.js';
import type { StubQueueItem } from './claim.js';
import {
  getGmailToken,
  fetchUnreadLoadEmails,
  extractAliasFromHeaders,
  getTenantIdFromAlias,
  isLoadHunterEnabled,
  storeRawPayload,
  markMessageAsRead,
} from './gmail.js';

export interface StubProcessResult {
  success: boolean;
  messagesQueued: number;
  error?: string;
}

/**
 * Process a stub item - fetch Gmail messages and queue for parsing
 */
export async function processStubItem(stub: StubQueueItem): Promise<StubProcessResult> {
  const startTime = Date.now();
  
  try {
    // Get Gmail token for this inbox
    const token = await getGmailToken(stub.from_email);
    if (!token) {
      console.error(`[stub] No valid token for ${stub.from_email}`);
      await failStub(stub.id, 'No valid Gmail token', stub.attempts);
      return { success: false, messagesQueued: 0, error: 'No valid Gmail token' };
    }

    // Fetch unread load emails
    const messages = await fetchUnreadLoadEmails(token.access_token);
    
    if (messages.length === 0) {
      // No messages - complete the stub
      await completeStub(stub.id);
      console.log(`[stub] No messages for history ${stub.gmail_history_id}`);
      return { success: true, messagesQueued: 0 };
    }

    console.log(`[stub] Processing ${messages.length} messages for ${stub.from_email}`);

    let queuedCount = 0;
    let skippedCount = 0;

    for (const message of messages) {
      // Extract headers for routing
      const headers = message.payload?.headers || [];
      const { alias, source, deliveredTo } = extractAliasFromHeaders(headers);

      // Get tenant from alias
      const { tenantId, tenantName, isPaused } = await getTenantIdFromAlias(alias);

      if (!tenantId) {
        console.log(`[stub] No tenant for alias ${alias}, quarantining message ${message.id}`);
        await quarantineMessage(message.id, stub.gmail_history_id, headers, alias);
        skippedCount++;
        continue;
      }

      if (isPaused) {
        console.log(`[stub] Tenant ${tenantName} is paused, skipping message ${message.id}`);
        skippedCount++;
        continue;
      }

      // Check if Load Hunter is enabled
      const loadHunterEnabled = await isLoadHunterEnabled(tenantId);
      if (!loadHunterEnabled) {
        console.log(`[stub] Load Hunter disabled for ${tenantName}, skipping message ${message.id}`);
        skippedCount++;
        continue;
      }

      // Store payload
      const payloadUrl = await storeRawPayload(tenantId, message.id, message);

      if (!payloadUrl) {
        console.error(`[stub] Failed to store payload for ${message.id}`);
        continue;
      }

      // Get header values for queue item
      const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
      
      // Insert queue item for inbound processing
      const { error: queueError } = await supabase
        .from('email_queue')
        .upsert({
          gmail_message_id: message.id,
          gmail_history_id: stub.gmail_history_id,
          status: 'pending',
          tenant_id: tenantId,
          payload_url: payloadUrl,
          subject: null, // NULL triggers inbound processing
          from_email: fromHeader?.value || null,
          routing_method: source || 'unknown',
          extracted_alias: alias,
          delivered_to_header: deliveredTo,
          queued_at: new Date().toISOString(),
        }, {
          onConflict: 'tenant_id,dedupe_key',
          ignoreDuplicates: true,
        });

      if (queueError) {
        // Ignore duplicate errors
        if (!queueError.message?.includes('duplicate') && !queueError.message?.includes('unique')) {
          console.error(`[stub] Queue insert error:`, queueError);
        }
        continue;
      }

      queuedCount++;

      // Mark message as read (non-blocking)
      markMessageAsRead(token.access_token, message.id).catch(() => {});
    }

    // Complete the stub
    await completeStub(stub.id);

    const elapsed = Date.now() - startTime;
    console.log(`[stub] ✅ Processed ${queuedCount} messages (${skippedCount} skipped) in ${elapsed}ms`);

    return { success: true, messagesQueued: queuedCount };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[stub] Error processing stub ${stub.id}:`, errorMessage);
    await failStub(stub.id, errorMessage, stub.attempts);
    return { success: false, messagesQueued: 0, error: errorMessage };
  }
}

async function completeStub(id: string): Promise<void> {
  await supabase
    .from('email_queue')
    .update({ status: 'completed', processed_at: new Date().toISOString() })
    .eq('id', id);
}

async function failStub(id: string, error: string, attempts: number): Promise<void> {
  const newStatus = attempts >= 3 ? 'failed' : 'pending';
  await supabase
    .from('email_queue')
    .update({
      status: newStatus,
      last_error: error,
      processing_started_at: null,
    })
    .eq('id', id);
}

async function quarantineMessage(
  messageId: string,
  historyId: string | null,
  headers: Array<{ name: string; value: string }>,
  alias: string | null
): Promise<void> {
  const headerMap = new Map<string, string>();
  for (const h of headers) {
    headerMap.set(h.name.toLowerCase(), h.value);
  }

  await supabase
    .from('unroutable_emails')
    .upsert({
      gmail_message_id: messageId,
      gmail_history_id: historyId,
      received_at: new Date().toISOString(),
      delivered_to_header: headerMap.get('delivered-to') || null,
      to_header: headerMap.get('to') || null,
      from_header: headerMap.get('from') || null,
      subject: headerMap.get('subject') || null,
      extracted_alias: alias,
      failure_reason: alias ? `No tenant configured for alias: ${alias}` : 'No alias found in email headers',
      status: 'quarantined',
    }, {
      onConflict: 'gmail_message_id',
      ignoreDuplicates: true,
    });
}
