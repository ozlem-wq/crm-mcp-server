/**
 * update_ticket_escalation — Ticket'ı eskalasyon olarak işaretler.
 * Tablo: tickets | İşlem: UPDATE
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  ticket_id: z.string().uuid('ticket_id must be a valid UUID'),
  assignee_id: z.string().uuid('assignee_id must be a valid UUID').optional(),
});

export const updateTicketTool = {
  name: 'update_ticket_escalation',
  description: 'Escalate a support ticket. Marks it as escalated and optionally reassigns to a new agent.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', format: 'uuid', description: 'The UUID of the ticket to escalate' },
      assignee_id: { type: 'string', format: 'uuid', description: 'Optional UUID of the new assignee' },
    },
    required: ['ticket_id'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { error } = await supabase
      .from('tickets')
      .update({
        escalated: true,
        ...(input.assignee_id ? { assignee_id: input.assignee_id } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.ticket_id);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return { success: true };
  },
};
