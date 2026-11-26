## Summary
<!-- Describe what this change does and why -->

## Assessment / Issue Reference
<!-- e.g., Assessment 07 - Appointment Workflow -->

## Change Category
- [ ] Frontend UI / Role Dashboard
- [ ] Backend API / Business Logic
- [ ] Database Schema / Migration
- [ ] Access Control / Security / Consent
- [ ] Clinical Workflow (Encounters, Diagnoses, Prescriptions, Labs)
- [ ] Python Analytics
- [ ] Infrastructure / CI/CD / Docs

## Clinical & Security Review Checklist
- [ ] Synthetic data only — no real patient, financial, or personal data included
- [ ] Authorization enforced server-side (RBAC + resource ownership + consent checks)
- [ ] Audit logging added for sensitive clinical/security operations
- [ ] Database migrations reviewed for backward compatibility & constraints
- [ ] Tests added/updated for success, validation, authorization, and failure paths
- [ ] Documentation updated (`docs/` and Swagger JSDoc)
