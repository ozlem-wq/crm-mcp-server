/**
 * get_ticket_details — Destek talep detaylarını getirir.
 * Tablo: tickets + profiles + contacts | İşlem: SELECT
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  ticket_number: z.string().min(1, 'ticket_number is required'),
});

export const getTicketDetailsTool = {
  name: 'get_ticket_details',
  description: 'Retrieve support ticket details by ticket number (e.g. TKT-00001). Returns title, status, SLA deadline, and associated contact info.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'The ticket number to look up (e.g. TKT-00001)' },
    },
    required: ['ticket_number'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        id, ticket_number, title, description, priority_id, status,
        created_at, sla_deadline, assigned_to,
        contact:contacts(first_name, last_name)
      `)
      .eq('ticket_number', input.ticket_number)
      .single();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data;
  },
};
