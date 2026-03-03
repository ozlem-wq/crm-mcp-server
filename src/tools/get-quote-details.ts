/**
 * get_quote_details — Teklif detaylarını getirir (contact join ile).
 * Tablo: quotes + contacts | İşlem: SELECT
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  quote_id: z.string().uuid('quote_id must be a valid UUID'),
});

export const getQuoteDetailsTool = {
  name: 'get_quote_details',
  description: 'Retrieve quote/proposal details from the CRM by quote ID. Returns quote number, amount, currency, validity, status, notes, and associated contact info.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      quote_id: { type: 'string', format: 'uuid', description: 'The UUID of the quote to look up' },
    },
    required: ['quote_id'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from('quotes')
      .select(`
        id, quote_number, total_amount, currency,
        valid_until, status, notes,
        contact:contacts(first_name, last_name, phone)
      `)
      .eq('id', input.quote_id)
      .single();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data;
  },
};
