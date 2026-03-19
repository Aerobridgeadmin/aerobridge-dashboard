-- Consolidate onboarding steps: 7 → 5
-- 1) Merge "Tech Onboarding" + "Access Provisioning" into "Tech & Access Setup"
-- 2) Remove "Onboarding Data Confirmed" (approval lives on email_form step now)
-- 3) Re-sort remaining steps

-- Step 1: If "Onboarding Data Confirmed" was completed but email_form step is still pending,
-- promote email_form to completed (the admin already approved)
UPDATE hriq_onboarding_steps AS target
SET status = 'completed',
    completed_at = source.completed_at,
    completed_by_user_id = source.completed_by_user_id,
    completed_by_name = source.completed_by_name
FROM hriq_onboarding_steps AS source
WHERE target.session_id = source.session_id
  AND target.step_type = 'email_form'
  AND target.status NOT IN ('completed', 'skipped')
  AND source.step_name = 'Onboarding Data Confirmed'
  AND source.status = 'completed';

-- Step 2: Delete "Onboarding Data Confirmed" steps
DELETE FROM hriq_onboarding_steps
WHERE step_name = 'Onboarding Data Confirmed';

-- Step 3: Merge Tech Onboarding + Access Provisioning
-- Keep "Tech Onboarding" row, rename it, inherit best status
-- If Access Provisioning is completed but Tech Onboarding isn't, promote
UPDATE hriq_onboarding_steps AS tech
SET status = ap.status,
    completed_at = ap.completed_at,
    completed_by_user_id = ap.completed_by_user_id,
    completed_by_name = ap.completed_by_name
FROM hriq_onboarding_steps AS ap
WHERE tech.session_id = ap.session_id
  AND tech.step_name = 'Tech Onboarding'
  AND tech.status != 'completed'
  AND ap.step_name = 'Access Provisioning'
  AND ap.status = 'completed';

-- Rename "Tech Onboarding" → "Tech & Access Setup"
UPDATE hriq_onboarding_steps
SET step_name = 'Tech & Access Setup'
WHERE step_name = 'Tech Onboarding';

-- Delete "Access Provisioning" rows (merged into Tech & Access Setup)
DELETE FROM hriq_onboarding_steps
WHERE step_name = 'Access Provisioning';

-- Step 4: Re-sort steps per session (0-based sequential)
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY sort_order, created_at) - 1 AS new_order
  FROM hriq_onboarding_steps
)
UPDATE hriq_onboarding_steps
SET sort_order = ordered.new_order
FROM ordered
WHERE hriq_onboarding_steps.id = ordered.id
  AND hriq_onboarding_steps.sort_order != ordered.new_order;
