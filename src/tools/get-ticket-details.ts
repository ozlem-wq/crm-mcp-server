/**
 * get_ticket_details — Destek talep detaylarını getirir.
 * Tablo: tickets + profiles + contacts | İşlem: SELECT
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  ticket_id: z.string().uuid('ticket_id must be a valid UUID'),
});

export const getTicketDetailsTool = {
  name: 'get_ticket_details',
  description: 'Retrieve support ticket details by ticket ID. Returns ticket number, subject, priority, status, SLA deadline, assignee name, and contact info.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', format: 'uuid', description: 'The UUID of the ticket to look up' },
    },
    required: ['ticket_id'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        id, ticket_number, title, description, priority_id, status,
        created_at, sla_deadline, assigned_to,
        contact:contacts(first_name, last_name)
      `)
      .eq('id', input.ticket_id)
      .single();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data;
  },
};
