import { getSettings } from "@/lib/settings";
import ExpensesPage from "./ExpensesPage";

export default async function Page() {
  const settings = await getSettings();
  return <ExpensesPage displayCurrency={settings.displayCurrency} />;
}
