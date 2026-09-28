import { PortalNav } from "@/components/sk-image/portal-nav";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PortalNav />
      {children}
    </>
  );
}
