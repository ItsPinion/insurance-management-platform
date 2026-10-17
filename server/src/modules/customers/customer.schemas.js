import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  dob: z.coerce
    .date({ error: 'A valid date of birth is required' })
    .refine((d) => d < new Date(), 'Date of birth must be in the past'),
  phone: z.string().regex(/^[0-9+\-\s]{7,15}$/, 'Invalid phone number'),
  address: z.string().min(5, 'Address must be at least 5 characters').max(300),
  email: z.string().email('Invalid email address'),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
