import { highlight } from "@/lib/search";

export function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : s.text))}
    </>
  );
}
