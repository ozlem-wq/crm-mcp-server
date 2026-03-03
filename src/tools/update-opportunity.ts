/**
 * update_opportunity_status — Fırsat durumunu günceller.
 * Tablo: opportunities | İşlem: UPDATE
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  opportunity_id: z.string().uuid('opportunity_id must be a valid UUID'),
  status: z.string().max(50, 'status max 50 chars'),
  notes: z.string().max(2000, 'notes max 2000 chars').optional(),
});

export const updateOpportunityTool = {
  name: 'update_opportunity_status',
  description: 'Update the status of a sales opportunity. Optionally add notes.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      opportunity_id: { type: 'string', format: 'uuid', description: 'The UUID of the opportunity' },
      status: { type: 'string', maxLength: 50, description: 'New status value (e.g. qualified, negotiation, won, lost)' },
      notes: { type: 'string', maxLength: 2000, description: 'Optional notes about the status change' },
    },
    required: ['opportunity_id', 'status'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { error } = await supabase
      .from('opportunities')
      .update({
        status: input.status,
        ...(input.notes ? { notes: input.notes } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.opportunity_id);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return { success: true };
  },
};
