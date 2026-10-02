-- Allow an authenticated user to submit a complete identity packet for manual review.
-- This does not let the user approve/reject a request or change roles.
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  valid_manual_submission BOOLEAN;
BEGIN
  -- SQL Editor/service role (sin auth.uid) y administradores son canales confiables.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.kyc_rejection_reason IS DISTINCT FROM OLD.kyc_rejection_reason
     OR NEW.kyc_data IS DISTINCT FROM OLD.kyc_data THEN
    valid_manual_submission :=
      NEW.verification_status = 'pending_review'
      AND NEW.kyc_data->>'consentGiven' = 'true'
      AND NEW.kyc_data->>'idFrontCaptured' = 'true'
      AND NEW.kyc_data->>'idBackCaptured' = 'true'
      AND NEW.kyc_data->>'photoCaptured' = 'true'
      AND NEW.kyc_data->>'criminalRecordSubmitted' = 'true'
      AND NULLIF(NEW.kyc_data->>'idFrontUrl', '') IS NOT NULL
      AND NULLIF(NEW.kyc_data->>'idBackUrl', '') IS NOT NULL
      AND NULLIF(NEW.kyc_data->>'photoUrl', '') IS NOT NULL
      AND NULLIF(NEW.kyc_data->>'criminalRecordUrl', '') IS NOT NULL
      AND NULLIF(NEW.kyc_data->>'submittedAt', '') IS NOT NULL;

    IF NOT COALESCE(valid_manual_submission, false) THEN
      RAISE EXCEPTION 'Solo un administrador puede modificar el estado o los datos KYC, excepto al enviar una solicitud completa para revisión manual';
    END IF;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT (
    OLD.role = 'tenant' AND NEW.role = 'owner'
    AND NEW.owner_terms_accepted IS TRUE
    AND NEW.owner_application_date IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cambio de rol no autorizado';
  END IF;

  IF NEW.owner_terms_accepted IS DISTINCT FROM OLD.owner_terms_accepted
     AND NEW.owner_terms_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'La aceptación de términos no se puede retirar';
  END IF;

  RETURN NEW;
END;
$$;
