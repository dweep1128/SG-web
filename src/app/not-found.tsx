import Link from "next/link";
export default function NotFound() { return <div className="shell empty"><h1>Part not found.</h1><p>The part may have moved or is no longer listed.</p><Link className="btn btn-primary" href="/parts">Browse catalogue →</Link></div>; }
