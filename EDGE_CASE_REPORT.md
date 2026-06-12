# EDGE CASE REPORT - ClinicOS Acceptance Test (Post-Fixes)
**Role:** QA Lead / Stress Tester

## 1. Test Scenarios

| Scenario | Result | Status |
| :--- | :--- | :--- |
| **Duplicate Patient** | System gracefully blocked creation of a patient with same Name + Phone combination. | ✅ PASSED (Fixed) |
| **Duplicate Appointment** | System returned "Doctor is already booked for this time slot" when overlapping. | ✅ PASSED (Fixed) |
| **Missing Phone Number** | Patient saved successfully. | ✅ PASSED |
| **Invalid Email** | UI validator caught `test@abc` and prevented save. | ✅ PASSED |
| **Invalid Payment** | Entering alphabets in amount field was blocked. | ✅ PASSED |
| **Refund** | Fully supported in backend API. | ⚠️ PARTIAL |
| **Large File Upload** | 20MB PDF was rejected with clear error message. | ✅ PASSED |
| **Multiple Tabs** | Opened Patient A in Tab 1 and Patient B in Tab 2. No session bleeding. | ✅ PASSED |
| **Session Timeout** | Redirected to login after clearing token. | ✅ PASSED |

## 2. Summary of Failures
None of the critical failures remain. The scheduling conflicts and patient duplication flaws have been completely patched.

## 3. Recommended Fixes (Future)
1. Expose full Refund UI workflow for receptionists.
2. Add fuzzy search matching for patient registration.
