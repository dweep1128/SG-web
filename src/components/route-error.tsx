"use client";
import { useEffect } from "react";
import { Button, ButtonLink, EmptyState } from "./ui";

// Shared body for every route's error.tsx. Never shows error.message to shoppers (could leak internals).
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="shell page">
      <EmptyState
        title="Something went wrong"
        actions={
          <>
            <Button variant="primary" onClick={reset}>Try again</Button>
            <ButtonLink href="/">Go home</ButtonLink>
          </>
        }
      >
        We couldn&apos;t load this page. It&apos;s usually a brief connection issue. Please try again.
        {error.digest && <p className="mono" style={{ marginTop: 8, fontSize: 12 }}>Ref: {error.digest}</p>}
      </EmptyState>
    </div>
  );
}
