/**
 * reschedule_call — Geri arama görevi oluşturur.
 * Tablo: tasks | İşlem: INSERT
 *
 * NOT: tasks tablosunda 'notes' yerine 'description' kolonu var.
 * Bu vapi-crm-bridge'deki bilinen bug'ın düzeltilmiş hali.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  contact_id: z.string().uuid('contact_id must be a valid UUID'),
  datetime: z.string().max(50, 'datetime max 50 chars'),
  notes: z.string().max(2000, 'notes max 2000 chars').optional(),
});

export const rescheduleCallTool = {
  name: 'reschedule_call',
  description: 'Schedule a follow-up callback for a contact. Creates a task in the CRM with the specified date/time.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      contact_id: { type: 'string', format: 'uuid', description: 'The UUID of the contact to call back' },
      datetime: { type: 'string', description: 'When to call back (ISO 8601 or natural language date)' },
      notes: { type: 'string', maxLength: 2000, description: 'Optional notes about the callback reason' },
    },
    required: ['contact_id', 'datetime'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const { error } = await supabase
      .from('tasks')
      .insert({
        title: `Follow-up araması — ${input.datetime}`,
        due_date: input.datetime,
        contact_id: input.contact_id,
        description: input.notes ?? 'MCP: Callback talep edildi',
        status: 'pending',
      });

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return { success: true, message: `Callback ${input.datetime} için planlandı` };
  },
};
