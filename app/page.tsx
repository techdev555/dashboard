import Dashboard from "@/components/Dashboard";
import { loadDataset } from "@/lib/data";

export const dynamic = "force-static";

export default function Page() {
  return <Dashboard data={loadDataset()} />;
}
