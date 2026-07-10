---
name: Clerk react signal-based hooks vs legacy API
description: Why a custom sign-up/sign-in flow can hang forever on isLoaded, and how to fix it in current @clerk/react versions.
---

`@clerk/react` (6.x) changed the top-level `useSignIn`/`useSignUp` hooks to a new
signal-based API: `const { signUp, errors, fetchStatus } = useSignUp()`. There is
no `isLoaded` or `setActive` on this return value — they are `undefined` forever.

**Why:** any custom flow written against the classic API
(`const { isLoaded, signUp, setActive } = useSignUp()`) will silently hang: a
guard like `if (!isLoaded) return <Spinner/>` never resolves because `isLoaded`
is `undefined`, not `false`. This produces an infinite loading spinner with no
console errors, for every user (not an auth-state-specific bug), which makes it
easy to mistake for an environment/test-mocking problem.

**How to apply:** `@clerk/react` ships a `/legacy` subpath export
(`@clerk/react/legacy`) that still provides the classic
`useSignIn`/`useSignUp` hooks with `{ isLoaded, signIn/signUp, setActive }`.
When building or debugging a custom Clerk auth flow (not the prebuilt
`<SignIn/>`/`<SignUp/>` components), import these hooks from
`@clerk/react/legacy` instead of `@clerk/react`. `useUser`/`useAuth`/`useClerk`
are unaffected and remain on the main entrypoint.
