import Workspace from "@/components/workspace";
import { isDemo } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Workspace demo={isDemo()} />;
}
