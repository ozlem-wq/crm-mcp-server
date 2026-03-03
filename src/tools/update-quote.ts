/**
 * update_quote_status — Teklif durumunu günceller.
 * Tablo: quotes | İşlem: UPDATE
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  quote_id: z.string().uuid('quote_id must be a valid UUID'),
  status: z.string().max(50, 'status max 50 chars'),
  reason: z.string().max(2000, 'reason max 2000 chars').optional(),
});

export const updateQuoteTool = {
  name: 'update_quote_status',
  description: 'Update the status of a quote/proposal. Optionally add a reason.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      quote_id: { type: 'string', format: 'uuid', description: 'The UUID of the quote' },
      status: { type: 'string', maxLength: 50, description: 'New status (e.g. sent, accepted, rejected, expired)' },
      reason: { type: 'string', maxLength: 2000, description: 'Optional reason for the status change' },
    },
    required: ['quote_id', 'status'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { error } = await supabase
      .from('quotes')
      .update({
        status: input.status,
        ...(input.reason ? { notes: input.reason } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.quote_id);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return { success: true };
  },
};
