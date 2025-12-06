-- Fix security definer view warning
ALTER VIEW public.unreviewed_matches SET (security_invoker = true);