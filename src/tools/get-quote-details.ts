/**
 * get_quote_details — Teklif detaylarını getirir (contact join ile).
 * Tablo: quotes + contacts | İşlem: SELECT
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  quote_number: z.string().min(1, 'quote_number is required'),
});

export const getQuoteDetailsTool = {
  name: 'get_quote_details',
  description: 'Retrieve quote/proposal details from the CRM by quote number (e.g. TEK-00001). Returns amount, currency, validity, status, notes, and associated contact info.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      quote_number: { type: 'string', description: 'The quote number to look up (e.g. TEK-00001)' },
    },
    required: ['quote_number'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from('quotes')
      .select(`
        id, quote_number, grand_total, currency,
        valid_until, status, notes,
        contact:contacts(first_name, last_name, phone)
      `)
      .eq('quote_number', input.quote_number)
      .single();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data;
  },
};
