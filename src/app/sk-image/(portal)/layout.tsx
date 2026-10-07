import { PortalNav } from "@/components/sk-image/portal-nav";
import { currentRole } from "@/lib/supabase-server";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  return (
    <>
      <PortalNav role={role} />
      {children}
    </>
  );
}
