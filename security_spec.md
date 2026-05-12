# MonMonChu Security Specification

## 1. Data Invariants
- An expense must belong to the user who created it (`userId == request.auth.uid`).
- Recurring items must belong to the user (`userId == request.auth.uid`).
- Split projects can be read by anyone if they have the ID (standard for simple split apps), but only the creator can delete or manage members (or simplified: anyone with ID can edit items to allow collaboration).

## 2. Dirty Dozen Payloads
1. Create expense for another user. -> Denied.
2. Edit an expense's `userId`. -> Denied.
3. Inject massive string into `category`. -> Denied.
4. Set negative amount for expense (if logic forbids, here I'll allow positive only via code, but rules check types).
5. Modify `createdAt` of an expense. -> Denied (Immutable).
6. Create recurring item without `freq`. -> Denied.
7. Edit recurring item type from income to expense in a restricted state (if any).
8. Read another user's expenses without permission. -> Denied.
9. Delete a split project created by another user. -> Denied.
10. Add a field "isAdmin" to user profile. -> Denied.
11. Inject 1MB remark. -> Denied.
12. List all split projects. -> Denied (must query by specific ID or have membership).

## 3. Test Runner
(Placeholder for actual test file if needed, but I'll focus on the rules logic).
