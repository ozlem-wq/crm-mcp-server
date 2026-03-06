/**
 * get_contact_by_phone — Telefon numarasından arayanı tanımlar.
 * Güvenli kimlik doğrulama: platform arayanın numarasını enjekte eder,
 * kullanıcı kendi UUID'sini sağlamaz.
 *
 * Tablo: contacts | İşlem: SELECT (phone veya mobile eşleşmesi)
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const inputSchema = z.object({
  phone: z.string().min(1, 'phone is required'),
});

export const getContactByPhoneTool = {
  name: 'get_contact_by_phone',
  description: 'Identify the caller by their phone number. MUST be called first at the start of every conversation before any other tool. The phone number comes from the platform, not from user speech.',
  inputSchema,
  mcpInputSchema: {
    type: 'object',
    properties: {
      phone: { type: 'string', description: 'Caller phone number injected by the platform (not from user speech)' },
    },
    required: ['phone'],
  },

  async execute(input: z.infer<typeof inputSchema>, supabase: SupabaseClient) {
    const SELECT = 'id, first_name, last_name, full_name, email, phone, mobile, job_title, source, company:companies(name)';

    // Önce phone, sonra mobile dene
    let contact = null;
    const { data: byPhone } = await supabase
      .from('contacts')
      .select(SELECT)
      .eq('phone', input.phone)
      .maybeSingle();

    if (byPhone) {
      contact = byPhone;
    } else {
      const { data: byMobile } = await supabase
        .from('contacts')
        .select(SELECT)
        .eq('mobile', input.phone)
        .maybeSingle();
      contact = byMobile;
    }

    if (!contact) {
      return {
        identified: false,
        message: 'Bu telefon numarası sistemde kayıtlı değil.',
      };
    }

    return {
      identified: true,
      contact_id: contact.id,
      contact_name: contact.full_name ?? `${contact.first_name} ${contact.last_name}`,
      email: contact.email,
      job_title: contact.job_title,
      company: (contact.company as unknown as { name: string } | null)?.name ?? null,
    };
  },
};
