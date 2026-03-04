/**
 * get_lead_info — CRM'den lead/contact bilgisi çeker.
 * Tablo: contacts | İşlem: SELECT
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  contact_id: z.string().uuid('contact_id must be a valid UUID'),
});

export const getLeadInfoTool = {
  name: 'get_lead_info',
  description: 'Retrieve lead/contact information from the CRM by contact ID. Returns name, email, phone, company, source, and notes.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      contact_id: { type: 'string', format: 'uuid', description: 'The UUID of the contact to look up' },
    },
    required: ['contact_id'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, phone, mobile, job_title, source, notes, company:companies(name)')
      .eq('id', input.contact_id)
      .single();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data;
  },
};
