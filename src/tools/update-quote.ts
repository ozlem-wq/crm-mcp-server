/**
 * update_quote_status — Teklif durumunu günceller.
 * Tablo: quotes | İşlem: UPDATE
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  quote_number: z.string().min(1, 'quote_number is required'),
  status: z.string().max(50, 'status max 50 chars'),
  reason: z.string().max(2000, 'reason max 2000 chars').optional(),
});

export const updateQuoteTool = {
  name: 'update_quote_status',
  description: 'Update the status of a quote/proposal by quote number. Optionally add a reason.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      quote_number: { type: 'string', description: 'The quote number (e.g. TEK-00001)' },
      status: { type: 'string', maxLength: 50, description: 'New status (e.g. sent, accepted, rejected, expired)' },
      reason: { type: 'string', maxLength: 2000, description: 'Optional reason for the status change' },
    },
    required: ['quote_number', 'status'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from('quotes')
      .update({
        status: input.status,
        ...(input.reason ? { notes: input.reason } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('quote_number', input.quote_number)
      .select('id');

    if (error) throw new Error(`Supabase error: ${error.message}`);
    if (!data || data.length === 0) return { success: false, reason: 'Record not found' };
    return { success: true };
  },
};
