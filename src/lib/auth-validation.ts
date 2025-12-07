import { z } from 'zod';

// Email validation schema
export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: 'Email is required' })
  .email({ message: 'Please enter a valid email address' })
  .max(255, { message: 'Email must be less than 255 characters' });

// Password validation schema
export const passwordSchema = z
  .string()
  .min(6, { message: 'Password must be at least 6 characters' })
  .max(128, { message: 'Password must be less than 128 characters' });

// Full name validation schema
export const fullNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Full name is required' })
  .max(100, { message: 'Name must be less than 100 characters' })
  .regex(/^[a-zA-Z\s'-]+$/, { message: 'Name can only contain letters, spaces, hyphens, and apostrophes' });

// Login form schema
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Signup form schema
export const signupSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

// Password reset schema
export const passwordResetSchema = z.object({
  password: passwordSchema,
  confirmPassword: passwordSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Types
export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type PasswordResetFormData = z.infer<typeof passwordResetSchema>;

// Validation helper that throws on error, returns data on success
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return result.data;
  }
  
  // Get first error message
  const firstError = result.error.errors[0];
  throw new Error(firstError?.message || 'Validation failed');
}
