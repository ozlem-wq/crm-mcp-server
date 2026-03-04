/**
 * update_ticket_escalation — Ticket'ı eskalasyon olarak işaretler.
 * Tablo: tickets | İşlem: UPDATE
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  ticket_number: z.string().min(1, 'ticket_number is required'),
});

export const updateTicketTool = {
  name: 'update_ticket_escalation',
  description: 'Escalate a support ticket by ticket number. Sets status to escalated.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'The ticket number to escalate (e.g. TKT-00001)' },
    },
    required: ['ticket_number'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { error } = await supabase
      .from('tickets')
      .update({
        status: 'escalated',
        updated_at: new Date().toISOString(),
      })
      .eq('ticket_number', input.ticket_number);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return { success: true };
  },
};
