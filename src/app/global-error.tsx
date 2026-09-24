"use client";
// Last-resort boundary when the root layout itself fails. Must render its own <html>; keep it dependency-free.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>Please try again in a moment.</p>
        <button type="button" onClick={reset} style={{ marginTop: 16, padding: "10px 18px" }}>Try again</button>
      </body>
    </html>
  );
}
