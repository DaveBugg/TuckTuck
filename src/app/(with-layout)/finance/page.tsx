import { getSettings } from "@/lib/settings";
import FinanceDashboard from "./FinanceDashboard";

export default async function FinancePage() {
  const settings = await getSettings();
  return <FinanceDashboard displayCurrency={settings.displayCurrency} />;
}
