import { getSettings } from "@/lib/settings";
import TeamPage from "./TeamPage";

export default async function Page() {
  const settings = await getSettings();
  return <TeamPage displayCurrency={settings.displayCurrency} />;
}
